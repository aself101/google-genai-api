/**
 * Google GenAI Video API
 *
 * Video understanding capabilities using Google's Gemini 2.5 Flash model
 * and Files API for video upload and processing.
 *
 * Supports:
 * - Video file upload via Files API
 * - Video content analysis with natural language prompts
 * - Video clipping (startOffset, endOffset)
 * - Timestamp analysis
 *
 * @module video-api
 */

import { GoogleGenAI } from '@google/genai';
import winston from 'winston';
import axios from 'axios';
import { MODELS, VIDEO_TIMEOUTS, getGoogleGenAIApiKey, redactApiKey } from './config.js';
import { validateVideoPath, pause } from './utils.js';
import { toPublicError } from './errors.js';
import type {
  FileInfo,
  GeminiResponse,
  VideoClipMetadata,
  VideoGenerateParams,
  VideoUploadResult,
} from './types/index.js';

/**
 * Extended error with additional properties.
 */
interface ExtendedError extends Error {
  /** axios errors (deleteVideoFile) */
  response?: { status?: number };
  status?: number;
  fileState?: string;
  isTimeout?: boolean;
}

/**
 * Google GenAI Video API client.
 * Provides video understanding capabilities using Gemini 2.5 Flash.
 *
 * @class GoogleGenAIVideoAPI
 *
 * @example
 * const api = new GoogleGenAIVideoAPI(apiKey);
 * const file = await api.uploadVideoFile('./video.mp4');
 * const result = await api.generateFromVideo({
 *   prompt: 'What happens in this video?',
 *   fileUri: file.uri,
 *   mimeType: file.mimeType
 * });
 */
export class GoogleGenAIVideoAPI {
  private apiKey: string;
  private client: GoogleGenAI;
  private model: string;
  private logger: winston.Logger;

  /**
   * Create a new GoogleGenAIVideoAPI instance.
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
    // Pinned to the Gemini Developer API (spec D5; see api.ts).
    this.client = new GoogleGenAI({ apiKey, vertexai: false });
    this.model = MODELS.GEMINI_VIDEO;

    // Configure logger
    this.logger = winston.createLogger({
      level: logLevel.toLowerCase(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - ${level.toUpperCase()} - [VideoAPI] ${message}`;
        })
      ),
      transports: [new winston.transports.Console()],
    });

    this.logger.debug(`GoogleGenAIVideoAPI initialized (key: ${redactApiKey(apiKey)})`);
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
   * Upload a video file to Google GenAI Files API.
   * Validates the file before upload and polls for processing completion.
   *
   * @param videoPath - Path to the video file
   * @param displayName - Optional display name for the file
   * @returns Upload result with file info
   * @throws Error if upload fails or file is invalid
   *
   * @example
   * const file = await api.uploadVideoFile('./video.mp4');
   * console.log(file.uri); // 'files/abc123'
   */
  async uploadVideoFile(
    videoPath: string,
    displayName: string | null = null
  ): Promise<VideoUploadResult> {
    this._verifyApiKey();

    // Validate video file
    this.logger.debug(`Validating video file: ${videoPath}`);
    const validation = await validateVideoPath(videoPath);

    this.logger.info(
      `Uploading video: ${videoPath} (${(validation.size / 1024 / 1024).toFixed(1)}MB, ${validation.mimeType})`
    );

    try {
      // Upload to Files API
      const uploadResult = await this.client.files.upload({
        file: videoPath,
        config: {
          mimeType: validation.mimeType,
          displayName: displayName || videoPath.split('/').pop(),
        },
      });

      this.logger.debug(`Upload complete, file name: ${uploadResult.name}`);
      this.logger.info('Video uploaded, waiting for processing...');

      // Poll for ACTIVE state
      const file = await this._pollFileStatus(uploadResult.name as string);

      this.logger.info(`Video processing complete: ${file.name} (state: ${file.state})`);

      return {
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        state: file.state,
        sizeBytes: file.sizeBytes,
      };
    } catch (error) {
      const err = error as ExtendedError;
      // The poll timeout is this package's own message and carries no vendor
      // data; like Veo's, it is thrown as is (`isTimeout: true`).
      if (err.isTimeout) throw err;
      const publicError = toPublicError(err, { surface: 'video-understanding' });
      this.logger.error(`Upload failed (${publicError.classification}): ${err.message}`);
      throw publicError;
    }
  }

  /**
   * Poll file status until ACTIVE or FAILED.
   * Uses adaptive backoff starting at 10s and capping at 30s.
   *
   * @private
   * @param fileName - File name (not URI) to poll
   * @param maxAttempts - Maximum polling attempts (default from VIDEO_TIMEOUTS)
   * @param intervalMs - Initial polling interval (default from VIDEO_TIMEOUTS)
   * @returns File object when ACTIVE
   * @throws Error if file processing fails or times out
   */
  private async _pollFileStatus(
    fileName: string,
    maxAttempts = VIDEO_TIMEOUTS.POLL_MAX_ATTEMPTS,
    intervalMs = VIDEO_TIMEOUTS.POLL_INTERVAL_START
  ): Promise<FileInfo> {
    let attempts = 0;
    let backoffMs = intervalMs;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const file = (await this.client.files.get({ name: fileName })) as unknown as FileInfo;

        if (file.state === 'ACTIVE') {
          this.logger.debug(`File is ACTIVE after ${attempts} attempts`);
          return file;
        }

        if (file.state === 'FAILED') {
          const error = new Error(
            `Video processing failed: ${file.error?.message || 'Unknown error'}`
          ) as ExtendedError;
          error.fileState = 'FAILED';
          throw error;
        }

        // Still processing
        this.logger.debug(`File state: ${file.state} (attempt ${attempts}/${maxAttempts})`);

        // Wait with adaptive backoff
        await pause(backoffMs);

        // Increase backoff (1.5x multiplier, capped at max)
        backoffMs = Math.min(backoffMs * 1.5, VIDEO_TIMEOUTS.POLL_INTERVAL_MAX);
      } catch (error) {
        const err = error as ExtendedError;

        // A FAILED file is terminal: its error has no status and classifies
        // USER_ACTIONABLE, so it is never retried.
        if (err.fileState === 'FAILED') throw err;

        // Handle 429 rate limit with extended backoff
        if (err.status === 429) {
          this.logger.warn('Rate limited, waiting 60 seconds...');
          await pause(60000);
          continue;
        }

        // Retry by source, as Veo polling does (spec D13): only a failed poll
        // request — network error, timeout, 408/5xx. 1.x also matched message
        // text ("network", "timeout", "processing"), which retried errors that
        // merely mentioned those words.
        const { classification } = toPublicError(err, { surface: 'video-understanding' });
        if (['TRANSIENT', 'NETWORK', 'TIMEOUT'].includes(classification) && attempts < maxAttempts) {
          this.logger.warn(`Poll request failed (${classification}), retrying: ${err.message}`);
          await pause(backoffMs);
          backoffMs = Math.min(backoffMs * 1.5, VIDEO_TIMEOUTS.POLL_INTERVAL_MAX);
          continue;
        }

        throw error;
      }
    }

    const error = new Error(
      `Video processing timed out after ${maxAttempts} attempts. ` +
        `The video may still be processing. Try again in a few minutes.`
    ) as ExtendedError;
    error.isTimeout = true;
    throw error;
  }

  /**
   * Generate content analysis from an uploaded video.
   *
   * @param params - Generation parameters
   * @returns Generation response with analysis text
   * @throws Error if generation fails
   *
   * @example
   * const result = await api.generateFromVideo({
   *   prompt: 'Describe what happens in this video',
   *   fileUri: file.uri,
   *   mimeType: 'video/mp4',
   *   videoMetadata: { startOffset: '0s', endOffset: '60s' }
   * });
   */
  async generateFromVideo(params: VideoGenerateParams): Promise<GeminiResponse> {
    this._verifyApiKey();

    const { prompt, fileUri, mimeType, videoMetadata } = params;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }
    if (!fileUri) {
      throw new Error('File URI is required. Upload a video first using uploadVideoFile()');
    }
    if (!mimeType) {
      throw new Error('MIME type is required');
    }

    this.logger.debug(
      `Generating from video: ${redactApiKey(fileUri)} with prompt: "${prompt.substring(0, 50)}..."`
    );

    // Build fileData object
    interface FileDataWithMetadata {
      fileUri: string;
      mimeType: string;
      videoMetadata?: VideoClipMetadata;
    }

    const fileData: FileDataWithMetadata = {
      fileUri,
      mimeType,
    };

    // Add video metadata for clipping if provided
    if (videoMetadata) {
      fileData.videoMetadata = videoMetadata;
      this.logger.debug(`Using video clipping: ${JSON.stringify(videoMetadata)}`);
    }

    // Build contents array
    const contents = [{ text: prompt }, { fileData }];

    try {
      const response = (await this.client.models.generateContent({
        model: this.model,
        contents,
      })) as GeminiResponse;

      this.logger.info('Video analysis complete');

      // Handle empty response
      if (!response?.candidates?.[0]?.content?.parts) {
        this.logger.warn('Empty response received from API');
        return {
          candidates: [
            {
              content: {
                parts: [{ text: 'No analysis could be generated for this video.' }],
              },
            },
          ],
        };
      }

      return response;
    } catch (error) {
      const err = error as ExtendedError;
      const publicError = toPublicError(err, { surface: 'video-understanding' });
      this.logger.error(`Generation failed (${publicError.classification}): ${err.message}`);

      // The model id is fixed, so a 404 here is the uploaded file. Keep 1.x's
      // hint (in every environment, as 1.x did), now with the D13 fields.
      if (publicError.status === 404) {
        throw Object.assign(
          new Error('Video file not found. The file may have expired (files expire after 48 hours) or was deleted.'),
          { status: 404, classification: publicError.classification, surface: publicError.surface }
        );
      }
      throw publicError;
    }
  }

  /**
   * Delete a video file from Google GenAI Files API.
   * This is a best-effort cleanup - failures are logged but not thrown.
   *
   * Note: The @google/genai SDK v0.3.0 does not expose files.delete(),
   * so this uses a direct HTTP DELETE request via axios.
   *
   * @param fileUri - File URI to delete (e.g., 'files/abc123')
   *
   * @example
   * await api.deleteVideoFile(file.uri);
   */
  async deleteVideoFile(fileUri: string): Promise<void> {
    this._verifyApiKey();

    if (!fileUri) {
      this.logger.warn('No file URI provided for deletion');
      return;
    }

    // Extract file name from URI (handle both 'files/abc123' and full URIs)
    const fileName = fileUri.includes('/') ? fileUri.split('/').pop() : fileUri;

    this.logger.debug(`Attempting to delete video file: ${fileName}`);

    try {
      // SDK doesn't expose delete(), use direct HTTP call
      const url = `https://generativelanguage.googleapis.com/v1beta/files/${fileName}`;

      await axios.delete(url, {
        headers: {
          'x-goog-api-key': this.apiKey,
        },
        timeout: 30000,
      });

      this.logger.info(`Deleted video file: ${fileName}`);
    } catch (error) {
      const err = error as ExtendedError;
      // Best-effort cleanup - log but don't throw
      if (err.response?.status === 404) {
        this.logger.warn(`File not found (may have already been deleted): ${fileName}`);
      } else {
        this.logger.warn(`Failed to delete video file: ${err.message}`);
      }
    }
  }

  /**
   * Set the logging level.
   *
   * @param level - Log level (debug, info, warn, error)
   */
  setLogLevel(level: string): void {
    this.logger.level = level.toLowerCase();
  }
}

// Export getGoogleGenAIApiKey for CLI convenience
export { getGoogleGenAIApiKey };
