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

import { GenerateVideosOperation, GoogleGenAI } from '@google/genai';
import type { GenerateVideosConfig, GenerateVideosSource, VideoGenerationReferenceType } from '@google/genai';
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
  getVeoViolations,
} from './config.js';
import { ValidationError, errorMessage, toPublicError } from './errors.js';
import type {
  GoogleGenAIClientOptions,
  VeoDownloadResult,
  VeoExtendParams,
  VeoExtractedVideo,
  VeoGenerateParams,
  VeoImageToVideoParams,
  VeoMode,
  VeoInterpolationParams,
  VeoModel,
  VeoModelInfo,
  VeoOperation,
  VeoReferenceParams,
  VeoWaitOptions,
} from './types/index.js';

/**
 * SDK operation → `VeoOperation`, checked rather than cast: the SDK declares
 * every field optional, `VeoOperation` requires `name` and `done`.
 */
function isVeoOperation(op: GenerateVideosOperation): op is GenerateVideosOperation & VeoOperation {
  return typeof op.name === 'string' && op.name !== '' && typeof op.done === 'boolean';
}

function toVeoOperation(op: GenerateVideosOperation, polledName?: string): VeoOperation {
  // A polled operation keeps the name it was polled by; a just-submitted one can
  // omit `done` (the job is running).
  if (!op.name && polledName) op.name = polledName;
  if (op.done === undefined) op.done = false;
  if (!isVeoOperation(op)) {
    throw new Error('Veo returned an operation without a name; it cannot be polled.');
  }
  return op;
}

/**
 * `VeoOperation` → an SDK operation to poll. The SDK's getVideosOperation calls
 * `operation._fromAPIResponse()`, a method of its own class, so a plain object —
 * `{ name, done: false }` rebuilt from a saved operation name — would throw
 * inside the SDK. 1.x cast here and had that crash.
 */
function toSdkOperation(op: VeoOperation): GenerateVideosOperation {
  if (op instanceof GenerateVideosOperation) return op;
  const sdkOp = new GenerateVideosOperation();
  sdkOp.name = op.name;
  return sdkOp;
}

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
  private capabilityValidation: 'error' | 'warn';
  /** Unknown model ids already warned about by this instance (spec D3: once per id). */
  private warnedUnknownModels = new Set<string>();

  /**
   * Create a new GoogleGenAIVeoAPI instance.
   *
   * @param apiKey - Google GenAI API key
   * @param logLevel - Logging level (debug, info, warn, error)
   * @param options - `capabilityValidation: 'warn'` to log, not throw, when a
   *   known model's constraint table rejects a parameter
   * @throws Error if API key is not provided
   */
  constructor(apiKey: string, logLevel = 'info', options: GoogleGenAIClientOptions = {}) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = apiKey;
    // Pinned to the Gemini Developer API (spec D5; see api.ts).
    this.client = new GoogleGenAI({ apiKey, vertexai: false });
    this.defaultModel = VEO_MODELS.VEO_3_1;
    this.capabilityValidation = options.capabilityValidation ?? 'error';

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
   * Apply spec D3/D5 before any network call: warn once per unknown model id;
   * throw on shape violations; throw or warn on capability violations per
   * `capabilityValidation`.
   * @private
   */
  private _checkParams(model: string, params: Parameters<typeof getVeoViolations>[1], mode: VeoMode): void {
    if (!Object.prototype.hasOwnProperty.call(VEO_MODEL_CONSTRAINTS, model) && !this.warnedUnknownModels.has(model)) {
      this.warnedUnknownModels.add(model);
      this.logger.warn(`Model '${model}' is not in this package's catalog; sending without capability validation`);
    }
    const violations = getVeoViolations(model, params, mode);
    const shape = violations.filter((v) => v.kind === 'shape');
    if (shape.length > 0) throw new ValidationError(shape);
    if (violations.length === 0) return;
    if (this.capabilityValidation === 'error') throw new ValidationError(violations);
    for (const v of violations) this.logger.warn(`${v.message} (sending anyway: capabilityValidation is 'warn')`);
  }

  /**
   * Submit a generation request. The prompt and input media go in `source`
   * (SDK 2.14+; the top-level prompt/image/video form is deprecated and warns),
   * settings in `config` (spec D7). Failures go through `toPublicError` (D13).
   * @private
   */
  private async _submit(model: string, source: GenerateVideosSource, config: GenerateVideosConfig, label: string): Promise<VeoOperation> {
    try {
      const operation = toVeoOperation(
        await this.client.models.generateVideos({
          model,
          source,
          config: Object.keys(config).length > 0 ? config : undefined,
        })
      );
      this.logger.info(`${label} started (operation: ${operation.name})`);
      return operation;
    } catch (error) {
      this.logger.error(`${label} failed: ${errorMessage(error)}`);
      throw toPublicError(error, { surface: 'video' });
    }
  }

  /**
   * Settings shared by text-to-video and image-to-video — every declared
   * param, mapped (spec D3). `durationSeconds` is a string in this API and a
   * number on the wire.
   * @private
   */
  private _baseConfig(params: VeoGenerateParams): GenerateVideosConfig {
    const config: GenerateVideosConfig = {};
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = Number(params.durationSeconds);
    if (params.personGeneration) config.personGeneration = params.personGeneration;
    return config;
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

    const model: string = params.model || this.defaultModel;

    // Validate parameters
    this._checkParams(model, params, VEO_MODES.TEXT_TO_VIDEO);

    this.logger.info(`Starting text-to-video generation with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    return this._submit(model, { prompt: params.prompt }, this._baseConfig(params), 'Video generation');
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

    const model: string = params.model || this.defaultModel;

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
    this._checkParams(model, params, VEO_MODES.IMAGE_TO_VIDEO);

    this.logger.info(`Starting image-to-video generation with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    return this._submit(model, { prompt: params.prompt, image: params.image }, this._baseConfig(params), 'Image-to-video generation');
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

    const model: string = params.model || this.defaultModel;

    // Validate parameters
    this._checkParams(model, params, VEO_MODES.REFERENCE_IMAGES);

    this.logger.info(
      `Starting reference-images generation with ${model} (${params.referenceImages.length} references)`
    );
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Mode constants kept from 1.x: duration is always 8 with reference images;
    // resolution and personGeneration are not sent in this mode.
    const config: GenerateVideosConfig = {
      durationSeconds: 8,
      referenceImages: params.referenceImages.map((ref) => ({
        image: ref.image,
        // SAFETY: sent as given ('asset'), as 1.x did and as Google's own REST/JS
        // docs do. The SDK types this as its 'ASSET'/'STYLE' enum but passes the
        // value through unchanged (wire test), and the API accepted 'asset' live
        // (V12, 2026-09-22). Not validated against a list: Google's own examples
        // disagree on case, and the API is the authority.
        referenceType: ref.referenceType as VideoGenerationReferenceType,
      })),
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    return this._submit(model, { prompt: params.prompt }, config, 'Reference-images generation');
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

    const model: string = params.model || this.defaultModel;

    // Validate frame images
    if (!params.firstFrame || !params.firstFrame.imageBytes || !params.firstFrame.mimeType) {
      throw new Error('firstFrame with imageBytes and mimeType is required');
    }
    if (!params.lastFrame || !params.lastFrame.imageBytes || !params.lastFrame.mimeType) {
      throw new Error('lastFrame with imageBytes and mimeType is required');
    }

    // Validate parameters
    this._checkParams(model, params, VEO_MODES.INTERPOLATION);

    this.logger.info(`Starting interpolation generation with ${model}`);
    if (params.prompt) {
      this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);
    }

    // Mode constants kept from 1.x: duration is always 8; resolution and
    // personGeneration are not sent. firstFrame goes as the source image.
    const config: GenerateVideosConfig = {
      durationSeconds: 8,
      lastFrame: params.lastFrame,
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;

    return this._submit(model, { prompt: params.prompt || '', image: params.firstFrame }, config, 'Interpolation generation');
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

    const model: string = params.model || this.defaultModel;

    // Validate video object
    if (!params.video) {
      throw new Error('video object from a previous Veo generation is required');
    }

    // Validate parameters (extension requires 720p)
    this._checkParams(model, { ...params, resolution: '720p' }, VEO_MODES.EXTENSION);

    this.logger.info(`Starting video extension with ${model}`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    // Mode constants kept from 1.x: 720p, one video; aspectRatio, duration and
    // personGeneration are not sent.
    const config: GenerateVideosConfig = {
      numberOfVideos: 1,
      resolution: '720p',
    };
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;

    return this._submit(model, { prompt: params.prompt, video: params.video }, config, 'Video extension');
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

      // Retry by SOURCE, not by code (spec D13 step 4): only a failure of the
      // poll request itself is retried. A finished operation that carries an
      // error is terminal — in 1.x its throw sat inside this try, so a job that
      // failed with a "network"/"timeout" message was re-polled for up to ten
      // minutes before the caller heard about it.
      try {
        operation = toVeoOperation(
          await this.client.operations.getVideosOperation({ operation: toSdkOperation(operation) }),
          operation.name
        );
      } catch (error) {
        const publicError = toPublicError(error, { surface: 'video' });
        const retryable = ['TRANSIENT', 'NETWORK', 'TIMEOUT'].includes(publicError.classification);
        if (retryable && attempts < maxAttempts) {
          this.logger.warn(`Poll request failed (${publicError.classification}), retrying: ${errorMessage(error)}`);
          continue;
        }
        throw publicError;
      }

      this.logger.debug(
        `Poll attempt ${attempts}/${maxAttempts} (${(elapsedMs / 1000).toFixed(0)}s elapsed)`
      );

      // Call progress callback if provided
      if (onProgress) {
        onProgress(operation, elapsedMs);
      }

      if (operation.done) {
        const totalTime = (Date.now() - startTime) / 1000;
        this.logger.info(`Video generation completed in ${totalTime.toFixed(1)}s`);

        if (operation.error) {
          const error = new Error(operation.error.message || 'Video generation failed') as ExtendedError;
          error.operationError = operation.error;
          throw toPublicError(error, { surface: 'video' });
        }

        return operation;
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
      this.logger.error(`Download failed: ${errorMessage(error)}`);
      throw toPublicError(error, { surface: 'video' });
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
