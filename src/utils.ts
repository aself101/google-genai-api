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
import { VIDEO_MIME_TYPES, VIDEO_SIZE_LIMITS } from './config.js';
import { errorMessage, thrownFields } from './errors.js';
import { bareHost, checkRedirect, guardedLookup, isBlockedAddress, isBlockedHostname } from './download-guard.js';
import type {
  InlineData,
  SpinnerObject,
  VideoValidationResult,
  VideoFrame,
  VideoAnalysisResult,
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
      throw new Error(`Image file not found: ${filepath}`, { cause: error });
    } else if (code === 'EACCES') {
      throw new Error(`Permission denied reading image file: ${filepath}`, { cause: error });
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

    // MIME type from the bytes, as for URLs; the extension only as a fallback.
    // 1.x used the extension alone, and 1.x's CLI wrote JPEG to `.png` files, so
    // re-editing its output sent JPEG bytes labelled image/png.
    const ext = path.extname(imagePathOrUrl).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    mimeType = (await fileTypeFromBuffer(buffer))?.mime ?? mimeMap[ext] ?? 'image/png';
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
      throw new Error(`Video file not found: ${filepath}. Please check the file path exists.`, { cause: error });
    } else if (code === 'EACCES') {
      throw new Error(
        `Permission denied reading video file: ${filepath}. Check file permissions.`,
        { cause: error }
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
