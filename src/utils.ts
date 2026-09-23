/**
 * Google GenAI Service Utility Functions
 *
 * Utility functions for Google GenAI image generation, including file I/O,
 * image handling, and data transformations.
 */

import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import axios from 'axios';
import { lookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import { isIP } from 'net';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { VEO_MODES, VIDEO_MIME_TYPES, VIDEO_SIZE_LIMITS } from './config.js';
import { errorMessage, thrownFields } from './errors.js';
import { bareHost, checkRedirect, guardedLookup, isBlockedAddress, isBlockedHostname } from './download-guard.js';
import type {
  InlineData,
  SpinnerObject,
  VeoSpinnerObject,
  VideoValidationResult,
  VideoFrame,
  VideoAnalysisResult,
  VeoImage,
  VeoMetadataInput,
  VeoSavedMetadata,
  GeminiResponse,
} from './types/index.js';

// Configure module logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()} - ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Validate an image URL before downloading it: HTTPS only, not a blocked
 * hostname, and not an IP address — literal, or any address the hostname
 * resolves to — in a blocked range (see src/download-guard.ts).
 *
 * This is the early, readable refusal. The download itself re-checks every
 * address it connects to and every redirect (`imageToInlineData`), because a
 * hostname can resolve differently a moment later.
 *
 * @param url - URL to validate
 * @returns The validated URL
 * @throws Error if URL is invalid or insecure
 */
export async function validateImageUrl(url: string): Promise<string> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow HTTPS (not HTTP)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for security reasons');
  }

  // `new URL()` has already normalised 0x7f.1, 2130706433 and [::ffff:127.0.0.1]
  // to canonical forms; the checks below see those.
  const hostname = bareHost(parsed.hostname);

  if (isBlockedHostname(hostname)) {
    logger.warn(`SECURITY: Blocked access to prohibited hostname: ${hostname}`);
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      logger.warn(`SECURITY: Blocked access to private/internal IP: ${hostname}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
    return url;
  }

  // Every answer, not just the first: a hostname with one public and one private
  // address could otherwise be connected to on the private one.
  let answers: LookupAddress[];
  try {
    logger.debug(`Resolving DNS for hostname: ${hostname}`);
    answers = await lookup(hostname, { all: true });
  } catch (error) {
    if (thrownFields(error).code === 'ENOTFOUND') {
      logger.warn(`SECURITY: Domain ${hostname} could not be resolved`);
      throw new Error(`Domain ${hostname} could not be resolved`, { cause: error });
    }
    const message = errorMessage(error);
    logger.warn(`SECURITY: DNS lookup failed for ${hostname}: ${message}`);
    throw new Error(`Failed to validate domain ${hostname}: ${message}`, { cause: error });
  }

  const blocked = answers.find((a) => isBlockedAddress(a.address));
  if (blocked || answers.length === 0) {
    logger.warn(`SECURITY: DNS resolution of ${hostname} points to blocked IP: ${blocked?.address ?? '(none)'}`);
    throw new Error(`Domain ${hostname} resolves to internal/private IP address`);
  }

  logger.debug(`DNS validation passed for ${hostname} (${answers.map((a) => a.address).join(', ')})`);
  return url;
}

/**
 * Validate image file path.
 * Checks file exists, is readable, and has valid image magic bytes.
 *
 * @param filepath - Path to image file
 * @returns Validated filepath
 * @throws Error if file doesn't exist, isn't readable, or isn't a valid image
 */
export async function validateImagePath(filepath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filepath);

    // Check file size (must be > 0)
    if (buffer.length === 0) {
      throw new Error(`Image file is empty: ${filepath}`);
    }

    // Check magic bytes for common image formats
    const magicBytes = buffer.subarray(0, 4);
    const isPNG =
      magicBytes[0] === 0x89 &&
      magicBytes[1] === 0x50 &&
      magicBytes[2] === 0x4e &&
      magicBytes[3] === 0x47;
    const isJPEG = magicBytes[0] === 0xff && magicBytes[1] === 0xd8 && magicBytes[2] === 0xff;
    const isWebP = buffer.subarray(8, 12).toString() === 'WEBP';
    const isGIF = magicBytes.subarray(0, 3).toString() === 'GIF';

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      throw new Error(
        `File does not appear to be a valid image (PNG, JPEG, WebP, or GIF): ${filepath}`
      );
    }

    return filepath;
  } catch (error) {
    const { code } = thrownFields(error);
    if (code === 'ENOENT') {
      throw new Error(`Image file not found: ${filepath}`);
    } else if (code === 'EACCES') {
      throw new Error(`Permission denied reading image file: ${filepath}`);
    }
    throw error;
  }
}

/**
 * Convert image (local file or URL) to inlineData format required by @google/genai SDK.
 * Returns object with { mimeType, data } where data is base64-encoded.
 *
 * @param imagePathOrUrl - Path to local file or HTTPS URL
 * @returns inlineData format { mimeType: string, data: string }
 * @throws Error if image cannot be loaded or validated
 *
 * @example
 * const inlineData = await imageToInlineData('./photo.jpg');
 * // { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg...' }
 */
export async function imageToInlineData(imagePathOrUrl: string): Promise<InlineData> {
  let buffer: Buffer;
  let mimeType: string;

  // Detect if input is URL or local path
  if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
    // URL: Download with security validation
    const validatedUrl = await validateImageUrl(imagePathOrUrl);

    logger.debug(`Downloading image from URL: ${validatedUrl}`);

    const response = await axios.get<ArrayBuffer>(validatedUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 seconds
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      maxRedirects: 5,
      // Re-checked where it matters: every address each connection resolves to,
      // and every redirect before it is followed (src/download-guard.ts).
      lookup: guardedLookup,
      beforeRedirect: checkRedirect,
    });

    buffer = Buffer.from(response.data);

    // Validate Content-Type header
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    // String(): axios ≥1.20 types header values as string | number | boolean | string[] | AxiosHeaders.
    // A missing header becomes '' and fails the check below, as before.
    const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim();

    if (!contentType || !allowedMimeTypes.includes(contentType)) {
      throw new Error(
        `Invalid Content-Type: ${contentType}. Expected image/* (png, jpeg, webp, gif)`
      );
    }

    // The header is the server's claim; the bytes are what Gemini will receive.
    // 1.x checked only the header, so a server labelling any payload image/png
    // passed it through. Sniff the buffer and send the detected type.
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !allowedMimeTypes.includes(sniffed.mime)) {
      throw new Error(
        `Downloaded content is not a valid image: Content-Type says ${contentType}, ` +
          `bytes are ${sniffed?.mime ?? 'unrecognised'}. Expected png, jpeg, webp or gif`
      );
    }

    mimeType = sniffed.mime;
  } else {
    // Local file: Read with validation
    await validateImagePath(imagePathOrUrl);

    buffer = await fs.readFile(imagePathOrUrl);

    // Detect MIME type from file extension
    const ext = path.extname(imagePathOrUrl).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    mimeType = mimeMap[ext] || 'image/png';
  }

  // Validate file size (50MB max as per security requirements)
  if (buffer.length > 50 * 1024 * 1024) {
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    throw new Error(`Image file size (${sizeMB}MB) exceeds maximum of 50MB`);
  }

  // Convert to base64
  const base64Data = buffer.toString('base64');

  return {
    mimeType,
    data: base64Data,
  };
}

/**
 * Save base64-encoded image to file.
 * Creates output directory if it doesn't exist.
 *
 * @param base64Data - Base64-encoded image data
 * @param outputPath - Path to save file
 * @param _mimeType - MIME type (determines extension if not in path) - unused but kept for API compatibility
 * @returns Path to saved file
 *
 * @example
 * await saveBase64Image(base64String, 'output/image.png');
 */
export async function saveBase64Image(
  base64Data: string,
  outputPath: string,
  _mimeType = 'image/png'
): Promise<string> {
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, 'base64');

  // Write to file
  await fs.writeFile(outputPath, buffer);

  logger.debug(`Saved image to: ${outputPath}`);

  return outputPath;
}

/**
 * Generate a safe filename from a prompt and timestamp.
 * Removes special characters and limits length.
 *
 * @param prompt - Generation prompt
 * @param extension - File extension
 * @param maxLength - Maximum filename length (excluding extension)
 * @returns Safe filename with timestamp
 *
 * @example
 * generateFilename('A beautiful sunset over mountains');
 * // '20250118_143022_beautiful-sunset-over-mountains.png'
 */
export function generateFilename(prompt: string, extension = 'png', maxLength = 50): string {
  // Create timestamp prefix (YYYYMMDD_HHMMSS)
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

  // Sanitize prompt: lowercase, remove special chars, replace spaces with hyphens
  const sanitized = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, maxLength);

  return `${timestamp}_${sanitized}.${extension}`;
}

/**
 * Ensure output directory exists.
 * Creates directory recursively if it doesn't exist.
 *
 * @param dirPath - Directory path to create
 * @returns Created directory path
 *
 * @example
 * await ensureDirectory('datasets/google/gemini-2.5-flash-image');
 */
export async function ensureDirectory(dirPath: string): Promise<string> {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Save metadata JSON file alongside image.
 *
 * @param metadataPath - Path to save JSON metadata
 * @param metadata - Metadata object
 * @returns Path to saved metadata file
 *
 * @example
 * await saveMetadata('output/image.json', { model: 'gemini', prompt: '...' });
 */
export async function saveMetadata(
  metadataPath: string,
  metadata: object
): Promise<string> {
  const jsonContent = JSON.stringify(metadata, null, 2);
  await fs.writeFile(metadataPath, jsonContent, 'utf8');
  logger.debug(`Saved metadata to: ${metadataPath}`);
  return metadataPath;
}

/**
 * Pause execution for specified milliseconds.
 *
 * @param ms - Milliseconds to pause
 * @returns Promise that resolves after the delay
 *
 * @example
 * await pause(2000); // Wait 2 seconds
 */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a spinner for long-running operations.
 * Returns an object with start(), stop(), and update() methods.
 *
 * @param message - Message to display with spinner
 * @returns Spinner object with start(), stop(), and update() methods
 *
 * @example
 * const spinner = createSpinner('Generating image...');
 * spinner.start();
 * // ... do work ...
 * spinner.stop('Complete!');
 */
export function createSpinner(message: string): SpinnerObject {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentMessage = message;

  return {
    start() {
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = frames[frameIndex];
        process.stdout.write(`\r${frame} ${currentMessage}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    },

    stop(finalMessage: string | null = null) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write('\r');
      if (finalMessage) {
        process.stdout.write(`${finalMessage}\n`);
      } else {
        process.stdout.write('\r\x1b[K'); // Clear line
      }
    },

    update(newMessage: string) {
      currentMessage = newMessage;
    },
  };
}

/**
 * Set logger level.
 *
 * @param level - Log level (debug, info, warn, error)
 */
export function setLogLevel(level: string): void {
  logger.level = level.toLowerCase();
}

export { logger };

// ============================================================================
// VIDEO UTILITIES
// ============================================================================

/**
 * Validate video file path.
 * Checks file exists, is readable, has valid video magic bytes using file-type library.
 *
 * @param filepath - Path to video file
 * @returns Validation result with mimeType and size
 * @throws Error if file doesn't exist, isn't readable, or isn't a valid video
 *
 * @example
 * const result = await validateVideoPath('./video.mp4');
 * // { valid: true, mimeType: 'video/mp4', size: 15728640 }
 */
export async function validateVideoPath(filepath: string): Promise<VideoValidationResult> {
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  // Check file exists and get stats
  try {
    stats = await fs.stat(filepath);
  } catch (error) {
    const { code } = thrownFields(error);
    if (code === 'ENOENT') {
      throw new Error(`Video file not found: ${filepath}. Please check the file path exists.`);
    } else if (code === 'EACCES') {
      throw new Error(
        `Permission denied reading video file: ${filepath}. Check file permissions.`
      );
    }
    throw error;
  }

  // Check file is not empty
  if (stats.size === 0) {
    throw new Error(
      `Video file is empty (0 bytes): ${filepath}. Please provide a valid video file.`
    );
  }

  // Check file size limit
  if (stats.size > VIDEO_SIZE_LIMITS.MAX_FILE_SIZE) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const maxMB = (VIDEO_SIZE_LIMITS.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
    throw new Error(
      `Video file size (${sizeMB}MB) exceeds maximum of ${maxMB}MB. ` +
        `Please compress or trim the video.`
    );
  }

  // Detect MIME type using file-type library (reads magic bytes)
  const fileTypeResult = await fileTypeFromFile(filepath);

  if (!fileTypeResult) {
    throw new Error(
      `Could not determine file type for: ${filepath}. ` +
        `File may be corrupted or not a valid video format.`
    );
  }

  // Check if detected MIME type is a supported video format
  if (!VIDEO_MIME_TYPES.includes(fileTypeResult.mime)) {
    throw new Error(
      `Invalid video format: ${fileTypeResult.mime}. ` +
        `Supported formats: ${VIDEO_MIME_TYPES.join(', ')}`
    );
  }

  // Log warning if file is large
  if (stats.size > VIDEO_SIZE_LIMITS.RECOMMENDED_MAX) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    logger.warn(
      `Video file size (${sizeMB}MB) exceeds recommended ${VIDEO_SIZE_LIMITS.RECOMMENDED_MAX / 1024 / 1024}MB. Processing may take longer.`
    );
  }

  logger.debug(
    `Video file validated: ${filepath} (${fileTypeResult.mime}, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`
  );

  return {
    valid: true,
    mimeType: fileTypeResult.mime,
    size: stats.size,
  };
}

/**
 * Format time offset in seconds to API format.
 * Converts a number of seconds to the string format expected by Gemini API.
 *
 * @param seconds - Number of seconds
 * @returns Formatted time offset (e.g., "90s")
 *
 * @example
 * formatTimeOffset(90);   // "90s"
 * formatTimeOffset(0);    // "0s"
 * formatTimeOffset(3600); // "3600s"
 */
export function formatTimeOffset(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds)) {
    throw new Error('formatTimeOffset requires a valid number');
  }
  if (seconds < 0) {
    throw new Error('Time offset cannot be negative');
  }
  return `${Math.floor(seconds)}s`;
}

/**
 * Extract video metadata from Gemini API response.
 * Parses the response to extract analysis text and timestamp references.
 *
 * @param response - Gemini API response object
 * @returns Object containing text and frames array
 *
 * @example
 * const metadata = extractVideoMetadata(response);
 * // {
 * //   text: 'The video shows a cat at 01:30...',
 * //   frames: [{ timestamp: '01:30', description: 'a cat playing' }]
 * // }
 */
export function extractVideoMetadata(response: GeminiResponse): VideoAnalysisResult {
  let text = '';
  const frames: VideoFrame[] = [];

  // Handle empty or malformed responses
  if (!response?.candidates?.[0]?.content?.parts) {
    return { text: '', frames: [] };
  }

  // Extract text from response parts
  const parts = response.candidates[0].content.parts;
  for (const part of parts) {
    if (part.text) {
      text += part.text;
    }
  }

  // Extract timestamp references using regex
  // Matches formats: 0:30, 01:30, 1:15:30, etc.
  const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
  let match: RegExpExecArray | null;

  while ((match = timestampRegex.exec(text)) !== null) {
    const timestamp = match[0];
    const startIndex = Math.max(0, match.index - 50);
    const endIndex = Math.min(text.length, match.index + match[0].length + 50);

    // Extract context around the timestamp
    let description = text.slice(startIndex, endIndex).trim();

    // Clean up the description (remove partial words at boundaries)
    if (startIndex > 0) {
      const firstSpace = description.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 15) {
        description = description.slice(firstSpace + 1);
      }
    }
    if (endIndex < text.length) {
      const lastSpace = description.lastIndexOf(' ');
      if (lastSpace > description.length - 15) {
        description = description.slice(0, lastSpace);
      }
    }

    frames.push({
      timestamp,
      description: description.replace(/\s+/g, ' ').trim(),
    });
  }

  return { text, frames };
}

// ============================================================================
// VEO VIDEO GENERATION UTILITIES
// ============================================================================

/**
 * Convert image file to Veo-compatible format.
 * Reads image file and returns object with imageBytes (base64) and mimeType.
 *
 * @param imagePath - Path to image file (PNG, JPEG, WebP)
 * @returns Veo-compatible image object
 * @throws Error if file doesn't exist or isn't a valid image
 *
 * @example
 * const image = await imageToVeoInput('./photo.png');
 * // { imageBytes: 'iVBOR...', mimeType: 'image/png' }
 */
export async function imageToVeoInput(imagePath: string): Promise<VeoImage> {
  // Validate file exists
  await validateImagePath(imagePath);

  // Read file
  const buffer = await fs.readFile(imagePath);

  // Detect MIME type from extension
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  const mimeType = mimeMap[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported image format: ${ext}. ` + `Supported formats: PNG, JPEG, WebP`
    );
  }

  // Convert to base64
  const imageBytes = buffer.toString('base64');

  return {
    imageBytes,
    mimeType,
  };
}

/**
 * Generate output path for Veo-generated video.
 * Creates path: datasets/google/veo/{model}/{timestamp}_{sanitized-prompt}.mp4
 *
 * @param model - Veo model name
 * @param prompt - Generation prompt
 * @param baseDir - Base output directory
 * @returns Output file path
 *
 * @example
 * generateVeoOutputPath('veo-3.1-generate-preview', 'A cat playing');
 * // 'datasets/google/veo/veo-3.1-generate-preview/20250121_143022_a-cat-playing.mp4'
 */
export function generateVeoOutputPath(
  model: string,
  prompt: string,
  baseDir = 'datasets/google'
): string {
  // Clean model name for directory
  const modelDir = model.replace(/[^a-z0-9.-]/gi, '-');

  // Generate filename with timestamp and sanitized prompt
  const filename = generateFilename(prompt, 'mp4', 40);

  return path.join(baseDir, 'veo', modelDir, filename);
}

/**
 * Save Veo generation metadata alongside video file.
 *
 * @param videoPath - Path to the video file
 * @param metadata - Metadata to save
 * @returns Path to saved metadata file
 *
 * @example
 * await saveVeoMetadata('./output.mp4', {
 *   operationName: 'operations/xyz123',
 *   model: 'veo-3.1-generate-preview',
 *   mode: 'text-to-video',
 *   parameters: { prompt: '...', aspectRatio: '16:9' }
 * });
 */
export async function saveVeoMetadata(
  videoPath: string,
  metadata: VeoMetadataInput
): Promise<string> {
  const metadataPath = videoPath.replace(/\.mp4$/i, '.json');

  const fullMetadata: VeoSavedMetadata = {
    operation_name: metadata.operationName,
    model: metadata.model,
    mode: metadata.mode,
    timestamp: metadata.timestamp || new Date().toISOString(),
    parameters: metadata.parameters,
    result: {
      video_path: videoPath,
      status: 'completed',
    },
  };

  await saveMetadata(metadataPath, fullMetadata);

  return metadataPath;
}

/**
 * Create a progress spinner for Veo video generation.
 * Shows elapsed time and estimated remaining time.
 *
 * @param initialMessage - Initial message to display
 * @returns Spinner with start(), stop(), updateElapsed() methods
 *
 * @example
 * const spinner = createVeoSpinner('Generating video...');
 * spinner.start();
 * // ... poll operation ...
 * spinner.updateElapsed(30000); // 30 seconds elapsed
 * spinner.stop('Video generated!');
 */
export function createVeoSpinner(initialMessage: string): VeoSpinnerObject {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let message = initialMessage;
  let elapsedMs = 0;

  return {
    start() {
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = frames[frameIndex];
        const elapsedSec = Math.floor(elapsedMs / 1000);
        const timeStr = elapsedSec > 0 ? ` (${elapsedSec}s)` : '';
        process.stdout.write(`\r${frame} ${message}${timeStr}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    },

    stop(finalMessage: string | null = null) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write('\r');
      if (finalMessage) {
        process.stdout.write(`${finalMessage}\n`);
      } else {
        process.stdout.write('\r\x1b[K'); // Clear line
      }
    },

    updateElapsed(ms: number) {
      elapsedMs = ms;
    },

    updateMessage(newMessage: string) {
      message = newMessage;
    },
  };
}

/**
 * Why a parsed metadata file is not a `VeoSavedMetadata`, or undefined if it is.
 * 1.x checked only `operation_name` and returned the rest unchecked under the
 * full type. Messages start with the 1.x one (`missing operation_name`).
 */
function veoMetadataProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'not a JSON object';
  const m: { [key: string]: unknown } = { ...value };
  for (const key of ['operation_name', 'model', 'timestamp'] as const) {
    if (typeof m[key] !== 'string' || m[key] === '') return `missing ${key}`;
  }
  const modes: unknown[] = Object.values(VEO_MODES);
  if (!modes.includes(m.mode)) return `unknown mode ${JSON.stringify(m.mode)}`;
  if (typeof m.parameters !== 'object' || m.parameters === null) return 'missing parameters';
  if (typeof m.result !== 'object' || m.result === null) return 'missing result';
  const result: { [key: string]: unknown } = { ...m.result };
  if (typeof result.video_path !== 'string') return 'missing result.video_path';
  if (typeof result.status !== 'string') return 'missing result.status';
  return undefined;
}

function isVeoSavedMetadata(value: unknown): value is VeoSavedMetadata {
  return veoMetadataProblem(value) === undefined;
}

/**
 * Load metadata written by `saveVeoMetadata()`, checking every field of
 * `VeoSavedMetadata`.
 *
 * @param metadataPath - Path to metadata JSON file
 * @returns Parsed metadata with operation details
 * @throws Error if the file is missing, is not JSON, or lacks a field
 *
 * @example
 * // Pick a job up again by name (it does not need the original operation object)
 * const metadata = await parseVeoMetadata('./previous-video.json');
 * const op = await veo.waitForCompletion({ name: metadata.operation_name, done: false });
 */
export async function parseVeoMetadata(metadataPath: string): Promise<VeoSavedMetadata> {
  try {
    const content = await fs.readFile(metadataPath, 'utf8');
    const metadata: unknown = JSON.parse(content);
    const problem = veoMetadataProblem(metadata);
    if (problem || !isVeoSavedMetadata(metadata)) {
      throw new Error(`Invalid Veo metadata: ${problem ?? 'unexpected shape'}`);
    }
    return metadata;
  } catch (error) {
    if (thrownFields(error).code === 'ENOENT') {
      throw new Error(`Metadata file not found: ${metadataPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in metadata file: ${metadataPath}`);
    }
    throw error;
  }
}
