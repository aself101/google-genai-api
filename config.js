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
  IMAGEN: 'imagen-4.0-generate-001',
  GEMINI_VIDEO: 'gemini-2.5-flash'  // Video analysis uses standard Gemini model
};

// ============================================================================
// VIDEO CONFIGURATION
// ============================================================================

/**
 * Supported video MIME types for video understanding.
 * These formats are supported by Google GenAI Files API.
 */
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp'
];

/**
 * Video file size limits.
 * @property {number} MAX_FILE_SIZE - Maximum file size in bytes (200MB)
 * @property {number} RECOMMENDED_MAX - Recommended max for faster processing (20MB)
 * @property {number} INLINE_MAX - Maximum size for inline data (future use)
 */
export const VIDEO_SIZE_LIMITS = {
  MAX_FILE_SIZE: 200 * 1024 * 1024,      // 200MB maximum
  RECOMMENDED_MAX: 20 * 1024 * 1024,     // 20MB recommended for fast processing
  INLINE_MAX: 20 * 1024 * 1024           // 20MB for inline data (future)
};

/**
 * Video processing timeouts and polling configuration.
 * Uses adaptive polling that increases interval over time.
 * @property {number} UPLOAD - Upload timeout in ms (10 minutes)
 * @property {number} PROCESSING - Processing timeout in ms (20 minutes)
 * @property {number} POLL_INTERVAL_START - Initial poll interval in ms (10 seconds)
 * @property {number} POLL_INTERVAL_MAX - Maximum poll interval in ms (30 seconds)
 * @property {number} POLL_MAX_ATTEMPTS - Maximum number of polling attempts
 */
export const VIDEO_TIMEOUTS = {
  UPLOAD: 600000,           // 10 minutes for upload
  PROCESSING: 1200000,      // 20 minutes for processing
  POLL_INTERVAL_START: 10000,  // Start at 10 seconds
  POLL_INTERVAL_MAX: 30000,    // Cap at 30 seconds
  POLL_MAX_ATTEMPTS: 120       // Maximum polling attempts
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
  'gemini-2.5-flash': {
    promptMaxLength: 10000,
    video: {
      supportedFormats: VIDEO_MIME_TYPES,
      maxFileSize: VIDEO_SIZE_LIMITS.MAX_FILE_SIZE,
      requiresFilesAPI: VIDEO_SIZE_LIMITS.INLINE_MAX,  // Files >20MB require Files API
      supportsClipping: true,
      supportsFps: true,
      defaultFps: 1,
      tokenPerSecond: {
        default: 300,
        low: 100
      }
    },
    features: {
      videoUnderstanding: true,
      timestampAnalysis: true,
      videoClipping: true
    },
    responseFormat: 'candidates'
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
    const validModels = Object.keys(MODEL_CONSTRAINTS).join(', ');
    throw new Error(`Unknown model: ${model}. Valid models: ${validModels}`);
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

// ============================================================================
// VIDEO TIME OFFSET PARSING
// ============================================================================

/**
 * Parse time offset string to seconds.
 * Supports multiple formats:
 * - Seconds: "90s", "90"
 * - Minutes+seconds: "1m30s"
 * - MM:SS: "1:30", "01:30"
 * - HH:MM:SS: "1:15:30", "01:15:30"
 *
 * @param {string} offset - Time offset string
 * @returns {number} Total seconds
 * @throws {Error} If format is invalid
 *
 * @example
 * parseTimeOffset('90s');     // 90
 * parseTimeOffset('1m30s');   // 90
 * parseTimeOffset('1:30');    // 90
 * parseTimeOffset('1:15:30'); // 4530
 */
export function parseTimeOffset(offset) {
  if (offset === null || offset === undefined) {
    throw new Error('Time offset is required');
  }

  const str = String(offset).trim();
  if (!str) {
    throw new Error('Time offset cannot be empty');
  }

  // Pattern 1: Seconds only - "90s" or "90"
  const secondsMatch = str.match(/^(\d+)s?$/);
  if (secondsMatch) {
    const seconds = parseInt(secondsMatch[1], 10);
    if (seconds < 0) {
      throw new Error('Time offset cannot be negative');
    }
    return seconds;
  }

  // Pattern 2: Minutes and seconds - "1m30s"
  const minutesSecondsMatch = str.match(/^(\d+)m(\d+)s?$/);
  if (minutesSecondsMatch) {
    const minutes = parseInt(minutesSecondsMatch[1], 10);
    const seconds = parseInt(minutesSecondsMatch[2], 10);
    if (seconds >= 60) {
      throw new Error('Seconds must be less than 60 in Xm Ys format');
    }
    return minutes * 60 + seconds;
  }

  // Pattern 3: Colon format - "MM:SS" or "HH:MM:SS"
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    if (colonMatch[3] !== undefined) {
      // HH:MM:SS format
      const hours = parseInt(colonMatch[1], 10);
      const minutes = parseInt(colonMatch[2], 10);
      const seconds = parseInt(colonMatch[3], 10);
      if (minutes >= 60 || seconds >= 60) {
        throw new Error('Invalid time format: minutes and seconds must be less than 60');
      }
      return hours * 3600 + minutes * 60 + seconds;
    } else {
      // MM:SS format
      const minutes = parseInt(colonMatch[1], 10);
      const seconds = parseInt(colonMatch[2], 10);
      if (seconds >= 60) {
        throw new Error('Invalid time format: seconds must be less than 60');
      }
      return minutes * 60 + seconds;
    }
  }

  throw new Error(
    `Invalid time offset format: "${str}". ` +
    `Supported formats: "90s", "1m30s", "1:30", "1:15:30"`
  );
}

/**
 * Validate video parameters before making API calls.
 * Validates video path, start offset, and end offset.
 *
 * @param {Object} params - Video parameters
 * @param {string} [params.startOffset] - Start offset (e.g., "30s", "1:30")
 * @param {string} [params.endOffset] - End offset (e.g., "60s", "2:00")
 * @returns {{startSeconds?: number, endSeconds?: number}} Parsed offsets in seconds
 * @throws {Error} If validation fails
 *
 * @example
 * validateVideoParams({ startOffset: '30s', endOffset: '60s' });
 * // { startSeconds: 30, endSeconds: 60 }
 */
export function validateVideoParams(params) {
  const result = {};

  // Parse start offset if provided
  if (params.startOffset !== undefined && params.startOffset !== null) {
    result.startSeconds = parseTimeOffset(params.startOffset);
  }

  // Parse end offset if provided
  if (params.endOffset !== undefined && params.endOffset !== null) {
    result.endSeconds = parseTimeOffset(params.endOffset);
  }

  // Validate end > start if both provided
  if (result.startSeconds !== undefined && result.endSeconds !== undefined) {
    if (result.endSeconds <= result.startSeconds) {
      throw new Error(
        `End offset (${params.endOffset} = ${result.endSeconds}s) must be greater than ` +
        `start offset (${params.startOffset} = ${result.startSeconds}s)`
      );
    }
  }

  return result;
}

// ============================================================================
// VEO VIDEO GENERATION CONFIGURATION
// ============================================================================

/**
 * Veo video generation models.
 * @property {string} VEO_3_1 - Veo 3.1 (preview) - latest with all features
 * @property {string} VEO_3_1_FAST - Veo 3.1 Fast (preview) - faster generation
 * @property {string} VEO_3 - Veo 3.0 - stable release
 * @property {string} VEO_3_FAST - Veo 3.0 Fast - faster stable release
 * @property {string} VEO_2 - Veo 2.0 - legacy model
 */
export const VEO_MODELS = {
  VEO_3_1: 'veo-3.1-generate-preview',
  VEO_3_1_FAST: 'veo-3.1-fast-generate-preview',
  VEO_3: 'veo-3.0-generate-001',
  VEO_3_FAST: 'veo-3.0-fast-generate-001',
  VEO_2: 'veo-2.0-generate-001'
};

/**
 * Veo supported aspect ratios.
 */
export const VEO_ASPECT_RATIOS = ['16:9', '9:16'];

/**
 * Veo supported resolutions.
 */
export const VEO_RESOLUTIONS = ['720p', '1080p'];

/**
 * Veo generation durations by model.
 * Duration in seconds as strings.
 */
export const VEO_DURATIONS = {
  // Veo 3.x supports 4, 6, 8 seconds
  [VEO_MODELS.VEO_3_1]: ['4', '6', '8'],
  [VEO_MODELS.VEO_3_1_FAST]: ['4', '6', '8'],
  [VEO_MODELS.VEO_3]: ['4', '6', '8'],
  [VEO_MODELS.VEO_3_FAST]: ['4', '6', '8'],
  // Veo 2 supports 5, 6, 8 seconds
  [VEO_MODELS.VEO_2]: ['5', '6', '8']
};

/**
 * Person generation safety settings.
 */
export const VEO_PERSON_GENERATION = {
  ALLOW_ALL: 'allow_all',
  ALLOW_ADULT: 'allow_adult',
  DONT_ALLOW: 'dont_allow'
};

/**
 * Veo generation timeouts and polling configuration.
 * @property {number} MIN_LATENCY - Minimum latency in ms (11 seconds)
 * @property {number} MAX_LATENCY - Maximum latency in ms (6 minutes)
 * @property {number} POLL_INTERVAL - Poll interval in ms (10 seconds)
 * @property {number} POLL_MAX_ATTEMPTS - Maximum polling attempts
 * @property {number} VIDEO_RETENTION_HOURS - Hours videos are retained (48)
 */
export const VEO_TIMEOUTS = {
  MIN_LATENCY: 11000,           // 11 seconds minimum
  MAX_LATENCY: 360000,          // 6 minutes maximum
  POLL_INTERVAL: 10000,         // 10 seconds between polls
  POLL_MAX_ATTEMPTS: 60,        // Max attempts (10 minutes total)
  VIDEO_RETENTION_HOURS: 48     // Videos retained for 48 hours
};

/**
 * Veo generation modes.
 */
export const VEO_MODES = {
  TEXT_TO_VIDEO: 'text-to-video',
  IMAGE_TO_VIDEO: 'image-to-video',
  REFERENCE_IMAGES: 'reference-images',
  INTERPOLATION: 'interpolation',
  EXTENSION: 'extension'
};

/**
 * Veo model constraints.
 * Defines feature support and parameter limits for each model.
 */
export const VEO_MODEL_CONSTRAINTS = {
  [VEO_MODELS.VEO_3_1]: {
    aspectRatios: VEO_ASPECT_RATIOS,
    resolutions: VEO_RESOLUTIONS,
    durations: VEO_DURATIONS[VEO_MODELS.VEO_3_1],
    features: {
      textToVideo: true,
      imageToVideo: true,
      referenceImages: true,
      interpolation: true,
      extension: true,
      nativeAudio: true
    },
    referenceImages: {
      max: 3
    },
    extension: {
      maxInputLength: 141,      // Max input video length in seconds
      extensionLength: 7,       // Each extension adds ~7 seconds
      maxTotalLength: 148       // Max total video length
    },
    resolution1080p: {
      requiresDuration: '8',    // 1080p requires 8-second duration
      aspectRatio: null         // All aspect ratios supported
    },
    promptMaxLength: 1024       // Max prompt length in tokens
  },
  [VEO_MODELS.VEO_3_1_FAST]: {
    aspectRatios: VEO_ASPECT_RATIOS,
    resolutions: VEO_RESOLUTIONS,
    durations: VEO_DURATIONS[VEO_MODELS.VEO_3_1_FAST],
    features: {
      textToVideo: true,
      imageToVideo: true,
      referenceImages: true,
      interpolation: true,
      extension: true,
      nativeAudio: true
    },
    referenceImages: {
      max: 3
    },
    extension: {
      maxInputLength: 141,
      extensionLength: 7,
      maxTotalLength: 148
    },
    resolution1080p: {
      requiresDuration: '8',
      aspectRatio: null
    },
    promptMaxLength: 1024
  },
  [VEO_MODELS.VEO_3]: {
    aspectRatios: VEO_ASPECT_RATIOS,
    resolutions: VEO_RESOLUTIONS,
    durations: VEO_DURATIONS[VEO_MODELS.VEO_3],
    features: {
      textToVideo: true,
      imageToVideo: true,
      referenceImages: false,
      interpolation: false,
      extension: false,
      nativeAudio: true
    },
    referenceImages: null,
    extension: null,
    resolution1080p: {
      requiresDuration: '8',
      aspectRatio: '16:9'       // 1080p only for 16:9 on Veo 3
    },
    promptMaxLength: 1024
  },
  [VEO_MODELS.VEO_3_FAST]: {
    aspectRatios: VEO_ASPECT_RATIOS,
    resolutions: VEO_RESOLUTIONS,
    durations: VEO_DURATIONS[VEO_MODELS.VEO_3_FAST],
    features: {
      textToVideo: true,
      imageToVideo: true,
      referenceImages: false,
      interpolation: false,
      extension: false,
      nativeAudio: true
    },
    referenceImages: null,
    extension: null,
    resolution1080p: {
      requiresDuration: '8',
      aspectRatio: '16:9'
    },
    promptMaxLength: 1024
  },
  [VEO_MODELS.VEO_2]: {
    aspectRatios: VEO_ASPECT_RATIOS,
    resolutions: ['720p'],      // 720p only for Veo 2
    durations: VEO_DURATIONS[VEO_MODELS.VEO_2],
    features: {
      textToVideo: true,
      imageToVideo: true,
      referenceImages: false,
      interpolation: false,
      extension: false,
      nativeAudio: false        // No audio in Veo 2
    },
    referenceImages: null,
    extension: null,
    resolution1080p: null,      // Not supported
    promptMaxLength: 1024
  }
};

/**
 * Validate Veo generation parameters before making API calls.
 * Catches invalid parameters early to save API credits.
 *
 * @param {string} model - Veo model name
 * @param {Object} params - Parameters to validate
 * @param {string} [params.prompt] - Generation prompt
 * @param {string} [params.aspectRatio] - Aspect ratio (16:9, 9:16)
 * @param {string} [params.resolution] - Resolution (720p, 1080p)
 * @param {string} [params.durationSeconds] - Duration (4, 5, 6, 8)
 * @param {Array} [params.referenceImages] - Reference images (Veo 3.1 only)
 * @param {Object} [params.video] - Video for extension (Veo 3.1 only)
 * @param {string} [mode='text-to-video'] - Generation mode
 * @throws {Error} If validation fails
 *
 * @example
 * validateVeoParams('veo-3.1-generate-preview', {
 *   prompt: 'A cat running',
 *   aspectRatio: '16:9',
 *   resolution: '720p',
 *   durationSeconds: '8'
 * });
 */
export function validateVeoParams(model, params, mode = VEO_MODES.TEXT_TO_VIDEO) {
  const constraints = VEO_MODEL_CONSTRAINTS[model];

  // Validate model exists
  if (!constraints) {
    const validModels = Object.values(VEO_MODELS).join(', ');
    throw new Error(`Unknown Veo model: ${model}. Valid models: ${validModels}`);
  }

  // Validate prompt (required for most modes)
  if (mode !== VEO_MODES.EXTENSION && mode !== VEO_MODES.INTERPOLATION) {
    if (!params.prompt || typeof params.prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }
    // Note: promptMaxLength is in tokens, but we'll do a rough character check
    // Token limit is ~1024, so we'll allow ~4000 characters as rough estimate
    if (params.prompt.length > constraints.promptMaxLength * 4) {
      throw new Error(`Prompt exceeds maximum length of approximately ${constraints.promptMaxLength} tokens`);
    }
  }

  // Validate aspect ratio
  if (params.aspectRatio && !constraints.aspectRatios.includes(params.aspectRatio)) {
    throw new Error(
      `Invalid aspect ratio '${params.aspectRatio}' for ${model}. ` +
      `Must be one of: ${constraints.aspectRatios.join(', ')}`
    );
  }

  // Validate resolution
  if (params.resolution && !constraints.resolutions.includes(params.resolution)) {
    throw new Error(
      `Invalid resolution '${params.resolution}' for ${model}. ` +
      `Must be one of: ${constraints.resolutions.join(', ')}`
    );
  }

  // Validate duration
  if (params.durationSeconds && !constraints.durations.includes(String(params.durationSeconds))) {
    throw new Error(
      `Invalid duration '${params.durationSeconds}' for ${model}. ` +
      `Must be one of: ${constraints.durations.join(', ')}`
    );
  }

  // Validate 1080p constraints
  if (params.resolution === '1080p' && constraints.resolution1080p) {
    const { requiresDuration, aspectRatio } = constraints.resolution1080p;

    // Check duration requirement
    if (requiresDuration && params.durationSeconds && String(params.durationSeconds) !== requiresDuration) {
      throw new Error(
        `1080p resolution requires ${requiresDuration}-second duration for ${model}. ` +
        `Got: ${params.durationSeconds}s`
      );
    }

    // Check aspect ratio requirement (Veo 3.x)
    if (aspectRatio && params.aspectRatio && params.aspectRatio !== aspectRatio) {
      throw new Error(
        `1080p resolution requires ${aspectRatio} aspect ratio for ${model}. ` +
        `Got: ${params.aspectRatio}`
      );
    }
  }

  // Validate mode-specific features
  const featureMap = {
    [VEO_MODES.TEXT_TO_VIDEO]: 'textToVideo',
    [VEO_MODES.IMAGE_TO_VIDEO]: 'imageToVideo',
    [VEO_MODES.REFERENCE_IMAGES]: 'referenceImages',
    [VEO_MODES.INTERPOLATION]: 'interpolation',
    [VEO_MODES.EXTENSION]: 'extension'
  };

  const requiredFeature = featureMap[mode];
  if (requiredFeature && !constraints.features[requiredFeature]) {
    throw new Error(
      `${mode} mode is not supported by ${model}. ` +
      `This feature requires Veo 3.1 or Veo 3.1 Fast.`
    );
  }

  // Validate reference images count
  if (mode === VEO_MODES.REFERENCE_IMAGES && params.referenceImages) {
    if (!constraints.referenceImages) {
      throw new Error(`Reference images are not supported by ${model}`);
    }
    if (!Array.isArray(params.referenceImages)) {
      throw new Error('referenceImages must be an array');
    }
    if (params.referenceImages.length === 0) {
      throw new Error('At least one reference image is required');
    }
    if (params.referenceImages.length > constraints.referenceImages.max) {
      throw new Error(
        `Maximum ${constraints.referenceImages.max} reference images allowed. ` +
        `Got: ${params.referenceImages.length}`
      );
    }
    // Validate each reference image has required fields
    for (let i = 0; i < params.referenceImages.length; i++) {
      const ref = params.referenceImages[i];
      if (!ref.image) {
        throw new Error(`Reference image ${i + 1} is missing 'image' property`);
      }
      if (!ref.referenceType) {
        throw new Error(`Reference image ${i + 1} is missing 'referenceType' property`);
      }
    }
  }

  // Validate interpolation parameters
  if (mode === VEO_MODES.INTERPOLATION) {
    if (!params.firstFrame) {
      throw new Error('firstFrame image is required for interpolation mode');
    }
    if (!params.lastFrame) {
      throw new Error('lastFrame image is required for interpolation mode');
    }
  }

  // Validate extension parameters
  if (mode === VEO_MODES.EXTENSION) {
    if (!constraints.extension) {
      throw new Error(`Video extension is not supported by ${model}`);
    }
    if (!params.video) {
      throw new Error('video object is required for extension mode');
    }
    // Extension requires 720p
    if (params.resolution && params.resolution !== '720p') {
      throw new Error(
        `Video extension requires 720p resolution. Got: ${params.resolution}`
      );
    }
  }

  // Validate person generation setting
  if (params.personGeneration) {
    const validSettings = Object.values(VEO_PERSON_GENERATION);
    if (!validSettings.includes(params.personGeneration)) {
      throw new Error(
        `Invalid personGeneration value: '${params.personGeneration}'. ` +
        `Must be one of: ${validSettings.join(', ')}`
      );
    }
  }

  return true;
}

/* END */
