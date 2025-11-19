/**
 * Google GenAI Service Utility Functions
 *
 * Utility functions for Google GenAI image generation, including file I/O,
 * image handling, and data transformations.
 */

import fs from 'fs/promises';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import winston from 'winston';
import axios from 'axios';

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
 * Validate image URL for security.
 * Enforces HTTPS and blocks private IPs, localhost, and cloud metadata endpoints.
 *
 * @param {string} url - URL to validate
 * @returns {string} Validated URL
 * @throws {Error} If URL is invalid or insecure
 */
export function validateImageUrl(url) {
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

  // Block localhost variations (including IPv6 bracket notation)
  const cleanHostname = hostname.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

  // Check against the actual IP
  const hostnameToCheck = cleanHostname;

  if (hostnameToCheck === 'localhost' || hostnameToCheck === '127.0.0.1' || hostnameToCheck === '::1') {
    logger.warn(`SECURITY: Blocked access to localhost: ${hostname}`);
    throw new Error('Access to localhost is not allowed');
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

  // Block cloud metadata endpoints
  const blockedHosts = [
    'metadata.google.internal',  // GCP metadata
    'metadata',                  // Generic metadata
    '169.254.169.254',          // AWS/Azure metadata IP
  ];

  if (blockedHosts.includes(hostnameToCheck)) {
    logger.warn(`SECURITY: Blocked access to cloud metadata endpoint: ${hostname}`);
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  if (blockedPatterns.some(pattern => pattern.test(hostnameToCheck))) {
    logger.warn(`SECURITY: Blocked access to private IP address: ${hostname}`);
    throw new Error('Access to internal/private IP addresses is not allowed');
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
    const validatedUrl = validateImageUrl(imagePathOrUrl);

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
    throw new Error(`Image file size exceeds maximum of 50MB`);
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

/* END */
