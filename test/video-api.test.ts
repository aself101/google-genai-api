/**
 * Video API Tests
 * Tests for GoogleGenAIVideoAPI class
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock @google/genai SDK
vi.mock('@google/genai', () => ({
  // A `function`, not an arrow: vitest 4 refuses `new` on arrow implementations.
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      files: {
        upload: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
      },
      models: {
        generateContent: vi.fn(),
      },
    };
  }),
}));

// Mock axios for deleteVideoFile
vi.mock('axios', () => ({
  default: {
    delete: vi.fn(),
  },
}));

// Mock validateVideoPath
vi.mock('../src/utils.js', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    validateVideoPath: vi.fn().mockResolvedValue({
      valid: true,
      mimeType: 'video/mp4',
      size: 1024 * 1024,
    }),
    pause: vi.fn().mockResolvedValue(undefined),
  };
});

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { GoogleGenAIVideoAPI } from '../src/video-api.js';
import { validateVideoPath, pause } from '../src/utils.js';
import type { FileInfo, GeminiResponse } from '../src/types/index.js';

// Interface for extended error with status
interface ExtendedError extends Error {
  status?: number;
  response?: { status?: number };
  fileState?: string;
  classification?: string;
  surface?: string;
}

// The API with its private members exposed for testing. Not `extends
// GoogleGenAIVideoAPI`: redeclaring private members is a type error (TS2430).
type MockedVideoAPI = Omit<GoogleGenAIVideoAPI, never> & MockedVideoInternals;
interface MockedVideoInternals {
  apiKey: string | null;
  client: {
    files: {
      upload: Mock;
      get: Mock;
      list: Mock;
    };
    models: {
      generateContent: Mock;
    };
  };
  logger: { level: string };
  _verifyApiKey: () => void;
  _pollFileStatus: (fileName: string, maxAttempts?: number, intervalMs?: number) => Promise<FileInfo>;
}

describe('GoogleGenAIVideoAPI', () => {
  let api: MockedVideoAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock client instance
    new GoogleGenAI({ apiKey: 'test-key' });

    // Create API instance
    api = new GoogleGenAIVideoAPI('test-api-key') as unknown as MockedVideoAPI;
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      const instance = new GoogleGenAIVideoAPI('test-key');
      expect(instance).toBeInstanceOf(GoogleGenAIVideoAPI);
    });

    it('should throw error without API key', () => {
      expect(() => new GoogleGenAIVideoAPI(undefined as unknown as string)).toThrow('API key is required');
    });

    it('should throw error with empty API key', () => {
      expect(() => new GoogleGenAIVideoAPI('')).toThrow('API key is required');
    });

    it('should accept log level parameter', () => {
      const instance = new GoogleGenAIVideoAPI('test-key', 'debug');
      expect(instance).toBeInstanceOf(GoogleGenAIVideoAPI);
    });
  });

  describe('_verifyApiKey', () => {
    it('should not throw when API key is set', () => {
      expect(() => api._verifyApiKey()).not.toThrow();
    });

    it('should throw when API key is removed', () => {
      api.apiKey = null;
      expect(() => api._verifyApiKey()).toThrow('API key is not set');
    });
  });

  describe('uploadVideoFile', () => {
    beforeEach(() => {
      // Mock successful upload and get
      api.client.files.upload.mockResolvedValue({
        name: 'files/test123',
        uri: 'files/test123',
      });

      api.client.files.get.mockResolvedValue({
        name: 'files/test123',
        uri: 'files/test123',
        mimeType: 'video/mp4',
        state: 'ACTIVE',
        sizeBytes: 1024,
      });
    });

    it('should call validateVideoPath before upload', async () => {
      await api.uploadVideoFile('/path/to/video.mp4');

      expect(validateVideoPath).toHaveBeenCalledWith('/path/to/video.mp4');
    });

    it('should call Files API upload with correct params', async () => {
      await api.uploadVideoFile('/path/to/video.mp4');

      expect(api.client.files.upload).toHaveBeenCalledWith({
        file: '/path/to/video.mp4',
        config: {
          mimeType: 'video/mp4',
          displayName: 'video.mp4',
        },
      });
    });

    it('should accept custom display name', async () => {
      await api.uploadVideoFile('/path/to/video.mp4', 'Custom Name');

      expect(api.client.files.upload).toHaveBeenCalledWith({
        file: '/path/to/video.mp4',
        config: {
          mimeType: 'video/mp4',
          displayName: 'Custom Name',
        },
      });
    });

    it('should return file object with correct structure', async () => {
      const result = await api.uploadVideoFile('/path/to/video.mp4');

      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('sizeBytes');
    });

    it('should throw when validation fails', async () => {
      (validateVideoPath as Mock).mockRejectedValueOnce(new Error('Video file not found'));

      await expect(api.uploadVideoFile('/nonexistent.mp4')).rejects.toThrow('Video file not found');
    });

    it('should throw when upload fails', async () => {
      api.client.files.upload.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(api.uploadVideoFile('/path/to/video.mp4')).rejects.toThrow();
    });

    it('rethrows the SDK error with the D13 fields (outside production)', async () => {
      const sdkError = Object.assign(new Error('{"error":{"code":403,"message":"denied","status":"PERMISSION_DENIED"}}'), { status: 403 });
      api.client.files.upload.mockRejectedValueOnce(sdkError);

      const thrown = (await api.uploadVideoFile('/path/to/video.mp4').catch((e: unknown) => e)) as ExtendedError;
      expect(thrown).toBe(sdkError);
      expect(thrown).toMatchObject({ status: 403, classification: 'AUTH', surface: 'video-understanding' });
    });

    it('an upload result with no file name is an error, not a poll of undefined', async () => {
      api.client.files.upload.mockResolvedValueOnce({});

      await expect(api.uploadVideoFile('/path/to/video.mp4')).rejects.toThrow('returned no file name');
      expect(api.client.files.get).not.toHaveBeenCalled();
    });

    it('throws the poll timeout as is, with isTimeout', async () => {
      api.client.files.upload.mockResolvedValueOnce({ name: 'files/test123' });
      api.client.files.get.mockResolvedValue({ name: 'files/test123', state: 'PROCESSING' });

      const thrown = (await api.uploadVideoFile('/path/to/video.mp4').catch((e: unknown) => e)) as ExtendedError & { isTimeout?: boolean };
      expect(thrown.message).toMatch(/timed out/);
      expect(thrown.isTimeout).toBe(true);
      expect(thrown.classification).toBeUndefined();
    });
  });

  describe('_pollFileStatus', () => {
    it('should return file when state is ACTIVE', async () => {
      api.client.files.get.mockResolvedValue({
        name: 'files/test123',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123',
        mimeType: 'video/mp4',
        state: 'ACTIVE',
        sizeBytes: '1048576', // int64 → a string on the wire
      });

      const result = await api._pollFileStatus('files/test123');

      expect(result).toEqual({
        name: 'files/test123',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123',
        mimeType: 'video/mp4',
        state: 'ACTIVE',
        sizeBytes: 1048576, // FileInfo.sizeBytes is a number; 1.x passed the string through
      });
    });

    it.each([
      ['uri', { name: 'files/test123', mimeType: 'video/mp4' }],
      ['name', { uri: 'https://x.test/files/test123', mimeType: 'video/mp4' }],
      ['mimeType', { name: 'files/test123', uri: 'https://x.test/files/test123' }],
    ])('rejects an ACTIVE file with no %s instead of returning an unusable one', async (_field, file) => {
      api.client.files.get.mockResolvedValue({ ...file, state: 'ACTIVE' });

      await expect(api._pollFileStatus('files/test123', 3, 10)).rejects.toThrow('without a uri, name or mimeType');
    });

    it('should throw when state is FAILED', async () => {
      api.client.files.get.mockResolvedValue({
        name: 'files/test123',
        state: 'FAILED',
        error: { message: 'Processing failed' },
      });

      await expect(api._pollFileStatus('files/test123')).rejects.toThrow('Video processing failed');
    });

    it('should retry when state is PROCESSING', async () => {
      api.client.files.get
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123', mimeType: 'video/mp4' });

      const result = await api._pollFileStatus('files/test123', 3, 10);

      expect(api.client.files.get).toHaveBeenCalledTimes(2);
      expect(result.state).toBe('ACTIVE');
    });

    it('should throw timeout error after max attempts', async () => {
      api.client.files.get.mockResolvedValue({
        name: 'files/test123',
        state: 'PROCESSING',
      });

      await expect(api._pollFileStatus('files/test123', 2, 10)).rejects.toThrow('timed out');
    });

    it('should handle 429 rate limit with extended backoff', async () => {
      const rateLimitError = new Error('Rate limited') as ExtendedError;
      rateLimitError.status = 429;

      api.client.files.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123', mimeType: 'video/mp4' });

      const result = await api._pollFileStatus('files/test123', 3, 10);

      expect(result.state).toBe('ACTIVE');
      expect(pause).toHaveBeenCalledWith(60000); // Extended 60s backoff
    });

    it('retries a failed poll request (network error, 5xx)', async () => {
      api.client.files.get
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(Object.assign(new Error('{}'), { status: 500 }))
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123', mimeType: 'video/mp4' });

      const result = await api._pollFileStatus('files/test123', 5, 10);
      expect(result.state).toBe('ACTIVE');
      expect(api.client.files.get).toHaveBeenCalledTimes(3);
    });

    it('does not retry by message text (1.x retried anything mentioning "network")', async () => {
      api.client.files.get.mockRejectedValueOnce(new Error('invalid network configuration'));

      await expect(api._pollFileStatus('files/test123', 5, 10)).rejects.toThrow('invalid network configuration');
      expect(api.client.files.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry a FAILED file, even when its message mentions a timeout', async () => {
      api.client.files.get.mockResolvedValue({ name: 'files/test123', state: 'FAILED', error: { message: 'decoder timeout' } });

      await expect(api._pollFileStatus('files/test123', 5, 10)).rejects.toThrow('Video processing failed: decoder timeout');
      expect(api.client.files.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry a 400', async () => {
      api.client.files.get.mockRejectedValueOnce(Object.assign(new Error('{}'), { status: 400 }));

      await expect(api._pollFileStatus('files/test123', 5, 10)).rejects.toThrow();
      expect(api.client.files.get).toHaveBeenCalledTimes(1);
    });

    it('should use 1.5x exponential backoff between polling attempts', async () => {
      // File stays in PROCESSING state for 3 attempts, then becomes ACTIVE
      api.client.files.get
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123', mimeType: 'video/mp4' });

      const initialBackoff = 100; // Start with 100ms for faster test
      const result = await api._pollFileStatus('files/test123', 10, initialBackoff);

      expect(result.state).toBe('ACTIVE');
      expect(api.client.files.get).toHaveBeenCalledTimes(4);

      // Verify pause was called with increasing backoff values (1.5x multiplier)
      expect(pause).toHaveBeenCalledTimes(3);
      expect(pause).toHaveBeenNthCalledWith(1, 100); // Initial backoff
      expect(pause).toHaveBeenNthCalledWith(2, 150); // 100 * 1.5 = 150
      expect(pause).toHaveBeenNthCalledWith(3, 225); // 150 * 1.5 = 225
    });
  });

  describe('generateFromVideo', () => {
    beforeEach(() => {
      api.client.models.generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Video analysis result' }],
            },
          },
        ],
      } as GeminiResponse);
    });

    it('should call generateContent with correct params', async () => {
      await api.generateFromVideo({
        prompt: 'Describe this video',
        fileUri: 'files/test123',
        mimeType: 'video/mp4',
      });

      expect(api.client.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [{ text: 'Describe this video' }, { fileData: { fileUri: 'files/test123', mimeType: 'video/mp4' } }],
      });
    });

    it('should include videoMetadata when provided', async () => {
      await api.generateFromVideo({
        prompt: 'Describe this video',
        fileUri: 'files/test123',
        mimeType: 'video/mp4',
        videoMetadata: { startOffset: '30s', endOffset: '60s' },
      });

      expect(api.client.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [
          { text: 'Describe this video' },
          {
            fileData: {
              fileUri: 'files/test123',
              mimeType: 'video/mp4',
              videoMetadata: { startOffset: '30s', endOffset: '60s' },
            },
          },
        ],
      });
    });

    it('should return response object', async () => {
      const result = await api.generateFromVideo({
        prompt: 'Describe this video',
        fileUri: 'files/test123',
        mimeType: 'video/mp4',
      });

      expect(result.candidates![0].content!.parts![0].text).toBe('Video analysis result');
    });

    it('should throw when prompt is missing', async () => {
      await expect(
        api.generateFromVideo({
          prompt: undefined as unknown as string,
          fileUri: 'files/test123',
          mimeType: 'video/mp4',
        })
      ).rejects.toThrow('Prompt is required');
    });

    it('should throw when fileUri is missing', async () => {
      await expect(
        api.generateFromVideo({
          prompt: 'Describe this video',
          fileUri: undefined as unknown as string,
          mimeType: 'video/mp4',
        })
      ).rejects.toThrow('File URI is required');
    });

    it('should throw when mimeType is missing', async () => {
      await expect(
        api.generateFromVideo({
          prompt: 'Describe this video',
          fileUri: 'files/test123',
          mimeType: undefined as unknown as string,
        })
      ).rejects.toThrow('MIME type is required');
    });

    it('should handle empty response gracefully', async () => {
      api.client.models.generateContent.mockResolvedValue({});

      const result = await api.generateFromVideo({
        prompt: 'Describe this video',
        fileUri: 'files/test123',
        mimeType: 'video/mp4',
      });

      expect(result.candidates![0].content!.parts![0].text).toBe('No analysis could be generated for this video.');
    });

    it('should handle 404 file not found error', async () => {
      const error = new Error('File not found') as ExtendedError;
      error.status = 404;
      api.client.models.generateContent.mockRejectedValue(error);

      await expect(
        api.generateFromVideo({
          prompt: 'Describe this video',
          fileUri: 'files/test123',
          mimeType: 'video/mp4',
        })
      ).rejects.toThrow('expired');
    });

    it('carries the D13 fields on the 404 hint', async () => {
      api.client.models.generateContent.mockRejectedValue(Object.assign(new Error('{}'), { status: 404 }));

      const thrown = (await api
        .generateFromVideo({ prompt: 'Describe', fileUri: 'files/x', mimeType: 'video/mp4' })
        .catch((e: unknown) => e)) as ExtendedError;
      expect(thrown.message).toMatch(/expire after 48 hours/);
      expect(thrown).toMatchObject({ status: 404, classification: 'USER_ACTIONABLE', surface: 'video-understanding' });
    });

    it('classifies a vendor safety rejection as SAFETY_BLOCKED', async () => {
      const body = '{"error":{"code":400,"message":"Request blocked by safety policy","status":"INVALID_ARGUMENT"}}';
      api.client.models.generateContent.mockRejectedValue(Object.assign(new Error(body), { status: 400 }));

      const thrown = (await api
        .generateFromVideo({ prompt: 'Describe', fileUri: 'files/x', mimeType: 'video/mp4' })
        .catch((e: unknown) => e)) as ExtendedError;
      expect(thrown).toMatchObject({ status: 400, classification: 'SAFETY_BLOCKED', surface: 'video-understanding' });
    });
  });

  describe('deleteVideoFile', () => {
    beforeEach(() => {
      (axios.delete as Mock).mockResolvedValue({ status: 200 });
    });

    it('should call axios.delete with correct URL and headers', async () => {
      await api.deleteVideoFile('files/test123');

      expect(axios.delete).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/files/test123', {
        headers: { 'x-goog-api-key': 'test-api-key' },
        timeout: 30000,
      });
    });

    it('should handle file URI with full path', async () => {
      await api.deleteVideoFile('files/test123');

      expect(axios.delete).toHaveBeenCalledWith(expect.stringContaining('/test123'), expect.any(Object));
    });

    it('should not throw on 404 error (already deleted)', async () => {
      const error = new Error('Not found') as ExtendedError;
      error.response = { status: 404 };
      (axios.delete as Mock).mockRejectedValue(error);

      // Should not throw
      await expect(api.deleteVideoFile('files/test123')).resolves.toBeUndefined();
    });

    it('should not throw on network error (best-effort cleanup)', async () => {
      (axios.delete as Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(api.deleteVideoFile('files/test123')).resolves.toBeUndefined();
    });

    it('should handle empty file URI', async () => {
      await api.deleteVideoFile('');

      // Should not call axios
      expect(axios.delete).not.toHaveBeenCalled();
    });

    it('should handle null file URI', async () => {
      await api.deleteVideoFile(null as unknown as string);

      // Should not call axios
      expect(axios.delete).not.toHaveBeenCalled();
    });
  });

  describe('setLogLevel', () => {
    it('should set logger level', () => {
      api.setLogLevel('debug');
      expect(api.logger.level).toBe('debug');
    });

    it('should handle uppercase log levels', () => {
      api.setLogLevel('DEBUG');
      expect(api.logger.level).toBe('debug');
    });
  });
});

describe('Error handling in production (spec D13)', () => {
  let api: MockedVideoAPI;
  const originalEnv = process.env.NODE_ENV;
  const call = () =>
    api
      .generateFromVideo({ prompt: 'Describe', fileUri: 'files/x', mimeType: 'video/mp4' })
      .then(() => { throw new Error('expected a rejection'); }, (e: unknown) => e as ExtendedError);

  beforeEach(() => {
    vi.clearAllMocks();
    api = new GoogleGenAIVideoAPI('test-api-key') as unknown as MockedVideoAPI;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('names the category and includes only the vendor message for a rejected request', async () => {
    const body = '{"error":{"code":400,"message":"Video too long","status":"INVALID_ARGUMENT","details":[{"project":"123"}]}}';
    const sdkError = Object.assign(new Error(body), { status: 400 });
    api.client.models.generateContent.mockRejectedValue(sdkError);

    const thrown = await call();
    expect(thrown).not.toBe(sdkError);
    expect(thrown.message).toBe('Video understanding failed (HTTP 400): Video too long');
    expect(thrown.message).not.toContain('123');
    expect((thrown as Error & { cause?: unknown }).cause).toBeUndefined();
  });

  it('never includes vendor text for auth and transient failures', async () => {
    api.client.models.generateContent.mockRejectedValue(
      Object.assign(new Error('{"error":{"code":503,"message":"backend xyz overloaded","status":"UNAVAILABLE"}}'), { status: 503 })
    );

    const thrown = await call();
    expect(thrown.message).toBe('Video understanding failed: a temporary error occurred (HTTP 503). Please try again.');
    expect(thrown).toMatchObject({ classification: 'TRANSIENT', surface: 'video-understanding' });
  });

  it('keeps the 404 hint in production', async () => {
    api.client.models.generateContent.mockRejectedValue(Object.assign(new Error('{}'), { status: 404 }));

    expect((await call()).message).toMatch(/expire after 48 hours/);
  });
});
