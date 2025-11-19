/**
 * Google GenAI API Configuration
 *
 * Handles authentication and API configuration settings.
 *
 * API key can be provided via (in priority order):
 * 1. Command line flag: --api-key
 * 2. Environment variable: GOOGLE_GENAI_API_KEY
 * 3. Local .env file in current directory
 * 4. Global config: ~/.google-genai/.env (for global npm installs)
 *
 * To obtain an API key:
 * 1. Visit https://aistudio.google.com/apikey
 * 2. Sign in with your Google account
 * 3. Create a new API key
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Load environment variables in priority order:
// 1. First try local .env in current directory
dotenv.config();

// 2. Then try global config in home directory (if local .env doesn't exist)
const globalConfigPath = join(homedir(), '.google-genai', '.env');
if (existsSync(globalConfigPath)) {
  dotenv.config({ path: globalConfigPath });
}

// Google GenAI API models
export const MODELS = {
  GEMINI: 'gemini-2.5-flash-image',
  IMAGEN: 'imagen-4.0-generate-001'
};

// Valid aspect ratios (common to both models)
export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

// Gemini generation modes (detected automatically based on input)
export const GEMINI_MODES = {
  TEXT_TO_IMAGE: 'text-to-image',       // No input images
  IMAGE_TO_IMAGE: 'image-to-image',     // One input image
  SEMANTIC_MASKING: 'semantic-masking'  // One input image with edit prompt
};

// Model parameter constraints
export const MODEL_CONSTRAINTS = {
  'gemini-2.5-flash-image': {
    aspectRatios: ASPECT_RATIOS,
    promptMaxLength: 10000,
    inputImagesMax: 1, // Only one input image supported for editing/masking
    supportedModes: Object.values(GEMINI_MODES),
    features: {
      textToImage: true,
      imageToImage: true,
      semanticMasking: true,
      naturalLanguageEditing: true
    },
    // Note: Response format is { parts: [{ text }, { inlineData }] }
    responseFormat: 'parts'
  },
  'imagen-4.0-generate-001': {
    aspectRatios: ASPECT_RATIOS,
    numberOfImages: {
      min: 1,
      max: 4,
      default: 1
    },
    promptMaxLength: 10000,
    features: {
      textToImage: true,
      photorealistic: true,
      typography: true,
      multipleImages: true
    },
    // Note: Response format is { generatedImages: [{ image: { imageBytes } }] }
    responseFormat: 'generatedImages'
  }
};

// Default output directory (can be overridden via environment variable)
export const DEFAULT_OUTPUT_DIR = process.env.GOOGLE_GENAI_OUTPUT_DIR || 'datasets/google';

/**
 * Retrieve Google GenAI API key from environment variables or CLI flag.
 *
 * @param {string} [cliApiKey] - Optional API key passed via CLI flag (highest priority)
 * @returns {string} The Google GenAI API key
 * @throws {Error} If GOOGLE_GENAI_API_KEY is not found in any location
 *
 * @example
 * const apiKey = getGoogleGenAIApiKey();
 * const apiKey = getGoogleGenAIApiKey('AIzaSy...'); // From CLI flag
 */
export function getGoogleGenAIApiKey(cliApiKey = null) {
  // Priority order:
  // 1. CLI flag (if provided)
  // 2. Environment variable
  const apiKey = cliApiKey || process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey) {
    const errorMessage = [
      'GOOGLE_GENAI_API_KEY not found. Please provide your API key via one of these methods:',
      '',
      '  1. CLI flag:           google-genai --api-key YOUR_KEY --gemini --prompt "..."',
      '  2. Environment var:    export GOOGLE_GENAI_API_KEY=YOUR_KEY',
      '  3. Local .env file:    Create .env in current directory with GOOGLE_GENAI_API_KEY=YOUR_KEY',
      '  4. Global config:      Create ~/.google-genai/.env with GOOGLE_GENAI_API_KEY=YOUR_KEY',
      '',
      'Get your API key at https://aistudio.google.com/apikey'
    ].join('\n');

    throw new Error(errorMessage);
  }

  return apiKey;
}

/**
 * Validate that the API key appears to be in correct format.
 * Google AI API keys typically start with 'AIzaSy' and are 39 characters long.
 *
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} True if format appears valid
 *
 * @example
 * validateApiKeyFormat('AIzaSyBx...'); // true
 * validateApiKeyFormat('invalid'); // false
 */
export function validateApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Google AI API keys typically start with 'AIzaSy' and are 39 characters
  // Note: This is a format check, not authentication validation
  return apiKey.startsWith('AIzaSy') && apiKey.length === 39;
}

/**
 * Redact API key for safe logging (show only last 4 characters).
 * CRITICAL SECURITY: Never log full API keys, even in DEBUG mode.
 *
 * @param {string} apiKey - The API key to redact
 * @returns {string} Redacted API key (e.g., "xxx...xyz")
 *
 * @example
 * redactApiKey('AIzaSyBx7nVz...abc1234'); // 'xxx...1234'
 */
export function redactApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) {
    return 'xxx...xxx';
  }
  return `xxx...${apiKey.slice(-4)}`;
}

/**
 * Validate model-specific parameters before making API calls.
 * Catches invalid parameters early to save API credits.
 *
 * @param {string} model - Model name (e.g., 'gemini-2.5-flash-image', 'imagen-4.0-generate-001')
 * @param {Object} params - Parameters to validate
 * @param {string} params.prompt - Generation prompt
 * @param {string} [params.aspectRatio] - Aspect ratio
 * @param {number} [params.numberOfImages] - Number of images (Imagen only)
 * @param {Array} [params.inputImages] - Input images (Gemini only)
 * @throws {Error} If validation fails
 *
 * @example
 * validateModelParams('gemini-2.5-flash-image', { prompt: 'a cat', aspectRatio: '1:1' });
 * validateModelParams('imagen-4.0-generate-001', { prompt: 'a dog', numberOfImages: 4 });
 */
export function validateModelParams(model, params) {
  const constraints = MODEL_CONSTRAINTS[model];
  if (!constraints) {
    throw new Error(`Unknown model: ${model}`);
  }

  // Validate prompt
  if (!params.prompt || typeof params.prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  if (params.prompt.length > constraints.promptMaxLength) {
    throw new Error(`Prompt exceeds maximum length of ${constraints.promptMaxLength} characters`);
  }

  // Validate aspect ratio (if provided)
  if (params.aspectRatio && !constraints.aspectRatios.includes(params.aspectRatio)) {
    throw new Error(
      `Invalid aspect ratio '${params.aspectRatio}'. Must be one of: ${constraints.aspectRatios.join(', ')}`
    );
  }

  // Model-specific validation
  if (model === MODELS.IMAGEN) {
    // Validate numberOfImages
    if (params.numberOfImages !== undefined) {
      const num = parseInt(params.numberOfImages);
      if (isNaN(num) || num < constraints.numberOfImages.min || num > constraints.numberOfImages.max) {
        throw new Error(
          `numberOfImages must be between ${constraints.numberOfImages.min} and ${constraints.numberOfImages.max}`
        );
      }
    }

    // Imagen doesn't support input images
    if (params.inputImages && params.inputImages.length > 0) {
      throw new Error('Imagen does not support input images. Use Gemini for image-to-image generation.');
    }
  } else if (model === MODELS.GEMINI) {
    // Validate input images count
    if (params.inputImages && params.inputImages.length > constraints.inputImagesMax) {
      throw new Error(`Gemini supports maximum ${constraints.inputImagesMax} input image`);
    }

    // numberOfImages is not supported by Gemini
    if (params.numberOfImages !== undefined && params.numberOfImages !== 1) {
      throw new Error('Gemini only generates one image per request. Use Imagen for multiple images.');
    }
  }
}

/**
 * Detect Gemini generation mode based on input parameters.
 *
 * @param {Array} inputImages - Array of input images
 * @returns {string} Detected mode (TEXT_TO_IMAGE, IMAGE_TO_IMAGE, or SEMANTIC_MASKING)
 *
 * @example
 * detectGeminiMode([]); // 'text-to-image'
 * detectGeminiMode([image1]); // 'image-to-image' or 'semantic-masking'
 */
export function detectGeminiMode(inputImages = []) {
  if (inputImages.length === 0) {
    return GEMINI_MODES.TEXT_TO_IMAGE;
  } else if (inputImages.length === 1) {
    // Note: Semantic masking and image-to-image use the same API
    // The distinction is in the prompt (editing vs transforming)
    return GEMINI_MODES.IMAGE_TO_IMAGE;
  }
  throw new Error('Gemini supports maximum 1 input image');
}

/* END */
