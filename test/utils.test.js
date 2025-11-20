/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, filename generation, and security utilities
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock DNS module before importing utils
vi.mock('dns/promises', () => ({
  lookup: vi.fn()
}));

import { lookup } from 'dns/promises';
import {
  validateImageUrl,
  validateImagePath,
  imageToInlineData,
  saveBase64Image,
  generateFilename,
  ensureDirectory,
  saveMetadata,
  pause,
  createSpinner,
  setLogLevel
} from '../utils.js';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Test directory for file operations
const TEST_DIR = join(process.cwd(), 'test-temp');

// Setup and teardown for all tests
beforeAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('Utility Functions', () => {

  describe('generateFilename', () => {
    it('should generate filename with timestamp and sanitized prompt', () => {
      const filename = generateFilename('A beautiful sunset');
      expect(filename).toMatch(/^\d{8}_\d{6}_a-beautiful-sunset\.png$/);
    });

    it('should remove special characters', () => {
      const filename = generateFilename('Hello / World: Test!');
      expect(filename).not.toContain('/');
      expect(filename).not.toContain(':');
      expect(filename).not.toContain('!');
    });

    it('should replace spaces with hyphens', () => {
      const filename = generateFilename('hello world test');
      expect(filename).toContain('hello-world-test');
    });

    it('should convert to lowercase', () => {
      const filename = generateFilename('HELLO WORLD');
      expect(filename).toContain('hello-world');
    });

    it('should truncate long prompts', () => {
      const longPrompt = 'a'.repeat(200);
      const filename = generateFilename(longPrompt);
      const parts = filename.split('_');
      const promptPart = parts[2].replace('.png', '');
      expect(promptPart.length).toBeLessThanOrEqual(50);
    });

    it('should respect custom maxLength', () => {
      const longPrompt = 'a'.repeat(200);
      const filename = generateFilename(longPrompt, 'png', 20);
      const parts = filename.split('_');
      const promptPart = parts[2].replace('.png', '');
      expect(promptPart.length).toBeLessThanOrEqual(20);
    });

    it('should use custom extension', () => {
      const filename = generateFilename('test', 'jpg');
      expect(filename).toMatch(/\.jpg$/);
    });

    it('should handle different extensions', () => {
      const extensions = ['jpg', 'png', 'webp'];
      extensions.forEach(ext => {
        const filename = generateFilename('test', ext);
        expect(filename).toMatch(new RegExp(`\\.${ext}$`));
      });
    });
  });

  describe('pause', () => {
    it('should pause for specified milliseconds', async () => {
      const start = Date.now();
      await pause(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow 10ms tolerance
    });

    it('should return a promise', () => {
      const result = pause(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('createSpinner', () => {
    it('should create spinner with start and stop methods', () => {
      const spinner = createSpinner('Test message');
      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe('function');
      expect(typeof spinner.stop).toBe('function');
      expect(typeof spinner.update).toBe('function');
    });

    it('should not throw when starting and stopping', () => {
      const spinner = createSpinner('Test');
      expect(() => spinner.start()).not.toThrow();
      expect(() => spinner.stop()).not.toThrow();
    });
  });
});

describe('Image Validation (Security)', () => {
  describe('validateImageUrl', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should accept valid HTTPS URLs with public IPs', async () => {
      lookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
      await expect(validateImageUrl('https://example.com/image.jpg')).resolves.toBe('https://example.com/image.jpg');

      lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });
      await expect(validateImageUrl('https://cdn.example.com/path/to/image.png')).resolves.toBe('https://cdn.example.com/path/to/image.png');
    });

    it('should reject HTTP URLs', async () => {
      await expect(validateImageUrl('http://example.com/image.jpg'))
        .rejects.toThrow('HTTPS');
    });

    it('should reject localhost', async () => {
      await expect(validateImageUrl('https://localhost/image.jpg'))
        .rejects.toThrow('metadata');
      await expect(validateImageUrl('https://127.0.0.1/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject IPv6 localhost', async () => {
      await expect(validateImageUrl('https://[::1]/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject private IP addresses', async () => {
      await expect(validateImageUrl('https://10.0.0.1/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://192.168.1.1/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://172.16.0.1/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://172.20.0.1/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://172.31.255.255/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject link-local addresses', async () => {
      await expect(validateImageUrl('https://169.254.169.254/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject cloud metadata endpoints', async () => {
      await expect(validateImageUrl('https://metadata.google.internal/computeMetadata'))
        .rejects.toThrow('metadata');
      await expect(validateImageUrl('https://169.254.169.254/latest/meta-data'))
        .rejects.toThrow('private');
    });

    it('should reject IPv4-mapped IPv6 localhost (SSRF bypass prevention)', async () => {
      await expect(validateImageUrl('https://[::ffff:127.0.0.1]/image.jpg'))
        .rejects.toThrow('localhost');
    });

    it('should reject IPv4-mapped IPv6 private IPs (SSRF bypass prevention)', async () => {
      await expect(validateImageUrl('https://[::ffff:10.0.0.1]/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://[::ffff:192.168.1.1]/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://[::ffff:169.254.169.254]/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject IPv6 link-local addresses', async () => {
      await expect(validateImageUrl('https://[fe80::1]/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject IPv6 unique local addresses', async () => {
      await expect(validateImageUrl('https://[fc00::1]/image.jpg'))
        .rejects.toThrow('private');
      await expect(validateImageUrl('https://[fd00::1]/image.jpg'))
        .rejects.toThrow('private');
    });

    it('should reject invalid URLs', async () => {
      await expect(validateImageUrl('not-a-url'))
        .rejects.toThrow('Invalid URL');
    });

    it('should return validated URL on success', async () => {
      lookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
      const url = 'https://example.com/image.jpg';
      await expect(validateImageUrl(url)).resolves.toBe(url);
    });

    // DNS Rebinding Prevention Tests
    it('should reject domains resolving to localhost (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to private IPs (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');

      lookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
      await expect(validateImageUrl('https://evil2.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');

      lookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });
      await expect(validateImageUrl('https://evil3.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to cloud metadata IPs (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 loopback (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 private addresses (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: 'fe80::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');

      lookup.mockResolvedValue({ address: 'fc00::1', family: 6 });
      await expect(validateImageUrl('https://evil2.com/image.jpg'))
        .rejects.toThrow('resolves to internal/private IP');
    });

    it('should handle DNS lookup failures gracefully', async () => {
      lookup.mockRejectedValue({ code: 'ENOTFOUND' });
      await expect(validateImageUrl('https://nonexistent.domain.invalid/image.jpg'))
        .rejects.toThrow('could not be resolved');
    });

    it('should handle DNS timeout errors gracefully', async () => {
      lookup.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(validateImageUrl('https://timeout.example.com/image.jpg'))
        .rejects.toThrow('Failed to validate domain');
    });
  });

  describe('validateImagePath', () => {
    it('should accept valid PNG file', async () => {
      // Create a minimal valid PNG file (1x1 red pixel)
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x8F, 0x0D, 0x32,
        0x4E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const testFile = join(TEST_DIR, 'test.png');
      writeFileSync(testFile, pngData);

      const result = await validateImagePath(testFile);
      expect(result).toBe(testFile);

      unlinkSync(testFile);
    });

    it('should accept valid JPEG file', async () => {
      // Minimal JPEG header (not a complete valid JPEG, but has correct magic bytes)
      const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
      ]);

      const testFile = join(TEST_DIR, 'test.jpg');
      writeFileSync(testFile, jpegData);

      const result = await validateImagePath(testFile);
      expect(result).toBe(testFile);

      unlinkSync(testFile);
    });

    it('should reject non-existent file', async () => {
      await expect(validateImagePath('/nonexistent/file.png'))
        .rejects.toThrow('not found');
    });

    it('should reject empty file', async () => {
      const emptyFile = join(TEST_DIR, 'empty.png');
      writeFileSync(emptyFile, '');

      await expect(validateImagePath(emptyFile))
        .rejects.toThrow('empty');

      unlinkSync(emptyFile);
    });

    it('should reject non-image file', async () => {
      const textFile = join(TEST_DIR, 'test.txt');
      writeFileSync(textFile, 'This is not an image');

      await expect(validateImagePath(textFile))
        .rejects.toThrow('not appear to be a valid image');

      unlinkSync(textFile);
    });
  });
});

describe('File Operations', () => {
  describe('ensureDirectory', () => {
    it('should create directory if it does not exist', async () => {
      const testSubDir = join(TEST_DIR, 'subdir', 'nested');

      await ensureDirectory(testSubDir);

      expect(existsSync(testSubDir)).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const testSubDir = join(TEST_DIR, 'existing');
      mkdirSync(testSubDir, { recursive: true });

      await expect(ensureDirectory(testSubDir)).resolves.not.toThrow();
    });

    it('should return directory path', async () => {
      const testSubDir = join(TEST_DIR, 'returntest');
      const result = await ensureDirectory(testSubDir);
      expect(result).toBe(testSubDir);
    });
  });

  describe('saveBase64Image', () => {
    it('should save base64-encoded image to file', async () => {
      const base64Data = Buffer.from('test image data').toString('base64');
      const outputPath = join(TEST_DIR, 'output.png');

      await saveBase64Image(base64Data, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const savedData = readFileSync(outputPath);
      expect(savedData.toString()).toBe('test image data');

      unlinkSync(outputPath);
    });

    it('should create parent directory if it does not exist', async () => {
      const base64Data = Buffer.from('test').toString('base64');
      const outputPath = join(TEST_DIR, 'nested', 'dir', 'output.png');

      await saveBase64Image(base64Data, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });

    it('should return output path', async () => {
      const base64Data = Buffer.from('test').toString('base64');
      const outputPath = join(TEST_DIR, 'return-test.png');

      const result = await saveBase64Image(base64Data, outputPath);
      expect(result).toBe(outputPath);

      unlinkSync(outputPath);
    });
  });

  describe('saveMetadata', () => {
    it('should save metadata as JSON', async () => {
      const metadata = {
        model: 'gemini-2.5-flash-image',
        prompt: 'test prompt',
        timestamp: '2025-01-18T14:30:00Z'
      };
      const metadataPath = join(TEST_DIR, 'metadata.json');

      await saveMetadata(metadataPath, metadata);

      expect(existsSync(metadataPath)).toBe(true);
      const savedData = JSON.parse(readFileSync(metadataPath, 'utf8'));
      expect(savedData).toEqual(metadata);

      unlinkSync(metadataPath);
    });

    it('should return metadata path', async () => {
      const metadata = { test: 'data' };
      const metadataPath = join(TEST_DIR, 'return-meta.json');

      const result = await saveMetadata(metadataPath, metadata);
      expect(result).toBe(metadataPath);

      unlinkSync(metadataPath);
    });
  });

  describe('imageToInlineData', () => {
    it('should convert local PNG file to inlineData format', async () => {
      // Create test PNG
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
      ]);
      const testFile = join(TEST_DIR, 'test-inline.png');
      writeFileSync(testFile, pngData);

      const result = await imageToInlineData(testFile);

      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('data');
      expect(result.mimeType).toBe('image/png');
      expect(result.data).toBe(pngData.toString('base64'));

      unlinkSync(testFile);
    });

    it('should detect JPEG MIME type from extension', async () => {
      const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10
      ]);
      const testFile = join(TEST_DIR, 'test.jpg');
      writeFileSync(testFile, jpegData);

      const result = await imageToInlineData(testFile);

      expect(result.mimeType).toBe('image/jpeg');

      unlinkSync(testFile);
    });

    it('should throw error for non-existent file', async () => {
      await expect(imageToInlineData('/nonexistent/file.png'))
        .rejects.toThrow('not found');
    });

    it('should throw error for invalid image file', async () => {
      const textFile = join(TEST_DIR, 'invalid.png');
      writeFileSync(textFile, 'not an image');

      await expect(imageToInlineData(textFile))
        .rejects.toThrow('not appear to be a valid image');

      unlinkSync(textFile);
    });
  });
});

describe('Logger Functions', () => {
  describe('setLogLevel', () => {
    it('should not throw when setting valid log levels', () => {
      expect(() => setLogLevel('debug')).not.toThrow();
      expect(() => setLogLevel('info')).not.toThrow();
      expect(() => setLogLevel('warn')).not.toThrow();
      expect(() => setLogLevel('error')).not.toThrow();
    });
  });
});

/* END */
