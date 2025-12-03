/**
 * Google GenAI API Wrapper
 *
 * Provides a unified interface for Google GenAI models:
 * - Gemini 2.5 Flash Image: Text-to-image, image-to-image, semantic masking
 * - Imagen 4: High-quality text-to-image with multiple outputs (1-4 images)
 *
 * All generated images include SynthID watermarking.
 */

import { GoogleGenAI } from '@google/genai';
import winston from 'winston';
import { redactApiKey, MODELS, detectGeminiMode } from './config.js';
import type {
  GeminiModel,
  GeminiMode,
  GeminiPart,
  GeminiResponse,
  GeminiGenerateParams,
  ImagenGenerateParams,
  ImagenResponse,
  InlineData,
} from './types/index.js';

/**
 * Content type for Gemini API - can be string or parts array.
 */
type GeminiContents = string | Array<{ text: string } | { inlineData: InlineData }>;

/**
 * Google GenAI API wrapper class.
 * Supports both Gemini and Imagen models with different generation methods.
 */
export class GoogleGenAIAPI {
  private client: GoogleGenAI;
  private apiKey: string;
  private logger: winston.Logger;

  /**
   * Create a new Google GenAI API client.
   *
   * @param apiKey - Google GenAI API key
   * @param logLevel - Logging level (debug, info, warn, error)
   * @throws Error if API key is not provided
   *
   * @example
   * const api = new GoogleGenAIAPI('AIzaSy...');
   * const api = new GoogleGenAIAPI('AIzaSy...', 'debug');
   */
  constructor(apiKey: string, logLevel = 'info') {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    // Initialize Google GenAI client
    this.client = new GoogleGenAI({ apiKey });
    this.apiKey = apiKey;

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
   * - One input image: Image-to-image or semantic masking
   *
   * @param params - Generation parameters
   * @returns Response object with parts array
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
   *   model: 'gemini-3-pro-image-preview'
   * });
   */
  async generateWithGemini(params: GeminiGenerateParams): Promise<GeminiResponse> {
    this._verifyApiKey();

    const {
      prompt,
      inputImages = [],
      aspectRatio = '1:1',
      model = MODELS.GEMINI as GeminiModel,
      mode,
    } = params;

    // Detect or use provided mode
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
   * Generate images with Imagen 4 model.
   * Supports text-to-image with multiple outputs (1-4 images).
   *
   * @param params - Generation parameters
   * @returns Response object with generatedImages array
   * @throws Error if generation fails
   *
   * @example
   * // Generate single image
   * const response = await api.generateWithImagen({
   *   prompt: 'Futuristic cityscape at night',
   *   aspectRatio: '16:9'
   * });
   *
   * // Generate multiple images
   * const response = await api.generateWithImagen({
   *   prompt: 'Robot character designs',
   *   numberOfImages: 4,
   *   aspectRatio: '1:1'
   * });
   */
  async generateWithImagen(params: ImagenGenerateParams): Promise<ImagenResponse> {
    this._verifyApiKey();

    const { prompt, numberOfImages = 1, aspectRatio = '1:1' } = params;

    this.logger.info(
      `Generating with Imagen (images: ${numberOfImages}, aspectRatio: ${aspectRatio})`
    );
    this.logger.debug(`Prompt: "${prompt}"`);

    try {
      // Call Imagen API
      const response = (await this.client.models.generateImages({
        model: MODELS.IMAGEN,
        prompt,
        config: {
          numberOfImages,
          aspectRatio,
        },
      })) as ImagenResponse;

      this.logger.info(
        `Imagen generation successful (images: ${response.generatedImages?.length || 0})`
      );

      return response;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Imagen generation failed: ${err.message}`);

      // Sanitize error in production
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Image generation failed. Please try again.');
      }

      throw error;
    }
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

/**
 * Extract images from Imagen response.
 * Imagen response format: { generatedImages: [{ image: { imageBytes } }] }
 *
 * @param response - Imagen API response
 * @returns Array of images with base64 data
 *
 * @example
 * const images = extractImagenImages(response);
 * // [
 * //   { type: 'image', mimeType: 'image/png', data: 'base64...' },
 * //   { type: 'image', mimeType: 'image/png', data: 'base64...' }
 * // ]
 */
export function extractImagenImages(response: ImagenResponse): GeminiPart[] {
  const images: GeminiPart[] = [];

  for (const generated of response.generatedImages || []) {
    images.push({
      type: 'image',
      mimeType: 'image/png',
      data: generated.image.imageBytes,
    });
  }

  return images;
}

// Re-export GoogleGenAIVideoAPI for unified imports
// Allows: import { GoogleGenAIAPI, GoogleGenAIVideoAPI } from 'google-genai-api';
export { GoogleGenAIVideoAPI } from './video-api.js';
