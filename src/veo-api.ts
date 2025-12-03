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
  validateVeoParams,
} from './config.js';
import type {
  ErrorClassification,
  VeoDownloadResult,
  VeoExtendParams,
  VeoExtractedVideo,
  VeoGenerateParams,
  VeoImageToVideoParams,
  VeoInterpolationParams,
  VeoModel,
  VeoModelInfo,
  VeoOperation,
  VeoReferenceParams,
  VeoWaitOptions,
} from './types/index.js';

/**
 * Extended error with additional properties.
 */
interface ExtendedError extends Error {
  response?: { status?: number };
  status?: number;
  isTimeout?: boolean;
  operationName?: string;
  operationError?: { message?: string; code?: number };
}

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
  private apiKey: string;
  private client: GoogleGenAI;
  private defaultModel: VeoModel;
  private logger: winston.Logger;

  /**
   * Create a new GoogleGenAIVeoAPI instance.
   *
   * @param apiKey - Google GenAI API key
   * @param logLevel - Logging level (debug, info, warn, error)
   * @throws Error if API key is not provided
   */
  constructor(apiKey: string, logLevel = 'info') {
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
      transports: [new winston.transports.Console()],
    });

    this.logger.debug(`GoogleGenAIVeoAPI initialized (key: ${redactApiKey(apiKey)})`);
  }

  /**
   * Verify API key is set.
   * @private
   * @throws Error if API key is missing
   */
  private _verifyApiKey(): void {
    if (!this.apiKey) {
      throw new Error('API key is not set. Please provide a valid API key.');
    }
  }

  /**
   * Classify error type for handling.
   *
   * @private
   * @param error - Error to classify
   * @returns Error classification
   */
  private _classifyError(error: ExtendedError): ErrorClassification {
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
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset')
    ) {
      return 'TRANSIENT';
    }

    return 'PERMANENT';
  }

  /**
   * Sanitize error messages for production mode.
   *
   * @private
   * @param error - Error to sanitize
   * @returns Sanitized error
   */
  private _sanitizeError(error: ExtendedError): Error {
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
   * @param params - Generation parameters
   * @returns Operation object to poll for completion
   * @throws Error if validation fails or API call fails
   *
   * @example
   * const operation = await api.generateVideo({
   *   prompt: 'A majestic lion walking through the savannah',
   *   aspectRatio: '16:9',
   *   durationSeconds: '8'
   * });
   */
  async generateVideo(params: VeoGenerateParams): Promise<VeoOperation> {
    this._verifyApiKey();

    const model = (params.model || this.defaultModel) as VeoModel;

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.TEXT_TO_VIDEO);

    this.logger.info(`Starting text-to-video generation with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config object
    const config: Record<string, unknown> = {};
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = Number(params.durationSeconds);
    if (params.personGeneration) config.personGeneration = params.personGeneration;
    if (params.seed !== undefined) config.seed = params.seed;

    try {
      const operation = (await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      })) as unknown as VeoOperation;

      this.logger.info(`Video generation started (operation: ${operation.name})`);
      this.logger.debug(`Operation: ${JSON.stringify(operation, null, 2)}`);

      return operation;
    } catch (error) {
      const err = error as ExtendedError;
      const errorType = this._classifyError(err);
      this.logger.error(`Generation failed (${errorType}): ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Generate a video from an image (image-to-video).
   *
   * @param params - Generation parameters
   * @returns Operation object to poll for completion
   * @throws Error if validation fails or API call fails
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
  async generateFromImage(params: VeoImageToVideoParams): Promise<VeoOperation> {
    this._verifyApiKey();

    const model = (params.model || this.defaultModel) as VeoModel;

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
    const config: Record<string, unknown> = {};
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = Number(params.durationSeconds);
    if (params.personGeneration) config.personGeneration = params.personGeneration;

    try {
      const operation = (await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        image: params.image,
        config: Object.keys(config).length > 0 ? config : undefined,
      })) as unknown as VeoOperation;

      this.logger.info(`Image-to-video generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const err = error as ExtendedError;
      const errorType = this._classifyError(err);
      this.logger.error(`Generation failed (${errorType}): ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Generate a video using reference images for content guidance (Veo 3.1 only).
   *
   * @param params - Generation parameters
   * @returns Operation object to poll for completion
   * @throws Error if validation fails or model doesn't support reference images
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
  async generateWithReferences(params: VeoReferenceParams): Promise<VeoOperation> {
    this._verifyApiKey();

    const model = (params.model || this.defaultModel) as VeoModel;

    // Validate parameters
    validateVeoParams(model, params, VEO_MODES.REFERENCE_IMAGES);

    this.logger.info(
      `Starting reference-images generation with ${model} (${params.referenceImages.length} references)`
    );
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Build config with reference images
    // Duration must be 8 for reference images
    const config: Record<string, unknown> = {
      durationSeconds: 8,
      referenceImages: params.referenceImages.map((ref) => ({
        image: ref.image,
        referenceType: ref.referenceType,
      })),
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    try {
      const operation = (await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        config,
      })) as unknown as VeoOperation;

      this.logger.info(`Reference-images generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const err = error as ExtendedError;
      const errorType = this._classifyError(err);
      this.logger.error(`Generation failed (${errorType}): ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Generate a video by interpolating between first and last frames (Veo 3.1 only).
   *
   * @param params - Generation parameters
   * @returns Operation object to poll for completion
   * @throws Error if validation fails or model doesn't support interpolation
   *
   * @example
   * const operation = await api.generateWithInterpolation({
   *   prompt: 'A ghost fading away from a swing',
   *   firstFrame: { imageBytes: startImage, mimeType: 'image/png' },
   *   lastFrame: { imageBytes: endImage, mimeType: 'image/png' }
   * });
   */
  async generateWithInterpolation(params: VeoInterpolationParams): Promise<VeoOperation> {
    this._verifyApiKey();

    const model = (params.model || this.defaultModel) as VeoModel;

    // Validate frame images
    if (!params.firstFrame || !params.firstFrame.imageBytes || !params.firstFrame.mimeType) {
      throw new Error('firstFrame with imageBytes and mimeType is required');
    }
    if (!params.lastFrame || !params.lastFrame.imageBytes || !params.lastFrame.mimeType) {
      throw new Error('lastFrame with imageBytes and mimeType is required');
    }

    // Validate parameters
    validateVeoParams(model, params as unknown as VeoGenerateParams, VEO_MODES.INTERPOLATION);

    this.logger.info(`Starting interpolation generation with ${model}`);
    if (params.prompt) {
      this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);
    }

    // Build config with last frame
    // Duration must be 8 for interpolation
    const config: Record<string, unknown> = {
      durationSeconds: 8,
      lastFrame: params.lastFrame,
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    try {
      const operation = (await this.client.models.generateVideos({
        model,
        prompt: params.prompt || '',
        image: params.firstFrame,
        config,
      })) as unknown as VeoOperation;

      this.logger.info(`Interpolation generation started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const err = error as ExtendedError;
      const errorType = this._classifyError(err);
      this.logger.error(`Generation failed (${errorType}): ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Extend a previously generated Veo video (Veo 3.1 only).
   * Each extension adds approximately 7 seconds, up to 20 extensions.
   *
   * @param params - Extension parameters
   * @returns Operation object to poll for completion
   * @throws Error if validation fails or model doesn't support extension
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
  async extendVideo(params: VeoExtendParams): Promise<VeoOperation> {
    this._verifyApiKey();

    const model = (params.model || this.defaultModel) as VeoModel;

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
    const config: Record<string, unknown> = {
      numberOfVideos: 1,
      resolution: '720p',
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;

    try {
      const operation = (await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        video: params.video,
        config,
      })) as unknown as VeoOperation;

      this.logger.info(`Video extension started (operation: ${operation.name})`);

      return operation;
    } catch (error) {
      const err = error as ExtendedError;
      const errorType = this._classifyError(err);
      this.logger.error(`Extension failed (${errorType}): ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Wait for a video generation operation to complete.
   * Polls the operation status until done or timeout.
   *
   * @param operation - Operation object from generation methods
   * @param options - Polling options
   * @returns Completed operation with response
   * @throws Error if operation fails or times out
   *
   * @example
   * const operation = await api.generateVideo({ prompt: '...' });
   * const completed = await api.waitForCompletion(operation, {
   *   onProgress: (op, elapsed) => console.log(`Waiting... ${elapsed/1000}s`)
   * });
   */
  async waitForCompletion(
    operation: VeoOperation,
    options: VeoWaitOptions = {}
  ): Promise<VeoOperation> {
    const {
      maxAttempts = VEO_TIMEOUTS.POLL_MAX_ATTEMPTS,
      intervalMs = VEO_TIMEOUTS.POLL_INTERVAL,
      onProgress,
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
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      try {
        // Refresh operation status
        // SDK types differ from our simplified VeoOperation interface
        operation = (await this.client.operations.getVideosOperation({
          operation: operation as unknown as Parameters<typeof this.client.operations.getVideosOperation>[0]['operation'],
        })) as unknown as VeoOperation;

        this.logger.debug(
          `Poll attempt ${attempts}/${maxAttempts} (${(elapsedMs / 1000).toFixed(0)}s elapsed)`
        );

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
            const error = new Error(
              operation.error.message || 'Video generation failed'
            ) as ExtendedError;
            error.operationError = operation.error;
            throw error;
          }

          return operation;
        }
      } catch (error) {
        const err = error as ExtendedError;
        // Handle transient errors with retry
        const errorType = this._classifyError(err);
        if (errorType === 'TRANSIENT' && attempts < maxAttempts) {
          this.logger.warn(`Transient error, retrying: ${err.message}`);
          continue;
        }
        throw this._sanitizeError(err);
      }
    }

    // Timeout
    const totalTime = (Date.now() - startTime) / 1000;
    const error = new Error(
      `Video generation timed out after ${totalTime.toFixed(0)}s (${maxAttempts} attempts). ` +
        `The operation may still be processing. Operation: ${operation.name}`
    ) as ExtendedError;
    error.isTimeout = true;
    error.operationName = operation.name;
    throw error;
  }

  /**
   * Download a generated video to a file.
   *
   * @param operation - Completed operation object
   * @param outputPath - Path to save the video file
   * @returns Download result
   * @throws Error if operation is not complete or download fails
   *
   * @example
   * const completed = await api.waitForCompletion(operation);
   * const result = await api.downloadVideo(completed, './output.mp4');
   * console.log(`Video saved to: ${result.path}`);
   */
  async downloadVideo(operation: VeoOperation, outputPath: string): Promise<VeoDownloadResult> {
    // Validate operation is complete
    if (!operation.done) {
      throw new Error(
        'Cannot download video: operation is not complete. Call waitForCompletion() first.'
      );
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
        downloadPath: outputPath,
      });

      this.logger.info(`Video downloaded successfully: ${outputPath}`);

      return {
        path: outputPath,
        video,
      };
    } catch (error) {
      const err = error as ExtendedError;
      this.logger.error(`Download failed: ${err.message}`);
      throw this._sanitizeError(err);
    }
  }

  /**
   * Extract the video object from a completed operation.
   * Useful for video extension.
   *
   * @param operation - Completed operation object
   * @returns Extracted video info
   * @throws Error if operation is not complete or has no video
   *
   * @example
   * const completed = await api.waitForCompletion(operation);
   * const { video } = api.extractVideo(completed);
   * // Use video for extension
   * await api.extendVideo({ prompt: '...', video });
   */
  extractVideo(operation: VeoOperation): VeoExtractedVideo {
    if (!operation.done) {
      throw new Error('Cannot extract video: operation is not complete');
    }

    if (!operation.response?.generatedVideos?.[0]?.video) {
      throw new Error('No video found in operation response');
    }

    const generatedVideo = operation.response.generatedVideos[0];
    const model = (operation.metadata?.model as VeoModel) || this.defaultModel;
    const constraints = VEO_MODEL_CONSTRAINTS[model];
    const hasAudio = constraints?.features?.nativeAudio ?? true;

    return {
      video: generatedVideo.video,
      hasAudio,
    };
  }

  /**
   * Set the logging level.
   *
   * @param level - Log level (debug, info, warn, error)
   */
  setLogLevel(level: string): void {
    this.logger.level = level.toLowerCase();
  }

  /**
   * Get model information and constraints.
   *
   * @param model - Model name (defaults to current default model)
   * @returns Model constraints and features
   */
  getModelInfo(model?: string): VeoModelInfo {
    const modelId = (model || this.defaultModel) as VeoModel;
    const constraints = VEO_MODEL_CONSTRAINTS[modelId];

    if (!constraints) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    return {
      model: modelId,
      ...constraints,
    };
  }
}

// Re-export config functions for convenience
export { getGoogleGenAIApiKey, VEO_MODELS, VEO_MODES, VEO_TIMEOUTS };
