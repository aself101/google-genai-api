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
import { ValidationError } from './errors.js';
import type { Violation } from './errors.js';
import type {
  AspectRatio,
  GeminiImageModel,
  GeminiMode,
  GeminiModes,
  ImageSize,
  InlineData,
  ModelConstraint,
  ModelConstraints,
  ModelValidationParams,
  Models,
  ParsedTimeOffsets,
  OmniAspectRatio,
  OmniGenerateParams,
  OmniModel,
  OmniModelConstraint,
  OmniModelConstraints,
  OmniModels,
  OmniResolution,
  OmniTask,
  OmniTimeouts,
  VideoTimeouts,
  VideoSizeLimits,
} from './types/index.js';

// Load environment variables in priority order:
// 1. First try local .env in current directory
dotenv.config();

// 2. Then try global config in home directory (if local .env doesn't exist)
const globalConfigPath = join(homedir(), '.google-genai', '.env');
if (existsSync(globalConfigPath)) {
  dotenv.config({ path: globalConfigPath });
}

export { ValidationError };
export type { Violation };

/**
 * Google GenAI API models. Current models only: a model with an announced
 * shutdown is removed from the package (spec D2) and `npm run check:lifecycle`
 * fails until it is. Removed ids still work — any string is accepted as a model
 * id and sent without capability validation (spec D3).
 */
export const MODELS: Models = {
  GEMINI_NANO_BANANA_2_1: 'gemini-nano-banana-2.1',
  GEMINI_3_1_FLASH: 'gemini-3.1-flash-image',
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite-image',
  GEMINI_3_PRO: 'gemini-3-pro-image',
  // Video understanding. 2.x used gemini-2.5-flash, which shuts down 2026-12-01
  // (then routes to gemini-3.5-flash-lite); gemini-3.8-flash is the model
  // Google's video-understanding guide uses (spec 3.0 D21).
  GEMINI_VIDEO: 'gemini-3.8-flash',
};

/**
 * Image model used when a caller does not pass one (spec D4). Nano Banana 2.1
 * since 3.0 — Google recommends it for all new projects in place of
 * gemini-3.1-flash-image (spec 3.0 D20).
 */
export const DEFAULT_IMAGE_MODEL: GeminiImageModel = 'gemini-nano-banana-2.1';

// ============================================================================
// VIDEO CONFIGURATION
// ============================================================================

/**
 * Supported video MIME types for video understanding.
 * These formats are supported by Google GenAI Files API.
 */
export const VIDEO_MIME_TYPES: string[] = [
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
];

/**
 * Video file size limits.
 */
export const VIDEO_SIZE_LIMITS: VideoSizeLimits = {
  MAX_FILE_SIZE: 200 * 1024 * 1024, // 200MB maximum
  RECOMMENDED_MAX: 20 * 1024 * 1024, // 20MB recommended for fast processing
  INLINE_MAX: 20 * 1024 * 1024, // 20MB for inline data (future)
};

/**
 * Video processing timeouts and polling configuration.
 * Uses adaptive polling that increases interval over time.
 */
export const VIDEO_TIMEOUTS: VideoTimeouts = {
  UPLOAD: 600000, // 10 minutes for upload
  PROCESSING: 1200000, // 20 minutes for processing
  POLL_INTERVAL_START: 10000, // Start at 10 seconds
  POLL_INTERVAL_MAX: 30000, // Cap at 30 seconds
  POLL_MAX_ATTEMPTS: 120, // Maximum polling attempts
};

// The ten aspect ratios every current Gemini image model accepts.
const STANDARD_ASPECT_RATIOS: AspectRatio[] = [
  '1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
];

/**
 * Every aspect ratio any cataloged image model accepts. The 3.1 models add four
 * extreme ratios (vendor docs; 1:4 verified live on 3.1 Flash Lite, 2026-09-22).
 * Per-model lists are in MODEL_CONSTRAINTS.
 */
export const ASPECT_RATIOS: AspectRatio[] = [...STANDARD_ASPECT_RATIOS, '1:4', '4:1', '1:8', '8:1'];

/**
 * imageConfig.imageSize values across cataloged models; per-model lists are in
 * MODEL_CONSTRAINTS. '512' and '2K' verified live on 3.1 Flash, 2026-09-22.
 */
export const IMAGE_SIZES: ImageSize[] = ['512', '1K', '2K', '4K'];

/**
 * Input-image MIME types this package accepts (the 1.x set; imageToInlineData
 * produces these).
 */
export const SUPPORTED_IMAGE_MIME_TYPES: string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Prompt length ceiling applied to ids with no constraint entry (spec D3 shape).
const PROMPT_MAX_LENGTH = 10000;

/**
 * Gemini generation modes (detected automatically based on input)
 */
export const GEMINI_MODES: GeminiModes = {
  TEXT_TO_IMAGE: 'text-to-image',
  IMAGE_TO_IMAGE: 'image-to-image',
  SEMANTIC_MASKING: 'semantic-masking',
};

/**
 * Model parameter constraints
 */
export const MODEL_CONSTRAINTS: ModelConstraints = {
  // Same family as 3.1 Flash Image: all 14 ratios, up to 14 inputs (10 object +
  // 4 character). No 512 tier ("not supported on Gemini Nano Banana 2.1",
  // image-generation guide, 2026-11-08).
  'gemini-nano-banana-2.1': {
    aspectRatios: ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
    promptMaxLength: 10000,
    inputImagesMax: 14,
    supportedModes: Object.values(GEMINI_MODES) as GeminiMode[],
    features: {
      textToImage: true,
      imageToImage: true,
      semanticMasking: true,
      naturalLanguageEditing: true,
    },
    responseFormat: 'parts',
  },
  'gemini-3.1-flash-image': {
    aspectRatios: ASPECT_RATIOS,
    imageSizes: ['512', '1K', '2K', '4K'],
    promptMaxLength: 10000,
    inputImagesMax: 14, // 10 object + 4 character references (vendor docs); 3 verified live
    supportedModes: Object.values(GEMINI_MODES) as GeminiMode[],
    features: {
      textToImage: true,
      imageToImage: true,
      semanticMasking: true,
      naturalLanguageEditing: true,
    },
    // Note: Response format is { parts: [{ text }, { inlineData }] }
    responseFormat: 'parts',
  },
  'gemini-3.1-flash-lite-image': {
    // The model page lists the ten standard ratios but says "14 aspect ratios";
    // 1:4 was accepted live (2026-09-22), so the extended set is taken as real.
    aspectRatios: ASPECT_RATIOS,
    imageSizes: ['1K'], // 2K rejected live: "Image size 2K is not supported for this model"
    promptMaxLength: 10000,
    inputImagesMax: 14,
    supportedModes: Object.values(GEMINI_MODES) as GeminiMode[],
    features: {
      textToImage: true,
      imageToImage: true,
      semanticMasking: true,
      naturalLanguageEditing: true,
    },
    responseFormat: 'parts',
  },
  'gemini-3-pro-image': {
    aspectRatios: STANDARD_ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
    promptMaxLength: 10000,
    inputImagesMax: 14, // 6 object + 5 character references (vendor docs)
    supportedModes: Object.values(GEMINI_MODES) as GeminiMode[],
    features: {
      textToImage: true,
      imageToImage: true,
      semanticMasking: true,
      naturalLanguageEditing: true,
    },
    responseFormat: 'parts',
  },
  'gemini-3.8-flash': {
    promptMaxLength: 10000,
    video: {
      supportedFormats: VIDEO_MIME_TYPES,
      maxFileSize: VIDEO_SIZE_LIMITS.MAX_FILE_SIZE,
      requiresFilesAPI: VIDEO_SIZE_LIMITS.INLINE_MAX, // Files >20MB require Files API
      supportsClipping: true,
      supportsFps: true,
      defaultFps: 1,
      tokenPerSecond: {
        default: 300,
        low: 100,
      },
    },
    features: {
      videoUnderstanding: true,
      timestampAnalysis: true,
      videoClipping: true,
    },
    responseFormat: 'candidates',
  },
};

/**
 * Default output directory (can be overridden via environment variable)
 */
export const DEFAULT_OUTPUT_DIR: string =
  process.env.GOOGLE_GENAI_OUTPUT_DIR || 'datasets/google';

/**
 * Retrieve Google GenAI API key from environment variables or CLI flag.
 *
 * @param cliApiKey - Optional API key passed via CLI flag (highest priority)
 * @returns The Google GenAI API key
 * @throws Error if GOOGLE_GENAI_API_KEY is not found in any location
 *
 * @example
 * const apiKey = getGoogleGenAIApiKey();
 * const apiKey = getGoogleGenAIApiKey('AIzaSy...'); // From CLI flag
 */
export function getGoogleGenAIApiKey(cliApiKey: string | null = null): string {
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
      'Get your API key at https://aistudio.google.com/apikey',
    ].join('\n');

    throw new Error(errorMessage);
  }

  return apiKey;
}

/**
 * Validate that the API key appears to be in correct format.
 * Google AI API keys typically start with 'AIzaSy' and are 39 characters long.
 *
 * @param apiKey - The API key to validate
 * @returns True if format appears valid
 *
 * @example
 * validateApiKeyFormat('AIzaSyBx...'); // true
 * validateApiKeyFormat('invalid'); // false
 */
export function validateApiKeyFormat(apiKey: string): boolean {
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
 * @param apiKey - The API key to redact
 * @returns Redacted API key (e.g., "xxx...xyz")
 *
 * @example
 * redactApiKey('AIzaSyBx7nVz...abc1234'); // 'xxx...1234'
 */
export function redactApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) {
    return 'xxx...xxx';
  }
  return `xxx...${apiKey.slice(-4)}`;
}

const IMAGE_MODEL_IDS: readonly string[] = [
  MODELS.GEMINI_NANO_BANANA_2_1,
  MODELS.GEMINI_3_1_FLASH,
  MODELS.GEMINI_3_1_FLASH_LITE,
  MODELS.GEMINI_3_PRO,
];

/** True for an image-generation model this package catalogs (spec D2). */
export function isKnownImageModel(id: string): id is GeminiImageModel {
  return IMAGE_MODEL_IDS.includes(id);
}

/** True for an Omni model this package catalogs. */
export function isKnownOmniModel(id: string): id is OmniModel {
  return Object.prototype.hasOwnProperty.call(OMNI_MODEL_CONSTRAINTS, id);
}

// Shape patterns are deliberately open (spec D3): a ratio or size a future
// model introduces passes shape and reaches the vendor.
const ASPECT_RATIO_SHAPE = /^\d+:\d+$/;
const IMAGE_SIZE_SHAPE = /^\d+K?$/;
const IMAGE_MIME_SHAPE = /^image\/[a-z0-9.+-]+$/;

/**
 * Check image-generation parameters against the shape rules and, for a known
 * model, its constraint table. Pure: never throws, never logs.
 *
 * Shape violations apply to every id; capability violations only to ids with a
 * `MODEL_CONSTRAINTS` entry. See `Violation` for the distinction.
 *
 * @example
 * getModelViolations('gemini-3-pro-image', { prompt: 'a cat', imageSize: '512' });
 * // → [{ kind: 'capability', param: 'imageSize', value: '512', allowed: ['1K','2K','4K'], ... }]
 */
export function getModelViolations(model: string, params: ModelValidationParams): Violation[] {
  const violations: Violation[] = [];
  const constraints = Object.prototype.hasOwnProperty.call(MODEL_CONSTRAINTS, model)
    ? (MODEL_CONSTRAINTS[model] as ModelConstraint)
    : undefined;

  // ---- shape: every id ----
  if (!params.prompt || typeof params.prompt !== 'string') {
    violations.push({ kind: 'shape', param: 'prompt', value: params.prompt, message: 'Prompt is required and must be a string' });
  } else {
    const max = constraints?.promptMaxLength ?? PROMPT_MAX_LENGTH;
    if (params.prompt.length > max) {
      violations.push({ kind: 'shape', param: 'prompt', value: params.prompt.length, message: `Prompt exceeds maximum length of ${max} characters` });
    }
  }
  if (params.aspectRatio !== undefined && !ASPECT_RATIO_SHAPE.test(String(params.aspectRatio))) {
    violations.push({ kind: 'shape', param: 'aspectRatio', value: params.aspectRatio, message: `Invalid aspect ratio '${params.aspectRatio}': expected W:H, e.g. '16:9'` });
  }
  if (params.imageSize !== undefined && !IMAGE_SIZE_SHAPE.test(String(params.imageSize))) {
    violations.push({ kind: 'shape', param: 'imageSize', value: params.imageSize, message: `Invalid imageSize '${params.imageSize}': expected e.g. '512', '1K', '2K', '4K' (uppercase K)` });
  }
  (params.inputImages ?? []).forEach((image, i) => {
    if (!image || typeof image.mimeType !== 'string' || !IMAGE_MIME_SHAPE.test(image.mimeType)) {
      violations.push({ kind: 'shape', param: `inputImages[${i}].mimeType`, value: image?.mimeType, message: `Input image ${i + 1} has an invalid mimeType '${image?.mimeType}'` });
    }
    if (!image || typeof image.data !== 'string' || image.data.length === 0) {
      violations.push({ kind: 'shape', param: `inputImages[${i}].data`, value: undefined, message: `Input image ${i + 1} has no data` });
    }
  });

  if (!constraints) return violations;

  // ---- capability: known ids only ----
  if (params.aspectRatio !== undefined && constraints.aspectRatios && ASPECT_RATIO_SHAPE.test(String(params.aspectRatio))
      && !constraints.aspectRatios.includes(params.aspectRatio as AspectRatio)) {
    violations.push({
      kind: 'capability', param: 'aspectRatio', value: params.aspectRatio, allowed: constraints.aspectRatios,
      message: `Invalid aspect ratio '${params.aspectRatio}'. Must be one of: ${constraints.aspectRatios.join(', ')}`,
    });
  }
  if (params.imageSize !== undefined && IMAGE_SIZE_SHAPE.test(String(params.imageSize))) {
    if (!constraints.imageSizes) {
      violations.push({ kind: 'capability', param: 'imageSize', value: params.imageSize, message: `${model} does not accept imageSize` });
    } else if (!constraints.imageSizes.includes(params.imageSize)) {
      violations.push({
        kind: 'capability', param: 'imageSize', value: params.imageSize, allowed: constraints.imageSizes,
        message: `Invalid imageSize '${params.imageSize}' for ${model}. Must be one of: ${constraints.imageSizes.join(', ')}`,
      });
    }
  }
  const inputs = params.inputImages ?? [];
  if (constraints.inputImagesMax !== undefined && inputs.length > constraints.inputImagesMax) {
    violations.push({
      kind: 'capability', param: 'inputImages', value: inputs.length,
      message: `${model} accepts at most ${constraints.inputImagesMax} input image${constraints.inputImagesMax === 1 ? '' : 's'}; got ${inputs.length}`,
    });
  }
  inputs.forEach((image, i) => {
    if (image && typeof image.mimeType === 'string' && IMAGE_MIME_SHAPE.test(image.mimeType)
        && !SUPPORTED_IMAGE_MIME_TYPES.includes(image.mimeType)) {
      violations.push({
        kind: 'capability', param: `inputImages[${i}].mimeType`, value: image.mimeType, allowed: SUPPORTED_IMAGE_MIME_TYPES,
        message: `Input image ${i + 1} type '${image.mimeType}' is not supported. Must be one of: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}`,
      });
    }
  });
  if (isKnownImageModel(model) && params.numberOfImages !== undefined && params.numberOfImages !== 1) {
    violations.push({
      kind: 'capability', param: 'numberOfImages', value: params.numberOfImages, allowed: [1],
      message: 'Gemini generates one image per request; call again for more.',
    });
  }
  return violations;
}

/**
 * Validate image-generation parameters, throwing on the first violation.
 * Same contract as 1.x — throws before any API call — now as `ValidationError`
 * (an `Error`). Unlike 1.x, an id with no constraint entry is not rejected: it
 * gets shape checks only (spec D3).
 *
 * @param model - Model id (e.g. 'gemini-3.1-flash-image')
 * @param params - Parameters to validate
 * @throws ValidationError if any shape or capability rule fails
 *
 * @example
 * validateModelParams('gemini-3.1-flash-image', { prompt: 'a cat', aspectRatio: '1:1' });
 */
export function validateModelParams(model: string, params: ModelValidationParams): void {
  const violations = getModelViolations(model, params);
  if (violations.length > 0) throw new ValidationError(violations);
}

/**
 * Detect Gemini generation mode based on input parameters.
 *
 * @param inputImages - Array of input images
 * @returns Detected mode (TEXT_TO_IMAGE, IMAGE_TO_IMAGE, or SEMANTIC_MASKING)
 *
 * @example
 * detectGeminiMode([]); // 'text-to-image'
 * detectGeminiMode([image1]); // 'image-to-image' or 'semantic-masking'
 */
export function detectGeminiMode(inputImages: InlineData[] = []): GeminiMode {
  // Mode only. The input-image count is a per-model capability, checked by
  // getModelViolations; 1.x threw here on more than one image (spec §6).
  // Semantic masking and image-to-image use the same API; the prompt decides.
  return inputImages.length === 0 ? GEMINI_MODES.TEXT_TO_IMAGE : GEMINI_MODES.IMAGE_TO_IMAGE;
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
 * @param offset - Time offset string
 * @returns Total seconds
 * @throws Error if format is invalid
 *
 * @example
 * parseTimeOffset('90s');     // 90
 * parseTimeOffset('1m30s');   // 90
 * parseTimeOffset('1:30');    // 90
 * parseTimeOffset('1:15:30'); // 4530
 */
export function parseTimeOffset(offset: string | number): number {
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
 * Parameters for video time validation.
 */
interface VideoTimeParams {
  startOffset?: string;
  endOffset?: string;
}

/**
 * Validate video parameters before making API calls.
 * Validates video path, start offset, and end offset.
 *
 * @param params - Video parameters
 * @returns Parsed offsets in seconds
 * @throws Error if validation fails
 *
 * @example
 * validateVideoParams({ startOffset: '30s', endOffset: '60s' });
 * // { startSeconds: 30, endSeconds: 60 }
 */
export function validateVideoParams(params: VideoTimeParams): ParsedTimeOffsets {
  const result: ParsedTimeOffsets = {};

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
// OMNI VIDEO GENERATION CONFIGURATION (3.0 — replaces Veo, shut down 2026-10-22)
// ============================================================================

/**
 * Gemini Omni video models. `gemini-omni-1.1-flash` is not listed: it routes to
 * 1.2 from 2026-12-03 (deprecations page), so it has an announced end (spec D2).
 */
export const OMNI_MODELS: OmniModels = {
  OMNI_1_2_FLASH: 'gemini-omni-1.2-flash',
};

/** Omni output aspect ratios. */
export const OMNI_ASPECT_RATIOS: OmniAspectRatio[] = ['16:9', '9:16'];

/** Omni output resolutions. */
export const OMNI_RESOLUTIONS: OmniResolution[] = ['360p', '720p', '1080p', '4k'];

/**
 * Values `generation_config.video_config.task` accepts — the API's own list
 * (live 2026-11-08). SDK 2.32's `Task` type also has `upscale`; the API rejects
 * it ("The value 'upscale' is not supported").
 */
export const OMNI_TASKS: OmniTask[] = ['text_to_video', 'image_to_video', 'reference_to_video', 'edit', 'extend'];

/**
 * Omni timeouts. Generation is one synchronous call that returns when the video
 * is done, so the request timeout bounds the whole job.
 */
export const OMNI_TIMEOUTS: OmniTimeouts = {
  REQUEST: 900000, // 15 minutes; 4k at 15 s took 213 s live (2026-11-08)
  FILE_POLL_INTERVAL: 5000, // Google's own example polls every 5 s
  FILE_POLL_MAX_ATTEMPTS: 120, // 10 minutes
};

/** Omni model constraints (omni guide + model page, 2026-11-08). */
export const OMNI_MODEL_CONSTRAINTS: OmniModelConstraints = {
  [OMNI_MODELS.OMNI_1_2_FLASH]: {
    aspectRatios: OMNI_ASPECT_RATIOS,
    resolutions: OMNI_RESOLUTIONS,
    durationSeconds: { min: 3, max: 15, default: 10 },
    interpolationAndExtensionMaxSeconds: 10,
    extendedTotalMaxSeconds: 30,
    editInputMaxSeconds: 15,
    maxImages: 6,
    tasks: OMNI_TASKS,
    features: {
      textToVideo: true,
      imageToVideo: true,
      interpolation: true,
      subjectReference: true,
      editing: true,
      extension: true,
      nativeAudio: true,
    },
  },
};

const OMNI_ASPECT_SHAPE = /^\d+:\d+$/;
const OMNI_RESOLUTION_SHAPE = /^\d+(p|k)$/;
const OMNI_DURATION_SHAPE = /^\d+$/;
const OMNI_TASK_SHAPE = /^[a-z_]+$/;
const OMNI_MIME_SHAPE = /^(image|video)\/[a-z0-9.+-]+$/;
const OMNI_PROMPT_MAX_LENGTH = 10000;

/** The fields of `OmniGenerateParams` the validator reads, plus removed Veo names (so a 2.x caller is told). */
type OmniValidationParams = Partial<OmniGenerateParams> & { negativePrompt?: unknown; personGeneration?: unknown; seed?: unknown };

/**
 * Check Omni parameters against the shape rules and, for a known model, its
 * constraint table (spec D3/D5). Pure: never throws, never logs.
 *
 * Not checked, on purpose: which mode a prompt selects (Omni decides that from
 * the prompt), so the 10-second ceiling for interpolation and extension is
 * left to the API.
 */
export function getOmniViolations(model: string, params: OmniValidationParams): Violation[] {
  const v: Violation[] = [];
  const c: OmniModelConstraint | undefined = Object.prototype.hasOwnProperty.call(OMNI_MODEL_CONSTRAINTS, model)
    ? OMNI_MODEL_CONSTRAINTS[model]
    : undefined;
  const shape = (param: string, value: unknown, message: string): void => {
    v.push({ kind: 'shape', param, value, message });
  };
  const cap = (param: string, value: unknown, message: string, allowed?: readonly unknown[]): void => {
    v.push({ kind: 'capability', param, value, message, ...(allowed && { allowed }) });
  };

  // ---- shape: every id ----
  // Veo parameters with no Omni field. Only negativePrompt has a substitute (the
  // prompt itself); the advice is per parameter (consumer-validate run #8).
  const removedAdvice = {
    negativePrompt: 'put negatives in the prompt instead (e.g. "No dialogue")',
    personGeneration: 'it has no Omni equivalent; remove it',
    seed: 'it has no Omni equivalent; remove it',
  } as const;
  for (const removed of ['negativePrompt', 'personGeneration', 'seed'] as const) {
    if (params[removed] !== undefined) {
      shape(removed, params[removed], `${removed} is not supported by Gemini Omni; ${removedAdvice[removed]}`);
    }
  }
  if (typeof params.prompt !== 'string' || params.prompt.trim() === '') {
    shape('prompt', params.prompt, 'Prompt is required and must be a non-empty string');
  } else if (params.prompt.length > OMNI_PROMPT_MAX_LENGTH) {
    shape('prompt', params.prompt.length, `Prompt exceeds maximum length of ${OMNI_PROMPT_MAX_LENGTH} characters`);
  }
  const aspectOk = params.aspectRatio === undefined || OMNI_ASPECT_SHAPE.test(String(params.aspectRatio));
  if (!aspectOk) shape('aspectRatio', params.aspectRatio, `Invalid aspect ratio '${params.aspectRatio}': expected W:H, e.g. '16:9'`);
  const resolutionOk = params.resolution === undefined || OMNI_RESOLUTION_SHAPE.test(String(params.resolution));
  if (!resolutionOk) shape('resolution', params.resolution, `Invalid resolution '${params.resolution}': expected e.g. '720p', '4k'`);
  const durationOk = params.durationSeconds === undefined || OMNI_DURATION_SHAPE.test(String(params.durationSeconds));
  if (!durationOk) shape('durationSeconds', params.durationSeconds, `Invalid duration '${params.durationSeconds}': expected whole seconds, e.g. 8`);
  const taskOk = params.task === undefined || OMNI_TASK_SHAPE.test(String(params.task));
  if (!taskOk) shape('task', params.task, `Invalid task '${params.task}': expected e.g. 'image_to_video'`);
  if (params.delivery !== undefined && params.delivery !== 'inline' && params.delivery !== 'uri') {
    shape('delivery', params.delivery, `Invalid delivery '${String(params.delivery)}': must be 'inline' or 'uri'`);
  }
  if (params.images !== undefined) {
    if (!Array.isArray(params.images)) {
      shape('images', params.images, 'images must be an array');
    } else {
      params.images.forEach((img, i) => checkMedia(`images[${i}]`, img, 'image', shape));
    }
  }
  if (params.video !== undefined) checkMedia('video', params.video, 'video', shape);
  if (params.previousInteractionId !== undefined && (typeof params.previousInteractionId !== 'string' || params.previousInteractionId === '')) {
    shape('previousInteractionId', params.previousInteractionId, 'previousInteractionId must be a non-empty string');
  }
  if (!c) return v;

  // ---- capability: known ids only ----
  if (params.aspectRatio !== undefined && aspectOk && !c.aspectRatios.includes(params.aspectRatio as OmniAspectRatio)) {
    cap('aspectRatio', params.aspectRatio, `Invalid aspect ratio '${params.aspectRatio}' for ${model}. Must be one of: ${c.aspectRatios.join(', ')}`, c.aspectRatios);
  }
  if (params.resolution !== undefined && resolutionOk && !c.resolutions.includes(params.resolution as OmniResolution)) {
    cap('resolution', params.resolution, `Invalid resolution '${params.resolution}' for ${model}. Must be one of: ${c.resolutions.join(', ')}`, c.resolutions);
  }
  if (params.durationSeconds !== undefined && durationOk) {
    const n = Number(params.durationSeconds);
    const { min, max } = c.durationSeconds;
    if (n < min || n > max) {
      cap('durationSeconds', params.durationSeconds, `Invalid duration ${n}s for ${model}. Must be ${min}-${max} seconds`);
    }
  }
  if (params.task !== undefined && taskOk && !c.tasks.includes(params.task as OmniTask)) {
    cap('task', params.task, `Invalid task '${params.task}' for ${model}. Must be one of: ${c.tasks.join(', ')}`, c.tasks);
  }
  if (params.task !== undefined && params.previousInteractionId !== undefined) {
    // Live 2026-11-08: "previous_interaction_id is not allowed when video task is set."
    // To edit or extend with a task, pass the video as `video` instead.
    cap('task', params.task, `task cannot be combined with previousInteractionId on ${model} (the API rejects the pair). Drop task and describe the edit in the prompt, or pass the video as \`video\``);
  }
  if (Array.isArray(params.images) && params.images.length > c.maxImages) {
    cap('images', params.images.length, `Maximum ${c.maxImages} images allowed for ${model}. Got: ${params.images.length}`);
  }
  return v;
}

/** Shape of one image or video input: base64 `data` + `mimeType`, or a `uri`. */
function checkMedia(
  param: string,
  media: unknown,
  kind: 'image' | 'video',
  shape: (param: string, value: unknown, message: string) => void
): void {
  if (typeof media !== 'object' || media === null) {
    shape(param, media, `${param} must be an object with data + mimeType, or uri`);
    return;
  }
  const m: { data?: unknown; uri?: unknown; mimeType?: unknown } = media;
  const hasData = typeof m.data === 'string' && m.data !== '';
  const hasUri = typeof m.uri === 'string' && m.uri !== '';
  if (hasData === hasUri) {
    shape(param, undefined, `${param} needs exactly one of data (base64) or uri`);
    return;
  }
  if (hasData && (typeof m.mimeType !== 'string' || m.mimeType === '')) {
    shape(`${param}.mimeType`, m.mimeType, `${param}.mimeType is required with data`);
  } else if (m.mimeType !== undefined && (typeof m.mimeType !== 'string' || !OMNI_MIME_SHAPE.test(m.mimeType) || !m.mimeType.startsWith(`${kind}/`))) {
    shape(`${param}.mimeType`, m.mimeType, `${param}.mimeType must be a ${kind}/* type. Got: ${String(m.mimeType)}`);
  }
}

/**
 * Validate Omni parameters: throws `ValidationError` on any violation (shape or
 * capability), returns `true` otherwise. The clients use `getOmniViolations`
 * directly so `capabilityValidation: 'warn'` can downgrade capability rules.
 */
export function validateOmniParams(model: string, params: OmniValidationParams): boolean {
  const violations = getOmniViolations(model, params);
  if (violations.length > 0) throw new ValidationError(violations);
  return true;
}
