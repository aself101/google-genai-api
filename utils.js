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
import { isIPv4, isIPv6 } from 'net';
import { fileTypeFromFile } from 'file-type';
import { VIDEO_MIME_TYPES, VIDEO_SIZE_LIMITS } from './config.js';

// Configure module logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()} - ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Helper function to check if an IP address is blocked (private/internal).
 *
 * @param {string} ip - IP address to check (IPv4 or IPv6)
 * @returns {boolean} True if IP is blocked, false otherwise
 */
function isBlockedIP(ip) {
  // Remove IPv6 bracket notation
  const cleanIP = ip.replace(/^\[|\]$/g, '');

  // Block localhost variations
  if (cleanIP === 'localhost' || cleanIP === '127.0.0.1' || cleanIP === '::1') {
    return true;
  }

  // Block cloud metadata endpoints
  const blockedHosts = [
    'metadata.google.internal',
    'metadata',
    '169.254.169.254',
  ];
  if (blockedHosts.includes(cleanIP)) {
    return true;
  }

  // Block private IP ranges and special addresses
  const blockedPatterns = [
    /^127\./,                    // Loopback
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^192\.168\./,               // Private Class C
    /^169\.254\./,               // Link-local (AWS metadata)
    /^0\./,                      // Invalid range
    /^::1$/,                     // IPv6 loopback
    /^fe80:/,                    // IPv6 link-local
    /^fc00:/,                    // IPv6 unique local
    /^fd00:/,                    // IPv6 unique local
  ];

  return blockedPatterns.some(pattern => pattern.test(cleanIP));
}

/**
 * Validate image URL for security.
 * Enforces HTTPS and blocks private IPs, localhost, and cloud metadata endpoints.
 *
 * DNS Resolution: This function performs DNS resolution to prevent DNS rebinding attacks,
 * where a domain might resolve to different IPs between validation time and request time.
 *
 * @param {string} url - URL to validate
 * @returns {Promise<string>} The validated URL
 * @throws {Error} If URL is invalid or insecure
 */
export async function validateImageUrl(url) {
  // First check for IPv4-mapped IPv6 in the original URL string (before URL parsing normalizes it)
  // This prevents SSRF bypass via https://[::ffff:127.0.0.1] or https://[::ffff:169.254.169.254]
  const ipv6MappedMatch = url.match(/\[::ffff:(\d+\.\d+\.\d+\.\d+)\]/i);
  if (ipv6MappedMatch) {
    const extractedIPv4 = ipv6MappedMatch[1];
    logger.warn(`SECURITY: Detected IPv4-mapped IPv6 address in URL: ${url} → ${extractedIPv4}`);

    // Validate the extracted IPv4 directly
    if (extractedIPv4 === '127.0.0.1' || extractedIPv4.startsWith('127.')) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 localhost: ${url}`);
      throw new Error('Access to localhost is not allowed');
    }

    // Check against private IP patterns
    const privatePatterns = [
      /^10\./,                     // Private Class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
      /^192\.168\./,               // Private Class C
      /^169\.254\./,               // Link-local (AWS metadata)
      /^0\./,                      // Invalid range
    ];

    if (privatePatterns.some(pattern => pattern.test(extractedIPv4))) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 private IP: ${url}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow HTTPS (not HTTP)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for security reasons');
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHostname = hostname.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

  // First check if hostname itself is blocked (before DNS resolution)
  const blockedHosts = ['localhost', 'metadata.google.internal', 'metadata'];
  if (blockedHosts.includes(cleanHostname)) {
    logger.warn(`SECURITY: Blocked access to prohibited hostname: ${hostname}`);
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  // Check if hostname is already an IP address (not a domain name)
  if (isIPv4(cleanHostname) || isIPv6(cleanHostname)) {
    if (isBlockedIP(cleanHostname)) {
      logger.warn(`SECURITY: Blocked access to private/internal IP: ${hostname}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  } else {
    // Hostname is a domain name - perform DNS resolution to prevent DNS rebinding
    try {
      logger.debug(`Resolving DNS for hostname: ${hostname}`);
      const { address } = await lookup(hostname);
      logger.debug(`DNS resolved ${hostname} → ${address}`);

      if (isBlockedIP(address)) {
        logger.warn(`SECURITY: DNS resolution of ${hostname} points to blocked IP: ${address}`);
        throw new Error(`Domain ${hostname} resolves to internal/private IP address`);
      }

      logger.debug(`DNS validation passed for ${hostname} (resolved to ${address})`);
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        logger.warn(`SECURITY: Domain ${hostname} could not be resolved`);
        throw new Error(`Domain ${hostname} could not be resolved`);
      } else if (error.message && error.message.includes('resolves to internal')) {
        // Re-throw our custom error about blocked IPs
        throw error;
      } else {
        logger.warn(`SECURITY: DNS lookup failed for ${hostname}: ${error.message}`);
        throw new Error(`Failed to validate domain ${hostname}: ${error.message}`);
      }
    }
  }

  return url;
}

/**
 * Validate image file path.
 * Checks file exists, is readable, and has valid image magic bytes.
 *
 * @param {string} filepath - Path to image file
 * @returns {Promise<string>} Validated filepath
 * @throws {Error} If file doesn't exist, isn't readable, or isn't a valid image
 */
export async function validateImagePath(filepath) {
  try {
    const buffer = await fs.readFile(filepath);

    // Check file size (must be > 0)
    if (buffer.length === 0) {
      throw new Error(`Image file is empty: ${filepath}`);
    }

    // Check magic bytes for common image formats
    const magicBytes = buffer.slice(0, 4);
    const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
    const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF;
    const isWebP = buffer.slice(8, 12).toString() === 'WEBP';
    const isGIF = magicBytes.slice(0, 3).toString() === 'GIF';

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      throw new Error(`File does not appear to be a valid image (PNG, JPEG, WebP, or GIF): ${filepath}`);
    }

    return filepath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Image file not found: ${filepath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading image file: ${filepath}`);
    }
    throw error;
  }
}

/**
 * Convert image (local file or URL) to inlineData format required by @google/genai SDK.
 * Returns object with { mimeType, data } where data is base64-encoded.
 *
 * @param {string} imagePathOrUrl - Path to local file or HTTPS URL
 * @returns {Promise<Object>} { mimeType: string, data: string } - inlineData format
 * @throws {Error} If image cannot be loaded or validated
 *
 * @example
 * const inlineData = await imageToInlineData('./photo.jpg');
 * // { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg...' }
 */
export async function imageToInlineData(imagePathOrUrl) {
  let buffer;
  let mimeType;

  // Detect if input is URL or local path
  if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
    // URL: Download with security validation
    const validatedUrl = await validateImageUrl(imagePathOrUrl);

    logger.debug(`Downloading image from URL: ${validatedUrl}`);

    const response = await axios.get(validatedUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 seconds
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      maxRedirects: 5
    });

    buffer = Buffer.from(response.data);

    // Validate Content-Type header
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const contentType = response.headers['content-type']?.split(';')[0].trim();

    if (!contentType || !allowedMimeTypes.includes(contentType)) {
      throw new Error(`Invalid Content-Type: ${contentType}. Expected image/* (png, jpeg, webp, gif)`);
    }

    mimeType = contentType;

  } else {
    // Local file: Read with validation
    await validateImagePath(imagePathOrUrl);

    buffer = await fs.readFile(imagePathOrUrl);

    // Detect MIME type from file extension
    const ext = path.extname(imagePathOrUrl).toLowerCase();
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
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
    data: base64Data
  };
}

/**
 * Save base64-encoded image to file.
 * Creates output directory if it doesn't exist.
 *
 * @param {string} base64Data - Base64-encoded image data
 * @param {string} outputPath - Path to save file
 * @param {string} [mimeType='image/png'] - MIME type (determines extension if not in path)
 * @returns {Promise<string>} Path to saved file
 *
 * @example
 * await saveBase64Image(base64String, 'output/image.png');
 */
export async function saveBase64Image(base64Data, outputPath, mimeType = 'image/png') {
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
 * @param {string} prompt - Generation prompt
 * @param {string} [extension='png'] - File extension
 * @param {number} [maxLength=50] - Maximum filename length (excluding extension)
 * @returns {string} Safe filename with timestamp
 *
 * @example
 * generateFilename('A beautiful sunset over mountains');
 * // '20250118_143022_beautiful-sunset-over-mountains.png'
 */
export function generateFilename(prompt, extension = 'png', maxLength = 50) {
  // Create timestamp prefix (YYYYMMDD_HHMMSS)
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];

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
 * @param {string} dirPath - Directory path to create
 * @returns {Promise<string>} Created directory path
 *
 * @example
 * await ensureDirectory('datasets/google/gemini-2.5-flash-image');
 */
export async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Save metadata JSON file alongside image.
 *
 * @param {string} metadataPath - Path to save JSON metadata
 * @param {Object} metadata - Metadata object
 * @returns {Promise<string>} Path to saved metadata file
 *
 * @example
 * await saveMetadata('output/image.json', { model: 'gemini', prompt: '...' });
 */
export async function saveMetadata(metadataPath, metadata) {
  const jsonContent = JSON.stringify(metadata, null, 2);
  await fs.writeFile(metadataPath, jsonContent, 'utf8');
  logger.debug(`Saved metadata to: ${metadataPath}`);
  return metadataPath;
}

/**
 * Pause execution for specified milliseconds.
 *
 * @param {number} ms - Milliseconds to pause
 * @returns {Promise<void>}
 *
 * @example
 * await pause(2000); // Wait 2 seconds
 */
export function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a spinner for long-running operations.
 * Returns an object with start(), stop(), and update() methods.
 *
 * @param {string} message - Message to display with spinner
 * @returns {Object} Spinner object with start(), stop(), and update() methods
 *
 * @example
 * const spinner = createSpinner('Generating image...');
 * spinner.start();
 * // ... do work ...
 * spinner.stop('✓ Complete!');
 */
export function createSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval = null;

  return {
    start() {
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = frames[frameIndex];
        process.stdout.write(`\r${frame} ${message}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    },

    stop(finalMessage = null) {
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

    update(newMessage) {
      message = newMessage;
    }
  };
}

/**
 * Set logger level.
 *
 * @param {string} level - Log level (debug, info, warn, error)
 */
export function setLogLevel(level) {
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
 * @param {string} filepath - Path to video file
 * @returns {Promise<{valid: boolean, mimeType: string, size: number}>} Validation result
 * @throws {Error} If file doesn't exist, isn't readable, or isn't a valid video
 *
 * @example
 * const result = await validateVideoPath('./video.mp4');
 * // { valid: true, mimeType: 'video/mp4', size: 15728640 }
 */
export async function validateVideoPath(filepath) {
  let stats;

  // Check file exists and get stats
  try {
    stats = await fs.stat(filepath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Video file not found: ${filepath}. Please check the file path exists.`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading video file: ${filepath}. Check file permissions.`);
    }
    throw error;
  }

  // Check file is not empty
  if (stats.size === 0) {
    throw new Error(`Video file is empty (0 bytes): ${filepath}. Please provide a valid video file.`);
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
    logger.warn(`Video file size (${sizeMB}MB) exceeds recommended ${VIDEO_SIZE_LIMITS.RECOMMENDED_MAX / 1024 / 1024}MB. Processing may take longer.`);
  }

  logger.debug(`Video file validated: ${filepath} (${fileTypeResult.mime}, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

  return {
    valid: true,
    mimeType: fileTypeResult.mime,
    size: stats.size
  };
}

/**
 * Format time offset in seconds to API format.
 * Converts a number of seconds to the string format expected by Gemini API.
 *
 * @param {number} seconds - Number of seconds
 * @returns {string} Formatted time offset (e.g., "90s")
 *
 * @example
 * formatTimeOffset(90);   // "90s"
 * formatTimeOffset(0);    // "0s"
 * formatTimeOffset(3600); // "3600s"
 */
export function formatTimeOffset(seconds) {
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
 * @param {Object} response - Gemini API response object
 * @returns {{text: string, frames: Array<{timestamp: string, description: string}>}}
 *
 * @example
 * const metadata = extractVideoMetadata(response);
 * // {
 * //   text: 'The video shows a cat at 01:30...',
 * //   frames: [{ timestamp: '01:30', description: 'a cat playing' }]
 * // }
 */
export function extractVideoMetadata(response) {
  let text = '';
  const frames = [];

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
  let match;

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
      description: description.replace(/\s+/g, ' ').trim()
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
 * @param {string} imagePath - Path to image file (PNG, JPEG, WebP)
 * @returns {Promise<{imageBytes: string, mimeType: string}>} Veo-compatible image object
 * @throws {Error} If file doesn't exist or isn't a valid image
 *
 * @example
 * const image = await imageToVeoInput('./photo.png');
 * // { imageBytes: 'iVBOR...', mimeType: 'image/png' }
 */
export async function imageToVeoInput(imagePath) {
  // Validate file exists
  await validateImagePath(imagePath);

  // Read file
  const buffer = await fs.readFile(imagePath);

  // Detect MIME type from extension
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };

  const mimeType = mimeMap[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported image format: ${ext}. ` +
      `Supported formats: PNG, JPEG, WebP`
    );
  }

  // Convert to base64
  const imageBytes = buffer.toString('base64');

  return {
    imageBytes,
    mimeType
  };
}

/**
 * Generate output path for Veo-generated video.
 * Creates path: datasets/google/veo/{model}/{timestamp}_{sanitized-prompt}.mp4
 *
 * @param {string} model - Veo model name
 * @param {string} prompt - Generation prompt
 * @param {string} [baseDir='datasets/google'] - Base output directory
 * @returns {string} Output file path
 *
 * @example
 * generateVeoOutputPath('veo-3.1-generate-preview', 'A cat playing');
 * // 'datasets/google/veo/veo-3.1-generate-preview/20250121_143022_a-cat-playing.mp4'
 */
export function generateVeoOutputPath(model, prompt, baseDir = 'datasets/google') {
  // Clean model name for directory
  const modelDir = model.replace(/[^a-z0-9.-]/gi, '-');

  // Generate filename with timestamp and sanitized prompt
  const filename = generateFilename(prompt, 'mp4', 40);

  return path.join(baseDir, 'veo', modelDir, filename);
}

/**
 * Save Veo generation metadata alongside video file.
 *
 * @param {string} videoPath - Path to the video file
 * @param {Object} metadata - Metadata to save
 * @param {string} metadata.operationName - Operation name/ID
 * @param {string} metadata.model - Veo model used
 * @param {string} metadata.mode - Generation mode (text-to-video, image-to-video, etc.)
 * @param {Object} metadata.parameters - Generation parameters
 * @param {string} [metadata.timestamp] - ISO timestamp (auto-generated if not provided)
 * @returns {Promise<string>} Path to saved metadata file
 *
 * @example
 * await saveVeoMetadata('./output.mp4', {
 *   operationName: 'operations/xyz123',
 *   model: 'veo-3.1-generate-preview',
 *   mode: 'text-to-video',
 *   parameters: { prompt: '...', aspectRatio: '16:9' }
 * });
 */
export async function saveVeoMetadata(videoPath, metadata) {
  const metadataPath = videoPath.replace(/\.mp4$/i, '.json');

  const fullMetadata = {
    operation_name: metadata.operationName,
    model: metadata.model,
    mode: metadata.mode,
    timestamp: metadata.timestamp || new Date().toISOString(),
    parameters: metadata.parameters,
    result: {
      video_path: videoPath,
      status: 'completed'
    }
  };

  await saveMetadata(metadataPath, fullMetadata);

  return metadataPath;
}

/**
 * Create a progress spinner for Veo video generation.
 * Shows elapsed time and estimated remaining time.
 *
 * @param {string} initialMessage - Initial message to display
 * @returns {Object} Spinner with start(), stop(), updateElapsed() methods
 *
 * @example
 * const spinner = createVeoSpinner('Generating video...');
 * spinner.start();
 * // ... poll operation ...
 * spinner.updateElapsed(30000); // 30 seconds elapsed
 * spinner.stop('✓ Video generated!');
 */
export function createVeoSpinner(initialMessage) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval = null;
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

    stop(finalMessage = null) {
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

    updateElapsed(ms) {
      elapsedMs = ms;
    },

    updateMessage(newMessage) {
      message = newMessage;
    }
  };
}

/**
 * Parse operation metadata from saved JSON file.
 * Used for video extension to load previous operation.
 *
 * @param {string} metadataPath - Path to metadata JSON file
 * @returns {Promise<Object>} Parsed metadata with operation details
 * @throws {Error} If file doesn't exist or is invalid
 *
 * @example
 * const metadata = await parseVeoMetadata('./previous-video.json');
 * // Use for video extension
 */
export async function parseVeoMetadata(metadataPath) {
  try {
    const content = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(content);

    if (!metadata.operation_name) {
      throw new Error('Invalid Veo metadata: missing operation_name');
    }

    return metadata;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Metadata file not found: ${metadataPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in metadata file: ${metadataPath}`);
    }
    throw error;
  }
}

/* END */
