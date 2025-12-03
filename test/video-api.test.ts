/**
 * Video API Tests
 * Tests for GoogleGenAIVideoAPI class
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock @google/genai SDK
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    files: {
      upload: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
    },
    models: {
      generateContent: vi.fn(),
    },
  })),
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
import type { ErrorClassification, FileInfo, GeminiResponse } from '../src/types/index.js';

// Interface for extended error with status
interface ExtendedError extends Error {
  status?: number;
  response?: { status?: number };
  fileState?: string;
}

// Interface for mocked API with access to private members
interface MockedVideoAPI extends GoogleGenAIVideoAPI {
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
  _classifyError: (error: ExtendedError) => ErrorClassification;
  _sanitizeError: (error: ExtendedError) => Error;
  _pollFileStatus: (fileName: string, maxAttempts?: number, intervalMs?: number) => Promise<FileInfo>;
}

describe('GoogleGenAIVideoAPI', () => {
  let api: MockedVideoAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock client instance
    new GoogleGenAI({ apiKey: 'test-key' });

    // Create API instance
    api = new GoogleGenAIVideoAPI('test-api-key') as MockedVideoAPI;
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

  describe('_classifyError', () => {
    it('should classify network errors as TRANSIENT', () => {
      const error = new Error('network timeout') as ExtendedError;
      expect(api._classifyError(error)).toBe('TRANSIENT');
    });

    it('should classify 429 rate limit as TRANSIENT', () => {
      const error = new Error('Rate limited') as ExtendedError;
      error.status = 429;
      expect(api._classifyError(error)).toBe('TRANSIENT');
    });

    it('should classify 502/503 as TRANSIENT', () => {
      const error502 = new Error('Bad gateway') as ExtendedError;
      error502.status = 502;
      expect(api._classifyError(error502)).toBe('TRANSIENT');

      const error503 = new Error('Service unavailable') as ExtendedError;
      error503.status = 503;
      expect(api._classifyError(error503)).toBe('TRANSIENT');
    });

    it('should classify 400/401/403 as PERMANENT', () => {
      const error400 = new Error('Bad request') as ExtendedError;
      error400.status = 400;
      expect(api._classifyError(error400)).toBe('PERMANENT');

      const error401 = new Error('Unauthorized') as ExtendedError;
      error401.status = 401;
      expect(api._classifyError(error401)).toBe('PERMANENT');

      const error403 = new Error('Forbidden') as ExtendedError;
      error403.status = 403;
      expect(api._classifyError(error403)).toBe('PERMANENT');
    });

    it('should classify 422 as PERMANENT', () => {
      const error = new Error('Unprocessable entity') as ExtendedError;
      error.status = 422;
      expect(api._classifyError(error)).toBe('PERMANENT');
    });

    it('should classify validation errors as USER_ACTIONABLE', () => {
      const error = new Error('validation failed') as ExtendedError;
      expect(api._classifyError(error)).toBe('USER_ACTIONABLE');
    });

    it('should classify 404 not found as USER_ACTIONABLE', () => {
      const error = new Error('File not found') as ExtendedError;
      error.status = 404;
      expect(api._classifyError(error)).toBe('USER_ACTIONABLE');
    });

    it('should classify API key errors as USER_ACTIONABLE', () => {
      api.apiKey = null;
      const error = new Error('Some error') as ExtendedError;
      expect(api._classifyError(error)).toBe('USER_ACTIONABLE');
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
  });

  describe('_pollFileStatus', () => {
    it('should return file when state is ACTIVE', async () => {
      api.client.files.get.mockResolvedValue({
        name: 'files/test123',
        state: 'ACTIVE',
      });

      const result = await api._pollFileStatus('files/test123');

      expect(result.state).toBe('ACTIVE');
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
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE' });

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
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE' });

      const result = await api._pollFileStatus('files/test123', 3, 10);

      expect(result.state).toBe('ACTIVE');
      expect(pause).toHaveBeenCalledWith(60000); // Extended 60s backoff
    });

    it('should use 1.5x exponential backoff between polling attempts', async () => {
      // File stays in PROCESSING state for 3 attempts, then becomes ACTIVE
      api.client.files.get
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'PROCESSING' })
        .mockResolvedValueOnce({ name: 'files/test123', state: 'ACTIVE' });

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

    it('should handle 422 content policy error', async () => {
      const error = new Error('safety policy') as ExtendedError;
      error.status = 422;
      api.client.models.generateContent.mockRejectedValue(error);

      await expect(
        api.generateFromVideo({
          prompt: 'Describe this video',
          fileUri: 'files/test123',
          mimeType: 'video/mp4',
        })
      ).rejects.toThrow('safety policies');
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

describe('Error Sanitization', () => {
  let api: MockedVideoAPI;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new GoogleGenAIVideoAPI('test-api-key') as MockedVideoAPI;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should sanitize errors in production mode', () => {
    process.env.NODE_ENV = 'production';

    const transientError = new Error('network error') as ExtendedError;
    const sanitized = api._sanitizeError(transientError);

    expect(sanitized.message).toBe('A temporary error occurred. Please try again.');
  });

  it('should not sanitize errors in development mode', () => {
    process.env.NODE_ENV = 'development';

    const error = new Error('Original error message') as ExtendedError;
    const result = api._sanitizeError(error);

    expect(result.message).toBe('Original error message');
  });

  it('should sanitize permanent errors differently', () => {
    process.env.NODE_ENV = 'production';

    const permanentError = new Error('Authentication failed') as ExtendedError;
    permanentError.status = 401;
    const sanitized = api._sanitizeError(permanentError);

    expect(sanitized.message).toBe('The request could not be completed. Please check your inputs.');
  });
});
