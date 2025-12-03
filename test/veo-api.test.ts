/**
 * Veo API Tests
 * Tests for GoogleGenAIVeoAPI class
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock @google/genai SDK
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateVideos: vi.fn(),
    },
    operations: {
      getVideosOperation: vi.fn(),
    },
    files: {
      download: vi.fn(),
    },
  })),
}));

import { GoogleGenAI } from '@google/genai';
import { GoogleGenAIVeoAPI, VEO_MODELS, VEO_MODES } from '../src/veo-api.js';
import type {
  ErrorClassification,
  VeoModel,
  VeoOperation,
  VeoImage,
  VeoReferenceImage,
  VeoWaitOptions,
} from '../src/types/index.js';

// Interface for extended error with status
interface ExtendedError extends Error {
  status?: number;
  response?: { status?: number };
}

// Interface for mocked API with access to private members
interface MockedVeoAPI extends GoogleGenAIVeoAPI {
  apiKey: string | null;
  defaultModel: VeoModel;
  client: {
    models: {
      generateVideos: Mock;
    };
    operations: {
      getVideosOperation: Mock;
    };
    files: {
      download: Mock;
    };
  };
  logger: { level: string };
  _verifyApiKey: () => void;
  _classifyError: (error: ExtendedError) => ErrorClassification;
  _sanitizeError: (error: ExtendedError) => Error;
}

describe('GoogleGenAIVeoAPI', () => {
  let api: MockedVeoAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock client instance
    new GoogleGenAI({ apiKey: 'test-key' });

    // Create API instance
    api = new GoogleGenAIVeoAPI('test-api-key') as MockedVeoAPI;
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      const instance = new GoogleGenAIVeoAPI('test-key');
      expect(instance).toBeInstanceOf(GoogleGenAIVeoAPI);
    });

    it('should throw error without API key', () => {
      expect(() => new GoogleGenAIVeoAPI(undefined as unknown as string)).toThrow('API key is required');
    });

    it('should throw error with empty API key', () => {
      expect(() => new GoogleGenAIVeoAPI('')).toThrow('API key is required');
    });

    it('should accept log level parameter', () => {
      const instance = new GoogleGenAIVeoAPI('test-key', 'debug');
      expect(instance).toBeInstanceOf(GoogleGenAIVeoAPI);
    });

    it('should set default model to Veo 3.1', () => {
      const instance = new GoogleGenAIVeoAPI('test-key') as MockedVeoAPI;
      expect(instance.defaultModel).toBe(VEO_MODELS.VEO_3_1);
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

    it('should classify safety errors as SAFETY_BLOCKED', () => {
      const error = new Error('Content blocked by safety filter') as ExtendedError;
      expect(api._classifyError(error)).toBe('SAFETY_BLOCKED');
    });

    it('should classify audio errors as AUDIO_BLOCKED', () => {
      const error = new Error('Audio processing blocked due to safety') as ExtendedError;
      expect(api._classifyError(error)).toBe('AUDIO_BLOCKED');
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

  describe('_sanitizeError', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return original error in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Detailed internal error') as ExtendedError;
      expect(api._sanitizeError(error)).toBe(error);
    });

    it('should return generic message for TRANSIENT in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('network timeout') as ExtendedError;
      const sanitized = api._sanitizeError(error);
      expect(sanitized.message).toBe('A temporary error occurred. Please try again.');
    });

    it('should return safety message for SAFETY_BLOCKED in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Content blocked by safety') as ExtendedError;
      const sanitized = api._sanitizeError(error);
      expect(sanitized.message).toBe('Video generation was blocked due to content safety policies.');
    });

    it('should return audio message for AUDIO_BLOCKED in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Audio blocked') as ExtendedError;
      const sanitized = api._sanitizeError(error);
      expect(sanitized.message).toBe('Video generation was blocked due to audio processing issues.');
    });

    it('should return generic message for PERMANENT in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Bad request') as ExtendedError;
      error.status = 400;
      const sanitized = api._sanitizeError(error);
      expect(sanitized.message).toBe('The request could not be completed. Please check your inputs.');
    });
  });

  describe('generateVideo (text-to-video)', () => {
    it('should call generateVideos with correct parameters', async () => {
      const mockOperation: VeoOperation = {
        name: 'operations/test-op-123',
        done: false,
      };

      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      const operation = await api.generateVideo({
        prompt: 'A cat playing in the garden',
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A cat playing in the garden',
        config: undefined,
      });
      expect(operation.name).toBe('operations/test-op-123');
    });

    it('should pass config options when provided', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateVideo({
        prompt: 'A sunset over the ocean',
        aspectRatio: '16:9',
        resolution: '1080p',
        durationSeconds: 8,
        negativePrompt: 'blurry, low quality',
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A sunset over the ocean',
        config: {
          aspectRatio: '16:9',
          resolution: '1080p',
          durationSeconds: 8,
          negativePrompt: 'blurry, low quality',
        },
      });
    });

    it('should use specified model', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateVideo({
        prompt: 'A bird flying',
        model: VEO_MODELS.VEO_3_1_FAST,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          model: VEO_MODELS.VEO_3_1_FAST,
        })
      );
    });

    it('should throw on invalid aspect ratio', async () => {
      await expect(
        api.generateVideo({
          prompt: 'A test video',
          aspectRatio: '4:3', // Invalid for Veo
        })
      ).rejects.toThrow(/Invalid aspect ratio/);
    });

    it('should throw on invalid resolution', async () => {
      await expect(
        api.generateVideo({
          prompt: 'A test video',
          resolution: '4K', // Invalid
        })
      ).rejects.toThrow(/Invalid resolution/);
    });

    it('should throw on invalid duration', async () => {
      await expect(
        api.generateVideo({
          prompt: 'A test video',
          durationSeconds: 10, // Invalid
        })
      ).rejects.toThrow(/Invalid duration/);
    });

    it('should throw when 1080p used with non-8s duration', async () => {
      await expect(
        api.generateVideo({
          prompt: 'A test video',
          resolution: '1080p',
          durationSeconds: 4,
        })
      ).rejects.toThrow(/1080p resolution requires 8-second duration/);
    });

    it('should throw without prompt', async () => {
      await expect(api.generateVideo({} as { prompt: string })).rejects.toThrow(/Prompt is required/);
    });

    it('should handle API errors', async () => {
      api.client.models.generateVideos = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(api.generateVideo({ prompt: 'Test' })).rejects.toThrow();
    });
  });

  describe('generateFromImage (image-to-video)', () => {
    const mockImage: VeoImage = {
      imageBytes: 'base64-encoded-image-data',
      mimeType: 'image/png',
    };

    it('should call generateVideos with image', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateFromImage({
        prompt: 'A cat waking up',
        image: mockImage,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A cat waking up',
        image: mockImage,
        config: undefined,
      });
    });

    it('should throw without image object', async () => {
      await expect(
        api.generateFromImage({
          prompt: 'Test prompt',
        } as { prompt: string; image: VeoImage })
      ).rejects.toThrow(/image object is required/);
    });

    it('should throw without imageBytes', async () => {
      await expect(
        api.generateFromImage({
          prompt: 'Test prompt',
          image: { mimeType: 'image/png' } as VeoImage,
        })
      ).rejects.toThrow(/image.imageBytes is required/);
    });

    it('should throw without mimeType', async () => {
      await expect(
        api.generateFromImage({
          prompt: 'Test prompt',
          image: { imageBytes: 'data' } as VeoImage,
        })
      ).rejects.toThrow(/image.mimeType is required/);
    });

    it('should pass config options', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateFromImage({
        prompt: 'A flower blooming',
        image: mockImage,
        aspectRatio: '9:16',
        durationSeconds: 6,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: '9:16',
            durationSeconds: 6,
          }),
        })
      );
    });
  });

  describe('generateWithReferences (Veo 3.1 only)', () => {
    const mockReferenceImages: VeoReferenceImage[] = [
      {
        image: { imageBytes: 'ref1-data', mimeType: 'image/png' },
        referenceType: 'asset',
      },
      {
        image: { imageBytes: 'ref2-data', mimeType: 'image/png' },
        referenceType: 'asset',
      },
    ];

    it('should call generateVideos with reference images', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithReferences({
        prompt: 'A woman in a flamingo dress',
        referenceImages: mockReferenceImages,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A woman in a flamingo dress',
        config: expect.objectContaining({
          durationSeconds: 8,
          referenceImages: mockReferenceImages,
        }),
      });
    });

    it('should force 8s duration for reference images', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithReferences({
        prompt: 'Test prompt',
        referenceImages: mockReferenceImages,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 8,
          }),
        })
      );
    });

    it('should reject more than 3 reference images', async () => {
      const tooManyRefs: VeoReferenceImage[] = [
        { image: { imageBytes: '1', mimeType: 'image/png' }, referenceType: 'asset' },
        { image: { imageBytes: '2', mimeType: 'image/png' }, referenceType: 'asset' },
        { image: { imageBytes: '3', mimeType: 'image/png' }, referenceType: 'asset' },
        { image: { imageBytes: '4', mimeType: 'image/png' }, referenceType: 'asset' },
      ];

      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: tooManyRefs,
        })
      ).rejects.toThrow(/Maximum 3 reference images/);
    });

    it('should reject reference images for Veo 2', async () => {
      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: mockReferenceImages,
          model: VEO_MODELS.VEO_2,
        })
      ).rejects.toThrow(/reference-images mode is not supported/);
    });

    it('should reject reference images for Veo 3', async () => {
      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: mockReferenceImages,
          model: VEO_MODELS.VEO_3,
        })
      ).rejects.toThrow(/reference-images mode is not supported/);
    });

    it('should reject empty reference images array', async () => {
      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: [],
        })
      ).rejects.toThrow(/At least one reference image/);
    });

    it('should reject reference without image property', async () => {
      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: [{ referenceType: 'asset' }] as VeoReferenceImage[],
        })
      ).rejects.toThrow(/missing 'image' property/);
    });

    it('should reject reference without referenceType', async () => {
      await expect(
        api.generateWithReferences({
          prompt: 'Test',
          referenceImages: [{ image: { imageBytes: 'data', mimeType: 'image/png' } }] as VeoReferenceImage[],
        })
      ).rejects.toThrow(/missing 'referenceType' property/);
    });
  });

  describe('generateWithInterpolation (Veo 3.1 only)', () => {
    const mockFirstFrame: VeoImage = { imageBytes: 'first-frame', mimeType: 'image/png' };
    const mockLastFrame: VeoImage = { imageBytes: 'last-frame', mimeType: 'image/png' };

    it('should call generateVideos with first and last frames', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithInterpolation({
        prompt: 'A ghost fading away',
        firstFrame: mockFirstFrame,
        lastFrame: mockLastFrame,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A ghost fading away',
        image: mockFirstFrame,
        config: expect.objectContaining({
          durationSeconds: 8,
          lastFrame: mockLastFrame,
        }),
      });
    });

    it('should force 8s duration for interpolation', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithInterpolation({
        prompt: 'Test',
        firstFrame: mockFirstFrame,
        lastFrame: mockLastFrame,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 8,
          }),
        })
      );
    });

    it('should throw without firstFrame', async () => {
      await expect(
        api.generateWithInterpolation({
          prompt: 'Test',
          lastFrame: mockLastFrame,
        } as { prompt: string; firstFrame: VeoImage; lastFrame: VeoImage })
      ).rejects.toThrow(/firstFrame with imageBytes and mimeType is required/);
    });

    it('should throw without lastFrame', async () => {
      await expect(
        api.generateWithInterpolation({
          prompt: 'Test',
          firstFrame: mockFirstFrame,
        } as { prompt: string; firstFrame: VeoImage; lastFrame: VeoImage })
      ).rejects.toThrow(/lastFrame with imageBytes and mimeType is required/);
    });

    it('should reject interpolation for Veo 2', async () => {
      await expect(
        api.generateWithInterpolation({
          prompt: 'Test',
          firstFrame: mockFirstFrame,
          lastFrame: mockLastFrame,
          model: VEO_MODELS.VEO_2,
        })
      ).rejects.toThrow(/interpolation mode is not supported/);
    });

    it('should work without prompt for interpolation', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithInterpolation({
        firstFrame: mockFirstFrame,
        lastFrame: mockLastFrame,
      } as { prompt?: string; firstFrame: VeoImage; lastFrame: VeoImage });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: '',
        })
      );
    });
  });

  describe('extendVideo (Veo 3.1 only)', () => {
    const mockVideo = { uri: 'files/video-abc123' };

    it('should call generateVideos with video for extension', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.extendVideo({
        prompt: 'A butterfly lands on the flower',
        video: mockVideo,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith({
        model: VEO_MODELS.VEO_3_1,
        prompt: 'A butterfly lands on the flower',
        video: mockVideo,
        config: expect.objectContaining({
          numberOfVideos: 1,
          resolution: '720p',
        }),
      });
    });

    it('should force 720p resolution for extension', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.extendVideo({
        prompt: 'Test',
        video: mockVideo,
      });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            resolution: '720p',
          }),
        })
      );
    });

    it('should throw without video object', async () => {
      await expect(
        api.extendVideo({
          prompt: 'Test',
        } as { prompt: string; video: { uri: string } })
      ).rejects.toThrow(/video object from a previous Veo generation is required/);
    });

    it('should reject extension for Veo 2', async () => {
      await expect(
        api.extendVideo({
          prompt: 'Test',
          video: mockVideo,
          model: VEO_MODELS.VEO_2,
        })
      ).rejects.toThrow(/extension mode is not supported/);
    });

    it('should reject extension for Veo 3', async () => {
      await expect(
        api.extendVideo({
          prompt: 'Test',
          video: mockVideo,
          model: VEO_MODELS.VEO_3,
        })
      ).rejects.toThrow(/extension mode is not supported/);
    });
  });

  describe('waitForCompletion', () => {
    it('should return immediately if operation is done', async () => {
      const doneOperation: VeoOperation = {
        done: true,
        response: {
          generatedVideos: [{ video: { uri: 'test' } }],
        },
      };

      const result = await api.waitForCompletion(doneOperation);
      expect(result).toBe(doneOperation);
    });

    it('should poll until operation is done', async () => {
      let callCount = 0;
      api.client.operations.getVideosOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 3) {
          return {
            done: true,
            response: { generatedVideos: [{ video: {} }] },
          };
        }
        return { done: false };
      });

      const operation: VeoOperation = { name: 'test-op', done: false };
      const result = await api.waitForCompletion(operation, {
        intervalMs: 10, // Fast polling for test
      } as VeoWaitOptions);

      expect(result.done).toBe(true);
      expect(api.client.operations.getVideosOperation).toHaveBeenCalledTimes(3);
    });

    it('should call onProgress callback', async () => {
      let callCount = 0;
      api.client.operations.getVideosOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) {
          return { done: true, response: { generatedVideos: [{ video: {} }] } };
        }
        return { done: false };
      });

      const onProgress = vi.fn();
      const operation: VeoOperation = { name: 'test-op', done: false };

      await api.waitForCompletion(operation, {
        intervalMs: 10,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
    });

    it('should throw on operation error', async () => {
      api.client.operations.getVideosOperation = vi.fn().mockResolvedValue({
        done: true,
        error: { message: 'Generation failed' },
      });

      const operation: VeoOperation = { name: 'test-op', done: false };

      await expect(api.waitForCompletion(operation, { intervalMs: 10 })).rejects.toThrow('Generation failed');
    });

    it('should timeout after max attempts', async () => {
      api.client.operations.getVideosOperation = vi.fn().mockResolvedValue({
        done: false,
      });

      const operation: VeoOperation = { name: 'test-op', done: false };

      await expect(
        api.waitForCompletion(operation, {
          maxAttempts: 2,
          intervalMs: 10,
        })
      ).rejects.toThrow(/timed out/);
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      api.client.operations.getVideosOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('network timeout');
          throw error;
        }
        return { done: true, response: { generatedVideos: [{ video: {} }] } };
      });

      const operation: VeoOperation = { name: 'test-op', done: false };
      const result = await api.waitForCompletion(operation, {
        maxAttempts: 5,
        intervalMs: 10,
      });

      expect(result.done).toBe(true);
    });
  });

  describe('downloadVideo', () => {
    it('should download video to specified path', async () => {
      api.client.files.download = vi.fn().mockResolvedValue(undefined);

      const operation: VeoOperation = {
        done: true,
        response: {
          generatedVideos: [
            {
              video: { uri: 'files/video-123' },
            },
          ],
        },
      };

      const result = await api.downloadVideo(operation, '/tmp/test.mp4');

      expect(api.client.files.download).toHaveBeenCalledWith({
        file: { uri: 'files/video-123' },
        downloadPath: '/tmp/test.mp4',
      });
      expect(result.path).toBe('/tmp/test.mp4');
    });

    it('should throw if operation is not complete', async () => {
      const operation: VeoOperation = { done: false };

      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow(/operation is not complete/);
    });

    it('should throw if no video in response', async () => {
      const operation: VeoOperation = {
        done: true,
        response: {},
      };

      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow(/No video found/);
    });

    it('should handle errors gracefully', async () => {
      api.client.files.download = vi.fn().mockRejectedValue(new Error('Download failed'));

      const operation: VeoOperation = {
        done: true,
        response: {
          generatedVideos: [{ video: {} }],
        },
      };

      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow();
    });
  });

  describe('extractVideo', () => {
    it('should extract video from completed operation', () => {
      const operation: VeoOperation = {
        done: true,
        response: {
          generatedVideos: [
            {
              video: { uri: 'files/video-123' },
            },
          ],
        },
      };

      const result = api.extractVideo(operation);

      expect(result.video).toEqual({ uri: 'files/video-123' });
      expect(result.hasAudio).toBe(true);
    });

    it('should throw if operation not complete', () => {
      const operation: VeoOperation = { done: false };

      expect(() => api.extractVideo(operation)).toThrow(/operation is not complete/);
    });

    it('should throw if no video in response', () => {
      const operation: VeoOperation = { done: true, response: {} };

      expect(() => api.extractVideo(operation)).toThrow(/No video found/);
    });
  });

  describe('setLogLevel', () => {
    it('should change logger level', () => {
      api.setLogLevel('debug');
      expect(api.logger.level).toBe('debug');

      api.setLogLevel('ERROR');
      expect(api.logger.level).toBe('error');
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for default model', () => {
      const info = api.getModelInfo();
      expect(info.model).toBe(VEO_MODELS.VEO_3_1);
      expect(info.features.textToVideo).toBe(true);
    });

    it('should return model info for specified model', () => {
      const info = api.getModelInfo(VEO_MODELS.VEO_2);
      expect(info.model).toBe(VEO_MODELS.VEO_2);
      expect(info.features.nativeAudio).toBe(false);
    });

    it('should throw for unknown model', () => {
      expect(() => api.getModelInfo('unknown-model' as VeoModel)).toThrow(/Unknown model/);
    });
  });
});

describe('VEO_MODELS', () => {
  it('should export all Veo models', () => {
    expect(VEO_MODELS.VEO_3_1).toBe('veo-3.1-generate-preview');
    expect(VEO_MODELS.VEO_3_1_FAST).toBe('veo-3.1-fast-generate-preview');
    expect(VEO_MODELS.VEO_3).toBe('veo-3.0-generate-001');
    expect(VEO_MODELS.VEO_3_FAST).toBe('veo-3.0-fast-generate-001');
    expect(VEO_MODELS.VEO_2).toBe('veo-2.0-generate-001');
  });
});

describe('VEO_MODES', () => {
  it('should export all generation modes', () => {
    expect(VEO_MODES.TEXT_TO_VIDEO).toBe('text-to-video');
    expect(VEO_MODES.IMAGE_TO_VIDEO).toBe('image-to-video');
    expect(VEO_MODES.REFERENCE_IMAGES).toBe('reference-images');
    expect(VEO_MODES.INTERPOLATION).toBe('interpolation');
    expect(VEO_MODES.EXTENSION).toBe('extension');
  });
});
