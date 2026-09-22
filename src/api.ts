/**
 * Google GenAI API Wrapper
 *
 * Provides a unified interface for Google GenAI models:
 * - Gemini image models: text-to-image, image-to-image, semantic masking
 *
 * All generated images include SynthID watermarking.
 */

import { GoogleGenAI } from '@google/genai';
import winston from 'winston';
import { redactApiKey, DEFAULT_IMAGE_MODEL, MODEL_CONSTRAINTS, detectGeminiMode, getModelViolations } from './config.js';
import { ValidationError } from './errors.js';
import type {
  GeminiMode,
  GoogleGenAIClientOptions,
  GeminiPart,
  GeminiResponse,
  GeminiGenerateParams,
  InlineData,
} from './types/index.js';

/**
 * Content type for Gemini API - can be string or parts array.
 */
type GeminiContents = string | Array<{ text: string } | { inlineData: InlineData }>;

/**
 * Google GenAI API wrapper class.
 * Image generation and editing with Gemini image models.
 */
export class GoogleGenAIAPI {
  private client: GoogleGenAI;
  private apiKey: string;
  private logger: winston.Logger;
  private capabilityValidation: 'error' | 'warn';
  /** Unknown model ids already warned about by this instance (spec D3: once per id). */
  private warnedUnknownModels = new Set<string>();

  /**
   * Create a new Google GenAI API client.
   *
   * @param apiKey - Google GenAI API key
   * @param logLevel - Logging level (debug, info, warn, error)
   * @param options - `capabilityValidation: 'warn'` to log, not throw, when a
   *   known model's constraint table rejects a parameter
   * @throws Error if API key is not provided
   *
   * @example
   * const api = new GoogleGenAIAPI('AIzaSy...');
   * const api = new GoogleGenAIAPI('AIzaSy...', 'debug');
   * const api = new GoogleGenAIAPI('AIzaSy...', 'info', { capabilityValidation: 'warn' });
   */
  constructor(apiKey: string, logLevel = 'info', options: GoogleGenAIClientOptions = {}) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    // Pinned to the Gemini Developer API: without `vertexai: false` the SDK
    // switches to Vertex/Enterprise when GOOGLE_GENAI_USE_VERTEXAI or
    // GOOGLE_GENAI_USE_ENTERPRISE is set in the environment (spec D5).
    this.client = new GoogleGenAI({ apiKey, vertexai: false });
    this.apiKey = apiKey;
    this.capabilityValidation = options.capabilityValidation ?? 'error';

    // Configure logger
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - ${level.toUpperCase()} - ${message}`;
        })
      ),
      transports: [new winston.transports.Console()],
    });

    // Only log API key in debug mode to minimize exposure
    if (logLevel === 'debug') {
      this.logger.debug(`Google GenAI API initialized (API key: ${redactApiKey(apiKey)})`);
    } else {
      this.logger.info('Google GenAI API initialized');
    }
  }

  /**
   * Verify API key is set.
   * @private
   * @throws Error if API key is missing
   */
  private _verifyApiKey(): void {
    if (!this.apiKey) {
      throw new Error('API key not set. Initialize GoogleGenAIAPI with your API key.');
    }
  }

  /**
   * Build contents parameter for Gemini API.
   * For text-to-image: returns simple string
   * For image-to-image/masking: returns array of parts [{ text }, { inlineData }]
   *
   * @private
   * @param prompt - Generation prompt
   * @param inputImages - Array of inlineData objects { mimeType, data }
   * @returns Contents parameter for Gemini API
   */
  private _buildGeminiContents(prompt: string, inputImages: InlineData[] = []): GeminiContents {
    if (inputImages.length === 0) {
      // Text-to-image: simple string
      return prompt;
    }

    // Image-to-image or semantic masking: parts array
    const parts: Array<{ text: string } | { inlineData: InlineData }> = [{ text: prompt }];

    for (const imageData of inputImages) {
      parts.push({ inlineData: imageData });
    }

    return parts;
  }

  /**
   * Generate image with Gemini models.
   * Supports text-to-image, image-to-image, and semantic masking.
   *
   * Mode is automatically detected:
   * - No input images: Text-to-image
   * - One or more input images: Image-to-image or semantic masking
   *
   * Parameters are checked before any network call: shape rules always, and a
   * known model's constraint table (throws, or warns under
   * `capabilityValidation: 'warn'`). An id this package does not catalog is
   * sent with a one-time warning (spec D3).
   *
   * @param params - Generation parameters
   * @returns Response object with parts array
   * @throws ValidationError if parameters are rejected (before any API call)
   * @throws Error if generation fails
   *
   * @example
   * // Text-to-image
   * const response = await api.generateWithGemini({
   *   prompt: 'A serene mountain landscape',
   *   aspectRatio: '16:9'
   * });
   *
   * // Image-to-image editing
   * const inputImage = await imageToInlineData('./photo.jpg');
   * const response = await api.generateWithGemini({
   *   prompt: 'Make it sunset',
   *   inputImages: [inputImage]
   * });
   *
   * // Using Gemini 3 Pro
   * const response = await api.generateWithGemini({
   *   prompt: 'A futuristic cityscape',
   *   model: 'gemini-3-pro-image'
   * });
   */
  async generateWithGemini(params: GeminiGenerateParams): Promise<GeminiResponse> {
    this._verifyApiKey();

    const {
      prompt,
      inputImages = [],
      aspectRatio = '1:1',
      model = DEFAULT_IMAGE_MODEL,
      mode,
    } = params;

    // Validate before the try below, so a ValidationError reaches the caller
    // intact rather than through production error sanitization (spec D5).
    // Only caller-supplied values are checked — not the defaults above.
    this._checkParams(model, { prompt, aspectRatio: params.aspectRatio, inputImages });

    // Detect or use provided mode. The image count was already validated above,
    // whether or not the caller supplied `mode` (1.x skipped the check then).
    const detectedMode: GeminiMode = mode || detectGeminiMode(inputImages);

    this.logger.info(
      `Generating with ${model} (mode: ${detectedMode}, aspectRatio: ${aspectRatio})`
    );
    this.logger.debug(`Prompt: "${prompt}"`);
    this.logger.debug(`Input images: ${inputImages.length}`);

    try {
      // Build contents parameter
      const contents = this._buildGeminiContents(prompt, inputImages);

      this.logger.debug(
        `Contents type: ${typeof contents === 'string' ? 'string' : 'parts array'}`
      );

      // Call Gemini API
      // Note: aspectRatio is a valid Gemini config option for image generation
      const response = (await this.client.models.generateContent({
        model,
        contents,
        config: { aspectRatio } as Record<string, unknown>,
      })) as GeminiResponse;

      const partsCount =
        response.candidates?.[0]?.content?.parts?.length || response.parts?.length || 0;
      this.logger.info(`Gemini generation successful (parts: ${partsCount})`);

      return response;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Gemini generation failed: ${err.message}`);

      // Sanitize error in production
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Image generation failed. Please try again.');
      }

      throw error;
    }
  }

  /**
   * Apply spec D3/D5: warn once per unknown model id; throw on shape
   * violations; throw or warn on capability violations per
   * `capabilityValidation`.
   * @private
   */
  private _checkParams(model: string, params: Parameters<typeof getModelViolations>[1]): void {
    if (!Object.prototype.hasOwnProperty.call(MODEL_CONSTRAINTS, model) && !this.warnedUnknownModels.has(model)) {
      this.warnedUnknownModels.add(model);
      this.logger.warn(`Model '${model}' is not in this package's catalog; sending without capability validation`);
    }
    const violations = getModelViolations(model, params);
    const shape = violations.filter((v) => v.kind === 'shape');
    if (shape.length > 0) throw new ValidationError(shape);
    if (violations.length === 0) return;
    if (this.capabilityValidation === 'error') throw new ValidationError(violations);
    for (const v of violations) this.logger.warn(`${v.message} (sending anyway: capabilityValidation is 'warn')`);
  }

  /**
   * Set logger level.
   *
   * @param level - Log level (debug, info, warn, error)
   *
   * @example
   * api.setLogLevel('debug');
   */
  setLogLevel(level: string): void {
    this.logger.level = level.toLowerCase();
  }
}

/**
 * Extract parts from Gemini response.
 * Gemini response format: { parts: [{ text }, { inlineData: { mimeType, data } }] }
 *
 * @param response - Gemini API response
 * @returns Array of parts with type (text or image)
 *
 * @example
 * const parts = extractGeminiParts(response);
 * // [
 * //   { type: 'text', content: 'Description...' },
 * //   { type: 'image', mimeType: 'image/png', data: 'base64...' }
 * // ]
 */
export function extractGeminiParts(response: GeminiResponse): GeminiPart[] {
  const parts: GeminiPart[] = [];

  // Extract parts from response.candidates[0].content.parts
  const responseParts = response.candidates?.[0]?.content?.parts || response.parts || [];

  for (const part of responseParts) {
    if (part.text) {
      parts.push({
        type: 'text',
        content: part.text,
      });
    } else if (part.inlineData) {
      parts.push({
        type: 'image',
        mimeType: part.inlineData.mimeType || 'image/png',
        data: part.inlineData.data,
      });
    }
  }

  return parts;
}

// Re-export GoogleGenAIVideoAPI for unified imports
// Allows: import { GoogleGenAIAPI, GoogleGenAIVideoAPI } from 'google-genai-api';
export { GoogleGenAIVideoAPI } from './video-api.js';
