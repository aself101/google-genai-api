/**
 * Google GenAI API Type Definitions
 *
 * Comprehensive TypeScript types for the Google GenAI API wrapper,
 * including Gemini image, video-understanding, and Gemini Omni video models.
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
 * Options for `extractGeminiParts`.
 */
export interface ExtractGeminiPartsOptions {
  /** Include interim "thinking" parts (`thought: true`). Default false: only final output. */
  includeThoughts?: boolean;
}

/**
 * Third constructor argument of `GoogleGenAIAPI` and `GoogleGenAIOmniAPI`.
 */
export interface GoogleGenAIClientOptions {
  /**
   * What to do when a known model's constraint table rejects a parameter
   * (a `capability` violation). `'error'` (default) throws `ValidationError`
   * before any network call; `'warn'` logs each violation and sends the request
   * anyway — for when the vendor accepts something the table does not know yet.
   * Shape violations always throw.
   */
  capabilityValidation?: 'error' | 'warn';
}

// ==================== MODEL TYPES ====================

/**
 * Gemini model identifiers.
 */
export type GeminiModel =
  | 'gemini-nano-banana-2.1'
  | 'gemini-3.1-flash-image'
  | 'gemini-3.1-flash-lite-image'
  | 'gemini-3-pro-image'
  | 'gemini-3.8-flash';

/**
 * Gemini image-generation model identifiers this package catalogs
 * (current models only — spec D2).
 */
export type GeminiImageModel = Exclude<GeminiModel, 'gemini-3.8-flash'>;

/**
 * Any image model id. Known ids autocomplete; any other string is accepted and
 * sent without capability validation (spec D3), so a model Google releases
 * after this package does, or one dropped from the catalog that Google still
 * serves, stays usable.
 */
export type ImageModelId = GeminiImageModel | (string & {});

/**
 * All supported models.
 */
export interface Models {
  /** Added in 3.0. */
  GEMINI_NANO_BANANA_2_1: GeminiModel;
  GEMINI_3_1_FLASH: GeminiModel;
  GEMINI_3_1_FLASH_LITE: GeminiModel;
  GEMINI_3_PRO: GeminiModel;
  GEMINI_VIDEO: GeminiModel;
}

// ==================== ASPECT RATIO & RESOLUTION TYPES ====================

/**
 * Image aspect ratios for Gemini image models.
 */
export type AspectRatio =
  | '1:1'
  | '3:2'
  | '2:3'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'
  | '1:4'
  | '4:1'
  | '1:8'
  | '8:1'
  | (string & {});

/**
 * Gemini image output sizes (`imageConfig.imageSize`). Uppercase K; `'512'` is
 * the 3.1 Flash half-K tier. Which sizes a model accepts is in its constraint.
 */
export type ImageSize = '512' | '1K' | '2K' | '4K' | (string & {});

// ==================== MODE TYPES ====================

/**
 * Gemini generation modes.
 */
export type GeminiMode = 'text-to-image' | 'image-to-image' | 'semantic-masking';

/**
 * Gemini modes object.
 */
export interface GeminiModes {
  TEXT_TO_IMAGE: GeminiMode;
  IMAGE_TO_IMAGE: GeminiMode;
  SEMANTIC_MASKING: GeminiMode;
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
  /** Input images for editing / reference (per-model limit: `MODEL_CONSTRAINTS[model].inputImagesMax`) */
  inputImages?: InlineData[];
  /**
   * Aspect ratio, sent as `imageConfig.aspectRatio`. Omit it to let the model
   * choose the framing — which is what every 1.x call actually got, because 1.x
   * never sent this value (spec §1.4).
   */
  aspectRatio?: AspectRatio;
  /** Output size, sent as `imageConfig.imageSize` (per-model: `MODEL_CONSTRAINTS[model].imageSizes`) */
  imageSize?: ImageSize;
  /** Model to use (default `DEFAULT_IMAGE_MODEL`); unknown ids pass through with a warning */
  model?: ImageModelId;
  /** Override auto-detection mode */
  mode?: GeminiMode;
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
  /** Set when the prompt itself was blocked; there are then no candidates */
  promptFeedback?: { blockReason?: string };
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
  /** Why generation stopped: `STOP`, or e.g. `IMAGE_SAFETY` / `IMAGE_RECITATION` when no image is returned */
  finishReason?: string;
}

/**
 * Gemini response part.
 */
export interface GeminiResponsePart {
  /** True for an interim "thinking" part (e.g. gemini-3-pro-image's draft images), not final output */
  thought?: boolean;
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

// ==================== CONSTRAINT TYPES ====================

/**
 * Model constraint for Gemini models.
 */
export interface ModelConstraint {
  /** Supported aspect ratios */
  aspectRatios?: AspectRatio[];
  /** Accepted `imageSize` values; `null`/absent means the model does not take the parameter */
  imageSizes?: ImageSize[] | null;
  /** Maximum prompt length */
  promptMaxLength?: number;
  /** Number of images constraints (1.x field, kept for compatibility; no current model sets it) */
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
  /** Output image size (`'512'`, `'1K'`, `'2K'`, `'4K'`) */
  imageSize?: string;
  /** Number of images — Gemini generates one per request; any other value is rejected */
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

// ==================== ERROR TYPES ====================

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
  /** Interaction id, when an Omni interaction failed after it was created */
  interactionId?: string;
}

// ==================== OMNI VIDEO GENERATION TYPES (3.0) ====================

/** Gemini Omni video model identifiers this package catalogs (current models only — spec D2). */
export type OmniModel = 'gemini-omni-1.2-flash';

/**
 * Any Omni model id. Known ids autocomplete; any other string is accepted and
 * sent with shape checks only (spec D3).
 */
export type OmniModelId = OmniModel | (string & {});

/** Omni models mapping. */
export interface OmniModels {
  OMNI_1_2_FLASH: OmniModel;
}

/** Omni output aspect ratios (`response_format.aspect_ratio`). Default 16:9. */
export type OmniAspectRatio = '16:9' | '9:16';

/** Omni output resolutions (`response_format.resolution`). Default 720p; 1080p and 4k are upscaled. */
export type OmniResolution = '360p' | '720p' | '1080p' | '4k';

/**
 * `generation_config.video_config.task`. Google's advice: leave it unset and say
 * in the prompt what you want; set it only when the prompt does not select the mode.
 * Not with `previousInteractionId`: the API rejects that pair (pass `video` instead).
 */
export type OmniTask = 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit' | 'extend';

/**
 * How the video comes back. `inline`: base64 in the response (Google's default).
 * `uri`: a Files API URI, downloaded by `saveVideo` — Google recommends it for
 * videos over 4 MB.
 */
export type OmniDelivery = 'inline' | 'uri';

/** An image input: base64 bytes, or a Files API URI. */
export type OmniImageInput = { data: string; mimeType: string } | { uri: string; mimeType?: string };

/** A video input (to edit or extend): a Files API URI, or base64 bytes. */
export type OmniVideoInput = { uri: string; mimeType?: string } | { data: string; mimeType: string };

/**
 * One Omni generation. There are no separate modes: Omni reads the mode from
 * the prompt and the inputs (spec D19). Text only = text-to-video; one image =
 * image-to-video; two images described as first and last frame = interpolation;
 * up to six images described as references = subject reference;
 * `previousInteractionId` or `video` + an edit or "extend" prompt = editing or
 * extension.
 */
export interface OmniGenerateParams {
  /** What to generate, or how to change or continue the previous video */
  prompt: string;
  /** Model (default `gemini-omni-1.2-flash`); unknown ids pass through with a warning */
  model?: OmniModelId;
  /** Images, in the order the prompt refers to them (up to 6) */
  images?: OmniImageInput[];
  /** A video to edit or extend (up to 15 s). One video per request. */
  video?: OmniVideoInput;
  /** Continue an earlier interaction: edit or extend the video it produced */
  previousInteractionId?: string;
  aspectRatio?: OmniAspectRatio | (string & {});
  resolution?: OmniResolution | (string & {});
  /**
   * Whole seconds, 3-15 (default 10). Interpolation and per-turn extension
   * accept 3-10; the API rejects more, and this package does not guess which
   * of those modes a prompt selects.
   */
  durationSeconds?: number | string;
  /** Mode fallback; see `OmniTask` */
  task?: OmniTask | (string & {});
  /** Default `inline` */
  delivery?: OmniDelivery;
  /**
   * `false` asks Google not to store the interaction: faster, but its video can
   * then not be edited or extended with `previousInteractionId`. Default: not sent (Google stores).
   */
  store?: boolean;
  /** Request timeout in ms (default `OMNI_TIMEOUTS.REQUEST`) */
  timeoutMs?: number;
}

/** The video an interaction produced. Exactly one of `data` and `uri` is set. */
export interface OmniVideo {
  mimeType: string;
  /** Base64 bytes (`delivery: 'inline'`) */
  data?: string;
  /** Files API URI (`delivery: 'uri'`) */
  uri?: string;
}

/** What `generate` returns. */
export interface OmniResult {
  /** Pass as `previousInteractionId` to edit or extend this video */
  interactionId: string;
  model: string;
  status: string;
  video: OmniVideo;
  /** Text the model returned alongside the video, if any */
  text?: string;
}

/** What `saveVideo` returns. */
export interface OmniSaveResult {
  path: string;
  bytes: number;
  interactionId: string;
}

/** Omni model constraint (vendor docs, 2026-11-08). */
export interface OmniModelConstraint {
  aspectRatios: OmniAspectRatio[];
  resolutions: OmniResolution[];
  /** Whole seconds accepted for `durationSeconds` */
  durationSeconds: { min: number; max: number; default: number };
  /** Longest duration with first and last frames, or per extension turn (seconds) */
  interpolationAndExtensionMaxSeconds: number;
  /** Longest a video can get by repeated extension (seconds) */
  extendedTotalMaxSeconds: number;
  /** Longest input video for editing (seconds) */
  editInputMaxSeconds: number;
  maxImages: number;
  tasks: OmniTask[];
  features: {
    textToVideo: boolean;
    imageToVideo: boolean;
    interpolation: boolean;
    subjectReference: boolean;
    editing: boolean;
    extension: boolean;
    nativeAudio: boolean;
  };
}

/** Omni model constraints mapping. */
export interface OmniModelConstraints {
  [model: string]: OmniModelConstraint;
}

/** Omni model info (`getModelInfo`). */
export interface OmniModelInfo extends OmniModelConstraint {
  model: string;
}

/** Omni timeouts. */
export interface OmniTimeouts {
  /** One `interactions.create` call, in ms (generation is synchronous) */
  REQUEST: number;
  /** Interval between Files API state checks for a `uri` delivery, in ms */
  FILE_POLL_INTERVAL: number;
  /** Maximum Files API state checks */
  FILE_POLL_MAX_ATTEMPTS: number;
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
  /** Video analysis mode */
  video?: boolean;
  /** Omni video generation mode */
  omni?: boolean;
  /** Generation prompts */
  prompt?: string[];
  /** Input image path */
  inputImage?: string;
  /** Aspect ratio */
  aspectRatio?: string;
  /** Input video path */
  inputVideo?: string;
  /** Video start offset */
  videoStart?: string;
  /** Video end offset */
  videoEnd?: string;
  /** Omni model */
  omniModel?: string;
  /** Omni aspect ratio */
  omniAspectRatio?: string;
  /** Omni resolution */
  omniResolution?: string;
  /** Omni duration in whole seconds */
  omniDuration?: string;
  /** Omni input images (frames or references), in order */
  omniImage?: string[];
  /** Omni input video (uploaded through the Files API) to edit or extend */
  omniVideo?: string;
  /** Omni interaction to continue (edit or extend its video) */
  omniPrevious?: string;
  /** Omni task fallback */
  omniTask?: string;
  /** Omni delivery: inline or uri */
  omniDelivery?: string;
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
