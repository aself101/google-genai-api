/**
 * Google GenAI Veo Video Generation API
 *
 * Video generation capabilities using Google's Veo models.
 *
 * Supports:
 * - Text-to-video generation
 * - Image-to-video generation
 * - Reference images for content guidance (Veo 3.1)
 * - Frame interpolation (first/last frame) (Veo 3.1)
 * - Video extension (Veo 3.1)
 *
 * @module veo-api
 */

import { GoogleGenAI } from '@google/genai';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';
import {
  VEO_MODELS,
  VEO_MODES,
  VEO_TIMEOUTS,
  VEO_MODEL_CONSTRAINTS,
  getGoogleGenAIApiKey,
  redactApiKey,
  validateVeoParams
} from './config.js';

/**
 * Google GenAI Veo Video Generation API client.
 * Provides video generation capabilities using Veo models.
 *
 * @class GoogleGenAIVeoAPI
 *
 * @example
 * const api = new GoogleGenAIVeoAPI(apiKey);
 * let operation = await api.generateVideo({
 *   prompt: 'A cat playing in the garden'
 * });
 * operation = await api.waitForCompletion(operation);
 * await api.downloadVideo(operation, './output.mp4');
 */
export class GoogleGenAIVeoAPI {
  /**
   * Create a new GoogleGenAIVeoAPI instance.
   *
   * @param {string} apiKey - Google GenAI API key
   * @param {string} [logLevel='info'] - Logging level (debug, info, warn, error)
   * @throws {Error} If API key is not provided
   */
  constructor(apiKey, logLevel = 'info') {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = VEO_MODELS.VEO_3_1;

    // Configure logger
    this.logger = winston.createLogger({
      level: logLevel.toLowerCase(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - ${level.toUpperCase()} - [VeoAPI] ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console()
      ]
    });

    this.logger.debug(`GoogleGenAIVeoAPI initialized (key: ${redactApiKey(apiKey)})`);
  }

  /**
   * Verify API key is set.
   * @private
   * @throws {Error} If API key is missing
   */
  _verifyApiKey() {
    if (!this.apiKey) {
      throw new Error('API key is not set. Please provide a valid API key.');
    }
  }

  /**
   * Classify error type for handling.
   *
   * @private
   * @param {Error} error - Error to classify
   * @returns {'TRANSIENT'|'PERMANENT'|'USER_ACTIONABLE'|'SAFETY_BLOCKED'|'AUDIO_BLOCKED'} Error classification
   */
  _classifyError(error) {
    const status = error.response?.status || error.status;
    const message = error.message?.toLowerCase() || '';

    // Safety/content blocks
    if (message.includes('safety') || message.includes('blocked') || message.includes('policy')) {
      if (message.includes('audio')) {
        return 'AUDIO_BLOCKED';
      }
      return 'SAFETY_BLOCKED';
    }

    // User-actionable errors
    if (!this.apiKey || message.includes('api key')) {
      return 'USER_ACTIONABLE';
    }
    if (status === 404 || message.includes('not found')) {
      return 'USER_ACTIONABLE';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'USER_ACTIONABLE';
    }

    // Permanent errors
    if (status === 400 || status === 401 || status === 403 || status === 422) {
      return 'PERMANENT';
    }

    // Transient errors (retry-able)
    if (status === 429 || status === 502 || status === 503) {
      return 'TRANSIENT';
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('econnreset')) {
      return 'TRANSIENT';
    }

    return 'PERMANENT';
  }

  /**
   * Sanitize error messages for production mode.
   *
   * @private
   * @param {Error} error - Error to sanitize
   * @returns {Error} Sanitized error
   */
  _sanitizeError(error) {
    if (process.env.NODE_ENV === 'production') {
      const classification = this._classifyError(error);
      switch (classification) {
        case 'TRANSIENT':
          return new Error('A temporary error occurred. Please try again.');
        case 'SAFETY_BLOCKED':
          return new Error('Video generation was blocked due to content safety policies.');
        case 'AUDIO_BLOCKED':
          return new Error('Video generation was blocked due to audio processing issues.');
        case 'PERMANENT':
          return new Error('The request could not be completed. Please check your inputs.');
        default:
          return new Error('An error occurred. Please check your configuration.');
      }
    }
    return error;
  }

  /**
   * Generate a video from text prompt (text-to-video).
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of the video to generate
   * @param {string} [params.negativePrompt] - What to avoid in the video
   * @param {string} [params.aspectRatio='16:9'] - Aspect ratio (16:9 or 9:16)
   * @param {string} [params.resolution='720p'] - Resolution (720p or 1080p)
   * @param {string} [params.durationSeconds='8'] - Duration (4, 5, 6, or 8 seconds)
   * @param {string} [params.personGeneration] - Person generation setting
   * @param {number} [params.seed] - Seed for reproducibility (Veo 3 only)
   * @param {string} [params.model] - Veo model to use
   * @returns {Promise<Object>} Operation object to poll for completion
   * @throws {Error} If validation fails or API call fails
   *
   * @example
   * const operation = await api.generateVideo({
   *   prompt: 'A majestic lion walking through the savannah',
   *   aspectRatio: '16:9',
   *   durationSeconds: '8'
   * });
   */
  async generateVideo(params) {
    this._verifyApiKey();

    const model = params.model || this.defaultModel;

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.TEXT_TO_VIDEO);

    this.logger.info(`Starting text-to-video generation with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config object
    const config = {};
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = Number(params.durationSeconds);
    if (params.personGeneration) config.personGeneration = params.personGeneration;
    if (params.seed !== undefined) config.seed = params.seed;

    try {
      const operation = await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      this.logger.info(`Video generation started (operation: ${operation.name})`);
      this.logger.debug(`Operation: ${JSON.stringify(operation, null, 2)}`);

      return operation;
    } catch (error) {
      const errorType = this._classifyError(error);
      this.logger.error(`Generation failed (${errorType}): ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Generate a video from an image (image-to-video).
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of the video to generate
   * @param {Object} params.image - Image to animate
   * @param {string} params.image.imageBytes - Base64-encoded image data
   * @param {string} params.image.mimeType - Image MIME type (image/png, image/jpeg, etc.)
   * @param {string} [params.negativePrompt] - What to avoid in the video
   * @param {string} [params.aspectRatio='16:9'] - Aspect ratio
   * @param {string} [params.resolution='720p'] - Resolution
   * @param {string} [params.durationSeconds='8'] - Duration
   * @param {string} [params.personGeneration] - Person generation setting
   * @param {string} [params.model] - Veo model to use
   * @returns {Promise<Object>} Operation object to poll for completion
   * @throws {Error} If validation fails or API call fails
   *
   * @example
   * const operation = await api.generateFromImage({
   *   prompt: 'A cat waking up and stretching',
   *   image: {
   *     imageBytes: base64ImageData,
   *     mimeType: 'image/png'
   *   }
   * });
   */
  async generateFromImage(params) {
    this._verifyApiKey();

    const model = params.model || this.defaultModel;

    // Validate image object
    if (!params.image) {
      throw new Error('image object is required for image-to-video generation');
    }
    if (!params.image.imageBytes) {
      throw new Error('image.imageBytes is required');
    }
    if (!params.image.mimeType) {
      throw new Error('image.mimeType is required');
    }

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.IMAGE_TO_VIDEO);

    this.logger.info(`Starting image-to-video generation with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config object
    const config = {};
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = Number(params.durationSeconds);
    if (params.personGeneration) config.personGeneration = params.personGeneration;

    try {
      const operation = await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        image: params.image,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      this.logger.info(`Image-to-video generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const errorType = this._classifyError(error);
      this.logger.error(`Generation failed (${errorType}): ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Generate a video using reference images for content guidance (Veo 3.1 only).
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of the video
   * @param {Array<Object>} params.referenceImages - 1-3 reference images
   * @param {Object} params.referenceImages[].image - Image object with imageBytes and mimeType
   * @param {string} params.referenceImages[].referenceType - Type: 'asset' for objects/styles
   * @param {string} [params.negativePrompt] - What to avoid
   * @param {string} [params.aspectRatio='16:9'] - Aspect ratio
   * @param {string} [params.model] - Veo 3.1 model (required)
   * @returns {Promise<Object>} Operation object to poll for completion
   * @throws {Error} If validation fails or model doesn't support reference images
   *
   * @example
   * const operation = await api.generateWithReferences({
   *   prompt: 'A woman walking on the beach wearing a flamingo dress',
   *   referenceImages: [
   *     { image: { imageBytes: dressImage, mimeType: 'image/png' }, referenceType: 'asset' },
   *     { image: { imageBytes: womanImage, mimeType: 'image/png' }, referenceType: 'asset' }
   *   ]
   * });
   */
  async generateWithReferences(params) {
    this._verifyApiKey();

    const model = params.model || this.defaultModel;

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.REFERENCE_IMAGES);

    this.logger.info(`Starting reference-images generation with ${model} (${params.referenceImages.length} references)`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config with reference images
    // Duration must be 8 for reference images
    const config = {
      durationSeconds: 8,
      referenceImages: params.referenceImages.map(ref => ({
        image: ref.image,
        referenceType: ref.referenceType
      }))
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    try {
      const operation = await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        config
      });

      this.logger.info(`Reference-images generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const errorType = this._classifyError(error);
      this.logger.error(`Generation failed (${errorType}): ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Generate a video by interpolating between first and last frames (Veo 3.1 only).
   *
   * @param {Object} params - Generation parameters
   * @param {string} [params.prompt] - Text description (optional for interpolation)
   * @param {Object} params.firstFrame - First frame image
   * @param {string} params.firstFrame.imageBytes - Base64-encoded image data
   * @param {string} params.firstFrame.mimeType - Image MIME type
   * @param {Object} params.lastFrame - Last frame image
   * @param {string} params.lastFrame.imageBytes - Base64-encoded image data
   * @param {string} params.lastFrame.mimeType - Image MIME type
   * @param {string} [params.negativePrompt] - What to avoid
   * @param {string} [params.aspectRatio='16:9'] - Aspect ratio
   * @param {string} [params.model] - Veo 3.1 model (required)
   * @returns {Promise<Object>} Operation object to poll for completion
   * @throws {Error} If validation fails or model doesn't support interpolation
   *
   * @example
   * const operation = await api.generateWithInterpolation({
   *   prompt: 'A ghost fading away from a swing',
   *   firstFrame: { imageBytes: startImage, mimeType: 'image/png' },
   *   lastFrame: { imageBytes: endImage, mimeType: 'image/png' }
   * });
   */
  async generateWithInterpolation(params) {
    this._verifyApiKey();

    const model = params.model || this.defaultModel;

    // Validate frame images
    if (!params.firstFrame || !params.firstFrame.imageBytes || !params.firstFrame.mimeType) {
      throw new Error('firstFrame with imageBytes and mimeType is required');
    }
    if (!params.lastFrame || !params.lastFrame.imageBytes || !params.lastFrame.mimeType) {
      throw new Error('lastFrame with imageBytes and mimeType is required');
    }

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.INTERPOLATION);

    this.logger.info(`Starting interpolation generation with ${model}`);
    if (params.prompt) {
      this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);
    }

    // Build config with last frame
    // Duration must be 8 for interpolation
    const config = {
      durationSeconds: 8,
      lastFrame: params.lastFrame
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    try {
      const operation = await this.client.models.generateVideos({
        model,
        prompt: params.prompt || '',
        image: params.firstFrame,
        config
      });

      this.logger.info(`Interpolation generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const errorType = this._classifyError(error);
      this.logger.error(`Generation failed (${errorType}): ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Extend a previously generated Veo video (Veo 3.1 only).
   * Each extension adds approximately 7 seconds, up to 20 extensions.
   *
   * @param {Object} params - Extension parameters
   * @param {string} params.prompt - Text description for the extension
   * @param {Object} params.video - Video object from a previous generation
   * @param {string} [params.negativePrompt] - What to avoid
   * @param {string} [params.model] - Veo 3.1 model (required)
   * @returns {Promise<Object>} Operation object to poll for completion
   * @throws {Error} If validation fails or model doesn't support extension
   *
   * @example
   * // First, generate initial video
   * let operation = await api.generateVideo({ prompt: 'A butterfly in a garden' });
   * operation = await api.waitForCompletion(operation);
   *
   * // Then extend it
   * const extendOp = await api.extendVideo({
   *   prompt: 'The butterfly lands on a flower and a puppy runs up',
   *   video: operation.response.generatedVideos[0].video
   * });
   */
  async extendVideo(params) {
    this._verifyApiKey();

    const model = params.model || this.defaultModel;

    // Validate video object
    if (!params.video) {
      throw new Error('video object from a previous Veo generation is required');
    }

    // Validate parameters (extension requires 720p)
    validateVeoParams(model, { ...params, resolution: '720p' }, VEO_MODES.EXTENSION);

    this.logger.info(`Starting video extension with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config for extension
    // Resolution must be 720p, numberOfVideos is 1
    const config = {
      numberOfVideos: 1,
      resolution: '720p'
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;

    try {
      const operation = await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        video: params.video,
        config
      });

      this.logger.info(`Video extension started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const errorType = this._classifyError(error);
      this.logger.error(`Extension failed (${errorType}): ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Wait for a video generation operation to complete.
   * Polls the operation status until done or timeout.
   *
   * @param {Object} operation - Operation object from generation methods
   * @param {Object} [options] - Polling options
   * @param {number} [options.maxAttempts] - Maximum polling attempts (default: VEO_TIMEOUTS.POLL_MAX_ATTEMPTS)
   * @param {number} [options.intervalMs] - Polling interval in ms (default: VEO_TIMEOUTS.POLL_INTERVAL)
   * @param {Function} [options.onProgress] - Callback for progress updates: (operation, elapsedMs) => void
   * @returns {Promise<Object>} Completed operation with response
   * @throws {Error} If operation fails or times out
   *
   * @example
   * const operation = await api.generateVideo({ prompt: '...' });
   * const completed = await api.waitForCompletion(operation, {
   *   onProgress: (op, elapsed) => console.log(`Waiting... ${elapsed/1000}s`)
   * });
   */
  async waitForCompletion(operation, options = {}) {
    const {
      maxAttempts = VEO_TIMEOUTS.POLL_MAX_ATTEMPTS,
      intervalMs = VEO_TIMEOUTS.POLL_INTERVAL,
      onProgress
    } = options;

    // Return immediately if already done
    if (operation.done) {
      this.logger.debug('Operation already complete');
      return operation;
    }

    let attempts = 0;
    const startTime = Date.now();

    this.logger.info('Waiting for video generation to complete...');

    while (attempts < maxAttempts) {
      attempts++;
      const elapsedMs = Date.now() - startTime;

      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      try {
        // Refresh operation status
        operation = await this.client.operations.getVideosOperation({
          operation
        });

        this.logger.debug(`Poll attempt ${attempts}/${maxAttempts} (${(elapsedMs / 1000).toFixed(0)}s elapsed)`);

        // Call progress callback if provided
        if (onProgress) {
          onProgress(operation, elapsedMs);
        }

        // Check if done
        if (operation.done) {
          const totalTime = (Date.now() - startTime) / 1000;
          this.logger.info(`Video generation completed in ${totalTime.toFixed(1)}s`);

          // Check for error in response
          if (operation.error) {
            const error = new Error(operation.error.message || 'Video generation failed');
            error.operationError = operation.error;
            throw error;
          }

          return operation;
        }
      } catch (error) {
        // Handle transient errors with retry
        const errorType = this._classifyError(error);
        if (errorType === 'TRANSIENT' && attempts < maxAttempts) {
          this.logger.warn(`Transient error, retrying: ${error.message}`);
          continue;
        }
        throw this._sanitizeError(error);
      }
    }

    // Timeout
    const totalTime = (Date.now() - startTime) / 1000;
    const error = new Error(
      `Video generation timed out after ${totalTime.toFixed(0)}s (${maxAttempts} attempts). ` +
      `The operation may still be processing. Operation: ${operation.name}`
    );
    error.isTimeout = true;
    error.operationName = operation.name;
    throw error;
  }

  /**
   * Download a generated video to a file.
   *
   * @param {Object} operation - Completed operation object
   * @param {string} outputPath - Path to save the video file
   * @returns {Promise<{path: string, video: Object}>} Download result
   * @throws {Error} If operation is not complete or download fails
   *
   * @example
   * const completed = await api.waitForCompletion(operation);
   * const result = await api.downloadVideo(completed, './output.mp4');
   * console.log(`Video saved to: ${result.path}`);
   */
  async downloadVideo(operation, outputPath) {
    // Validate operation is complete
    if (!operation.done) {
      throw new Error('Cannot download video: operation is not complete. Call waitForCompletion() first.');
    }

    // Validate response has video
    if (!operation.response?.generatedVideos?.[0]?.video) {
      throw new Error('No video found in operation response');
    }

    const video = operation.response.generatedVideos[0].video;

    this.logger.info(`Downloading video to: ${outputPath}`);

    try {
      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });

      // Download video using client
      await this.client.files.download({
        file: video,
        downloadPath: outputPath
      });

      this.logger.info(`Video downloaded successfully: ${outputPath}`);

      return {
        path: outputPath,
        video
      };
    } catch (error) {
      this.logger.error(`Download failed: ${error.message}`);
      throw this._sanitizeError(error);
    }
  }

  /**
   * Extract the video object from a completed operation.
   * Useful for video extension.
   *
   * @param {Object} operation - Completed operation object
   * @returns {{video: Object, hasAudio: boolean}} Extracted video info
   * @throws {Error} If operation is not complete or has no video
   *
   * @example
   * const completed = await api.waitForCompletion(operation);
   * const { video } = api.extractVideo(completed);
   * // Use video for extension
   * await api.extendVideo({ prompt: '...', video });
   */
  extractVideo(operation) {
    if (!operation.done) {
      throw new Error('Cannot extract video: operation is not complete');
    }

    if (!operation.response?.generatedVideos?.[0]?.video) {
      throw new Error('No video found in operation response');
    }

    const generatedVideo = operation.response.generatedVideos[0];
    const model = operation.metadata?.model || this.defaultModel;
    const constraints = VEO_MODEL_CONSTRAINTS[model];
    const hasAudio = constraints?.features?.nativeAudio ?? true;

    return {
      video: generatedVideo.video,
      hasAudio
    };
  }

  /**
   * Set the logging level.
   *
   * @param {string} level - Log level (debug, info, warn, error)
   */
  setLogLevel(level) {
    this.logger.level = level.toLowerCase();
  }

  /**
   * Get model information and constraints.
   *
   * @param {string} [model] - Model name (defaults to current default model)
   * @returns {Object} Model constraints and features
   */
  getModelInfo(model) {
    const modelId = model || this.defaultModel;
    const constraints = VEO_MODEL_CONSTRAINTS[modelId];

    if (!constraints) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    return {
      model: modelId,
      ...constraints
    };
  }
}

// Re-export config functions for convenience
export { getGoogleGenAIApiKey, VEO_MODELS, VEO_MODES, VEO_TIMEOUTS };
