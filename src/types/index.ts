/**
 * Google GenAI API Type Definitions
 *
 * Comprehensive TypeScript types for the Google GenAI API wrapper,
 * including Gemini, Imagen, and Veo models.
 */

// ==================== API CONFIGURATION TYPES ====================

/**
 * Options for initializing the GoogleGenAIAPI class.
 */
export interface GoogleGenAIApiOptions {
  /** Google GenAI API key */
  apiKey?: string | null;
  /** Logging level (debug, info, warn, error) */
  logLevel?: string;
}

/**
 * Options for initializing the GoogleGenAIVideoAPI class.
 */
export interface GoogleGenAIVideoApiOptions {
  /** Google GenAI API key */
  apiKey?: string | null;
  /** Logging level (debug, info, warn, error) */
  logLevel?: string;
}

/**
 * Options for initializing the GoogleGenAIVeoAPI class.
 */
export interface GoogleGenAIVeoApiOptions {
  /** Google GenAI API key */
  apiKey?: string | null;
  /** Logging level (debug, info, warn, error) */
  logLevel?: string;
}

// ==================== MODEL TYPES ====================

/**
 * Gemini model identifiers.
 */
export type GeminiModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview'
  | 'gemini-2.5-flash';

/**
 * Imagen model identifiers.
 */
export type ImagenModel = 'imagen-4.0-generate-001';

/**
 * Veo model identifiers.
 */
export type VeoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-generate-preview'
  | 'veo-3.0-generate-001'
  | 'veo-3.0-fast-generate-001'
  | 'veo-2.0-generate-001';

/**
 * All supported models.
 */
export interface Models {
  GEMINI: GeminiModel;
  GEMINI_3_PRO: GeminiModel;
  IMAGEN: ImagenModel;
  GEMINI_VIDEO: GeminiModel;
}

/**
 * Veo models mapping.
 */
export interface VeoModels {
  VEO_3_1: VeoModel;
  VEO_3_1_FAST: VeoModel;
  VEO_3: VeoModel;
  VEO_3_FAST: VeoModel;
  VEO_2: VeoModel;
}

// ==================== ASPECT RATIO & RESOLUTION TYPES ====================

/**
 * Image aspect ratios (common to Gemini and Imagen).
 */
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

/**
 * Veo video aspect ratios.
 */
export type VeoAspectRatio = '16:9' | '9:16';

/**
 * Veo video resolutions.
 */
export type VeoResolution = '720p' | '1080p';

/**
 * Veo video durations (in seconds as strings).
 */
export type VeoDuration = '4' | '5' | '6' | '8';

/**
 * Person generation settings for Veo.
 */
export type VeoPersonGeneration = 'allow_all' | 'allow_adult' | 'dont_allow';

// ==================== MODE TYPES ====================

/**
 * Gemini generation modes.
 */
export type GeminiMode = 'text-to-image' | 'image-to-image' | 'semantic-masking';

/**
 * Veo generation modes.
 */
export type VeoMode =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-images'
  | 'interpolation'
  | 'extension';

/**
 * Gemini modes object.
 */
export interface GeminiModes {
  TEXT_TO_IMAGE: GeminiMode;
  IMAGE_TO_IMAGE: GeminiMode;
  SEMANTIC_MASKING: GeminiMode;
}

/**
 * Veo modes object.
 */
export interface VeoModes {
  TEXT_TO_VIDEO: VeoMode;
  IMAGE_TO_VIDEO: VeoMode;
  REFERENCE_IMAGES: VeoMode;
  INTERPOLATION: VeoMode;
  EXTENSION: VeoMode;
}

// ==================== DATA TYPES ====================

/**
 * Inline data format for Gemini API (base64-encoded image).
 */
export interface InlineData {
  /** MIME type (e.g., 'image/png', 'image/jpeg') */
  mimeType: string;
  /** Base64-encoded image data */
  data: string;
}

/**
 * Veo image format for video generation.
 */
export interface VeoImage {
  /** Base64-encoded image data */
  imageBytes: string;
  /** MIME type (e.g., 'image/png', 'image/jpeg') */
  mimeType: string;
}

/**
 * Reference image for Veo reference-images mode.
 */
export interface VeoReferenceImage {
  /** Image data */
  image: VeoImage;
  /** Reference type (e.g., 'asset') */
  referenceType: string;
}

/**
 * File data for video understanding.
 */
export interface FileData {
  /** File URI from Files API */
  fileUri: string;
  /** Video MIME type */
  mimeType: string;
  /** Optional video clipping metadata */
  videoMetadata?: VideoClipMetadata;
}

// ==================== GENERATION PARAMETER TYPES ====================

/**
 * Parameters for Gemini image generation.
 */
export interface GeminiGenerateParams {
  /** Generation or editing prompt */
  prompt: string;
  /** Input images for editing (max 1) */
  inputImages?: InlineData[];
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Model to use */
  model?: GeminiModel;
  /** Override auto-detection mode */
  mode?: GeminiMode;
}

/**
 * Parameters for Imagen image generation.
 */
export interface ImagenGenerateParams {
  /** Generation prompt */
  prompt: string;
  /** Number of images to generate (1-4) */
  numberOfImages?: number;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
}

/**
 * Base parameters for Veo video generation.
 */
export interface VeoGenerateParams {
  /** Generation prompt */
  prompt: string;
  /** Veo model to use */
  model?: VeoModel;
  /** Video aspect ratio */
  aspectRatio?: VeoAspectRatio;
  /** Video resolution */
  resolution?: VeoResolution;
  /** Video duration in seconds */
  durationSeconds?: VeoDuration | string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Person generation setting */
  personGeneration?: VeoPersonGeneration;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Parameters for Veo image-to-video generation.
 */
export interface VeoImageToVideoParams extends VeoGenerateParams {
  /** Image to animate */
  image: VeoImage;
}

/**
 * Parameters for Veo reference images generation.
 */
export interface VeoReferenceParams extends VeoGenerateParams {
  /** 1-3 reference images */
  referenceImages: VeoReferenceImage[];
}

/**
 * Parameters for Veo interpolation generation.
 */
export interface VeoInterpolationParams extends Omit<VeoGenerateParams, 'prompt'> {
  /** Optional prompt */
  prompt?: string;
  /** First frame image */
  firstFrame: VeoImage;
  /** Last frame image */
  lastFrame: VeoImage;
}

/**
 * Parameters for Veo video extension.
 */
export interface VeoExtendParams extends VeoGenerateParams {
  /** Video object from previous generation */
  video: VeoVideoObject;
}

/**
 * Parameters for video understanding.
 */
export interface VideoGenerateParams {
  /** Analysis prompt */
  prompt: string;
  /** File URI from uploadVideoFile() */
  fileUri: string;
  /** Video MIME type */
  mimeType: string;
  /** Optional video clipping metadata */
  videoMetadata?: VideoClipMetadata;
}

/**
 * Video clipping metadata for time-based analysis.
 */
export interface VideoClipMetadata {
  /** Start offset (e.g., "30s") */
  startOffset?: string;
  /** End offset (e.g., "90s") */
  endOffset?: string;
}

// ==================== RESPONSE TYPES ====================

/**
 * Part extracted from Gemini response.
 */
export interface GeminiPart {
  /** Part type */
  type: 'text' | 'image';
  /** Text content (for text parts) */
  content?: string;
  /** MIME type (for image parts) */
  mimeType?: string;
  /** Base64 image data (for image parts) */
  data?: string;
}

/**
 * Gemini API response structure.
 */
export interface GeminiResponse {
  /** Response candidates */
  candidates?: GeminiCandidate[];
  /** Direct parts (alternative format) */
  parts?: GeminiResponsePart[];
}

/**
 * Gemini response candidate.
 */
export interface GeminiCandidate {
  /** Content object */
  content?: {
    /** Parts array */
    parts?: GeminiResponsePart[];
  };
}

/**
 * Gemini response part.
 */
export interface GeminiResponsePart {
  /** Text content */
  text?: string;
  /** Inline data (image) */
  inlineData?: {
    /** MIME type */
    mimeType?: string;
    /** Base64 data */
    data?: string;
  };
}

/**
 * Imagen API response structure.
 */
export interface ImagenResponse {
  /** Generated images array */
  generatedImages?: ImagenGeneratedImage[];
}

/**
 * Imagen generated image.
 */
export interface ImagenGeneratedImage {
  /** Image object */
  image: {
    /** Base64 image bytes */
    imageBytes: string;
  };
}

/**
 * Veo video object from generation.
 */
export interface VeoVideoObject {
  /** Video identifier or data */
  [key: string]: unknown;
}

/**
 * Veo operation object (returned from generation, used for polling).
 */
export interface VeoOperation {
  /** Operation name/ID */
  name: string;
  /** Whether operation is complete */
  done: boolean;
  /** Response when complete */
  response?: VeoOperationResponse;
  /** Error if failed */
  error?: VeoError;
  /** Operation metadata */
  metadata?: VeoOperationMetadata;
}

/**
 * Veo operation response.
 */
export interface VeoOperationResponse {
  /** Generated videos */
  generatedVideos?: VeoGeneratedVideo[];
}

/**
 * Veo generated video.
 */
export interface VeoGeneratedVideo {
  /** Video object for download/extension */
  video: VeoVideoObject;
}

/**
 * Veo operation metadata.
 */
export interface VeoOperationMetadata {
  /** Model used */
  model?: string;
  [key: string]: unknown;
}

/**
 * Veo error object.
 */
export interface VeoError {
  /** Error message */
  message?: string;
  /** Error code */
  code?: number;
}

/**
 * Video upload result from Files API.
 */
export interface VideoUploadResult {
  /** File URI for referencing */
  uri: string;
  /** File name */
  name: string;
  /** Video MIME type */
  mimeType: string;
  /** Processing state (ACTIVE, PROCESSING, FAILED) */
  state: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * File info from Files API.
 */
export interface FileInfo {
  /** File URI */
  uri: string;
  /** File name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Processing state */
  state: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Error info if failed */
  error?: {
    message?: string;
  };
}

/**
 * Video analysis result.
 */
export interface VideoAnalysisResult {
  /** Analysis text */
  text: string;
  /** Extracted timestamp frames */
  frames: VideoFrame[];
}

/**
 * Video frame with timestamp.
 */
export interface VideoFrame {
  /** Timestamp string (e.g., "1:30") */
  timestamp: string;
  /** Description/context around timestamp */
  description: string;
}

/**
 * Veo download result.
 */
export interface VeoDownloadResult {
  /** Output file path */
  path: string;
  /** Video object */
  video: VeoVideoObject;
}

/**
 * Extracted video info for extension.
 */
export interface VeoExtractedVideo {
  /** Video object for extension */
  video: VeoVideoObject;
  /** Whether video has audio */
  hasAudio: boolean;
}

/**
 * Veo model info.
 */
export interface VeoModelInfo {
  /** Model identifier */
  model: VeoModel;
  /** Supported aspect ratios */
  aspectRatios: VeoAspectRatio[];
  /** Supported resolutions */
  resolutions: VeoResolution[];
  /** Supported durations */
  durations: string[];
  /** Feature flags */
  features: VeoFeatures;
  /** Reference images constraints */
  referenceImages?: { max: number } | null;
  /** Extension constraints */
  extension?: VeoExtensionConstraints | null;
  /** 1080p constraints */
  resolution1080p?: Veo1080pConstraints | null;
  /** Maximum prompt length in tokens */
  promptMaxLength: number;
}

// ==================== CONSTRAINT TYPES ====================

/**
 * Model constraint for Gemini/Imagen models.
 */
export interface ModelConstraint {
  /** Supported aspect ratios */
  aspectRatios?: AspectRatio[];
  /** Maximum prompt length */
  promptMaxLength?: number;
  /** Number of images constraints (Imagen) */
  numberOfImages?: {
    min: number;
    max: number;
    default: number;
  };
  /** Maximum input images (Gemini) */
  inputImagesMax?: number;
  /** Supported generation modes */
  supportedModes?: GeminiMode[];
  /** Feature flags */
  features?: Record<string, boolean>;
  /** Response format type */
  responseFormat?: string;
  /** Video-specific constraints */
  video?: VideoModelConstraints;
}

/**
 * Video model constraints.
 */
export interface VideoModelConstraints {
  /** Supported video formats */
  supportedFormats: string[];
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Size threshold requiring Files API */
  requiresFilesAPI: number;
  /** Supports video clipping */
  supportsClipping: boolean;
  /** Supports FPS control */
  supportsFps: boolean;
  /** Default FPS */
  defaultFps: number;
  /** Tokens per second of video */
  tokenPerSecond: {
    default: number;
    low: number;
  };
}

/**
 * Model constraints mapping.
 */
export interface ModelConstraints {
  [model: string]: ModelConstraint;
}

/**
 * Veo model constraint.
 */
export interface VeoModelConstraint {
  /** Supported aspect ratios */
  aspectRatios: VeoAspectRatio[];
  /** Supported resolutions */
  resolutions: VeoResolution[];
  /** Supported durations */
  durations: string[];
  /** Feature flags */
  features: VeoFeatures;
  /** Reference images constraints (Veo 3.1 only) */
  referenceImages?: { max: number } | null;
  /** Extension constraints (Veo 3.1 only) */
  extension?: VeoExtensionConstraints | null;
  /** 1080p-specific constraints */
  resolution1080p?: Veo1080pConstraints | null;
  /** Maximum prompt length in tokens */
  promptMaxLength: number;
}

/**
 * Veo feature flags.
 */
export interface VeoFeatures {
  /** Text-to-video support */
  textToVideo: boolean;
  /** Image-to-video support */
  imageToVideo: boolean;
  /** Reference images support (Veo 3.1) */
  referenceImages: boolean;
  /** Frame interpolation support (Veo 3.1) */
  interpolation: boolean;
  /** Video extension support (Veo 3.1) */
  extension: boolean;
  /** Native audio generation (Veo 3.x) */
  nativeAudio: boolean;
}

/**
 * Veo extension constraints.
 */
export interface VeoExtensionConstraints {
  /** Maximum input video length in seconds */
  maxInputLength: number;
  /** Length added per extension */
  extensionLength: number;
  /** Maximum total video length */
  maxTotalLength: number;
}

/**
 * Veo 1080p-specific constraints.
 */
export interface Veo1080pConstraints {
  /** Required duration for 1080p */
  requiresDuration: string;
  /** Required aspect ratio (null = any) */
  aspectRatio: VeoAspectRatio | null;
}

/**
 * Veo model constraints mapping.
 */
export interface VeoModelConstraints {
  [model: string]: VeoModelConstraint;
}

// ==================== VALIDATION TYPES ====================

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of error messages */
  errors: string[];
}

/**
 * Video path validation result.
 */
export interface VideoValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Detected MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

/**
 * Parsed time offsets from validation.
 */
export interface ParsedTimeOffsets {
  /** Start offset in seconds */
  startSeconds?: number;
  /** End offset in seconds */
  endSeconds?: number;
}

/**
 * Parameters for model validation.
 */
export interface ModelValidationParams {
  /** Generation prompt */
  prompt: string;
  /** Aspect ratio */
  aspectRatio?: string;
  /** Number of images (Imagen) */
  numberOfImages?: number;
  /** Input images (Gemini) */
  inputImages?: InlineData[];
}

/**
 * Parameters for video time validation.
 */
export interface VideoTimeParams {
  /** Start offset string */
  startOffset?: string;
  /** End offset string */
  endOffset?: string;
}

/**
 * Parameters for Veo validation.
 */
export interface VeoValidationParams {
  /** Generation prompt */
  prompt?: string;
  /** Aspect ratio */
  aspectRatio?: string;
  /** Resolution */
  resolution?: string;
  /** Duration in seconds */
  durationSeconds?: string;
  /** Reference images */
  referenceImages?: VeoReferenceImage[];
  /** Video for extension */
  video?: VeoVideoObject;
  /** First frame for interpolation */
  firstFrame?: VeoImage;
  /** Last frame for interpolation */
  lastFrame?: VeoImage;
  /** Person generation setting */
  personGeneration?: string;
}

// ==================== ERROR TYPES ====================

/**
 * Error classification for retry logic.
 */
export type ErrorClassification =
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'USER_ACTIONABLE'
  | 'SAFETY_BLOCKED'
  | 'AUDIO_BLOCKED';

/**
 * Extended error with classification info.
 */
export interface ClassifiedError extends Error {
  /** HTTP status code */
  status?: number;
  /** Response object */
  response?: {
    status?: number;
    data?: unknown;
  };
  /** File state (for file processing errors) */
  fileState?: string;
  /** Whether error is a timeout */
  isTimeout?: boolean;
  /** Operation name (for Veo timeouts) */
  operationName?: string;
  /** Operation error details */
  operationError?: VeoError;
}

// ==================== UTILITY TYPES ====================

/**
 * Spinner object for long-running operations.
 */
export interface SpinnerObject {
  /** Start the spinner animation */
  start(): void;
  /** Stop the spinner and optionally show final message */
  stop(finalMessage?: string | null): void;
  /** Update the spinner message */
  update(newMessage: string): void;
}

/**
 * Veo spinner with elapsed time tracking.
 */
export interface VeoSpinnerObject {
  /** Start the spinner animation */
  start(): void;
  /** Stop the spinner and optionally show final message */
  stop(finalMessage?: string | null): void;
  /** Update elapsed time in milliseconds */
  updateElapsed(ms: number): void;
  /** Update the spinner message */
  updateMessage(newMessage: string): void;
}

/**
 * Options for Veo wait/polling.
 */
export interface VeoWaitOptions {
  /** Maximum polling attempts */
  maxAttempts?: number;
  /** Polling interval in milliseconds */
  intervalMs?: number;
  /** Progress callback */
  onProgress?: (operation: VeoOperation, elapsedMs: number) => void;
}

/**
 * Veo metadata input for saving.
 */
export interface VeoMetadataInput {
  /** Operation name/ID */
  operationName: string;
  /** Model used */
  model: string;
  /** Generation mode */
  mode: VeoMode;
  /** Generation parameters */
  parameters: Record<string, unknown>;
  /** Optional timestamp (auto-generated if not provided) */
  timestamp?: string;
}

/**
 * Saved Veo metadata structure.
 */
export interface VeoSavedMetadata {
  /** Operation name */
  operation_name: string;
  /** Model used */
  model: string;
  /** Generation mode */
  mode: VeoMode;
  /** ISO timestamp */
  timestamp: string;
  /** Generation parameters */
  parameters: Record<string, unknown>;
  /** Result info */
  result: {
    video_path: string;
    status: string;
  };
}

// ==================== TIMEOUT CONFIGURATION TYPES ====================

/**
 * Video processing timeouts.
 */
export interface VideoTimeouts {
  /** Upload timeout in ms */
  UPLOAD: number;
  /** Processing timeout in ms */
  PROCESSING: number;
  /** Initial poll interval in ms */
  POLL_INTERVAL_START: number;
  /** Maximum poll interval in ms */
  POLL_INTERVAL_MAX: number;
  /** Maximum polling attempts */
  POLL_MAX_ATTEMPTS: number;
}

/**
 * Veo generation timeouts.
 */
export interface VeoTimeouts {
  /** Minimum latency in ms */
  MIN_LATENCY: number;
  /** Maximum latency in ms */
  MAX_LATENCY: number;
  /** Poll interval in ms */
  POLL_INTERVAL: number;
  /** Maximum polling attempts */
  POLL_MAX_ATTEMPTS: number;
  /** Video retention hours */
  VIDEO_RETENTION_HOURS: number;
}

/**
 * Video size limits.
 */
export interface VideoSizeLimits {
  /** Maximum file size in bytes */
  MAX_FILE_SIZE: number;
  /** Recommended max for fast processing */
  RECOMMENDED_MAX: number;
  /** Maximum for inline data */
  INLINE_MAX: number;
}

// ==================== CLI TYPES ====================

/**
 * CLI options from Commander.
 */
export interface CliOptions {
  /** Use Gemini model */
  gemini?: boolean;
  /** Use Gemini 3 Pro model */
  gemini3Pro?: boolean;
  /** Use Imagen model */
  imagen?: boolean;
  /** Video analysis mode */
  video?: boolean;
  /** Veo video generation mode */
  veo?: boolean;
  /** Generation prompts */
  prompt?: string[];
  /** Input image path */
  inputImage?: string;
  /** Aspect ratio */
  aspectRatio?: string;
  /** Number of images (Imagen) */
  numberOfImages?: string;
  /** Input video path */
  inputVideo?: string;
  /** Video start offset */
  videoStart?: string;
  /** Video end offset */
  videoEnd?: string;
  /** Veo model */
  veoModel?: string;
  /** Veo aspect ratio */
  veoAspectRatio?: string;
  /** Veo resolution */
  veoResolution?: string;
  /** Veo duration */
  veoDuration?: string;
  /** Veo negative prompt */
  veoNegativePrompt?: string;
  /** Veo input image */
  veoImage?: string;
  /** Veo person generation setting */
  veoPersonGeneration?: string;
  /** Output directory */
  outputDir?: string;
  /** API key */
  apiKey?: string;
  /** Log level */
  logLevel?: string;
  /** Show examples */
  examples?: boolean;
  /** Show help */
  help?: boolean;
}
