/**
 * Veo API Tests
 * Tests for GoogleGenAIVeoAPI class
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock @google/genai SDK
vi.mock('@google/genai', async (importOriginal) => ({
  // The real operation class: waitForCompletion builds one to poll with (the SDK
  // calls its _fromAPIResponse method), so a stub here would test nothing.
  GenerateVideosOperation: (await importOriginal<typeof import('@google/genai')>()).GenerateVideosOperation,
  // A `function`, not an arrow: vitest 4 refuses `new` on arrow implementations.
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      models: {
        generateVideos: vi.fn(),
      },
      operations: {
        getVideosOperation: vi.fn(),
      },
      files: {
        download: vi.fn(),
      },
    };
  }),
}));

import { GoogleGenAI } from '@google/genai';
import { GoogleGenAIVeoAPI, VEO_MODELS, VEO_MODES } from '../src/veo-api.js';
import type {
  VeoModel,
  VeoOperation,
  VeoImage,
  VeoReferenceImage,
  VeoWaitOptions,
} from '../src/types/index.js';

// The API with its private members exposed for testing. Not `extends
// GoogleGenAIVeoAPI`: redeclaring private members is a type error (TS2430).
type MockedVeoAPI = Omit<GoogleGenAIVeoAPI, never> & MockedVeoInternals;
interface MockedVeoInternals {
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
  logger: { level: string; warn: (msg: string) => void };
  _verifyApiKey: () => void;
}

describe('GoogleGenAIVeoAPI', () => {
  let api: MockedVeoAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock client instance
    new GoogleGenAI({ apiKey: 'test-key' });

    // Create API instance
    api = new GoogleGenAIVeoAPI('test-api-key') as unknown as MockedVeoAPI;
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
      const instance = new GoogleGenAIVeoAPI('test-key') as unknown as MockedVeoAPI;
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
        source: { prompt: 'A cat playing in the garden' },
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
        source: { prompt: 'A sunset over the ocean' },
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
        source: { prompt: 'A cat waking up', image: mockImage },
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
        source: { prompt: 'A woman in a flamingo dress' },
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
        source: { prompt: 'A ghost fading away', image: mockFirstFrame },
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

    it('should work without prompt for interpolation', async () => {
      const mockOperation: VeoOperation = { name: 'test-op', done: false };
      api.client.models.generateVideos = vi.fn().mockResolvedValue(mockOperation);

      await api.generateWithInterpolation({
        firstFrame: mockFirstFrame,
        lastFrame: mockLastFrame,
      } as { prompt?: string; firstFrame: VeoImage; lastFrame: VeoImage });

      expect(api.client.models.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          source: { prompt: '', image: mockFirstFrame },
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
        source: { prompt: 'A butterfly lands on the flower', video: mockVideo },
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
  });

  describe('waitForCompletion', () => {
    it('an operation that is already done with an error is thrown, not returned as a success', async () => {
      const failed: VeoOperation = { name: 'op', done: true, error: { message: 'Request blocked by safety policy', code: 3 } };
      const thrown = (await api.waitForCompletion(failed).catch((e: unknown) => e)) as Error & { classification?: string; code?: number };
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown.code).toBe(3);
      expect(thrown.classification).toBe('SAFETY_BLOCKED');
      expect(api.client.operations.getVideosOperation).not.toHaveBeenCalled();
    });

    it('should return immediately if operation is done', async () => {
      const doneOperation: VeoOperation = {
        name: 'op',
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

    it('retries a poll request that failed at the network (fetch TypeError)', async () => {
      const poll = vi.fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({ done: true, response: { generatedVideos: [{ video: {} }] } });
      api.client.operations.getVideosOperation = poll;

      const result = await api.waitForCompletion({ name: 'test-op', done: false }, { maxAttempts: 5, intervalMs: 10 });
      expect(result.done).toBe(true);
      expect(poll).toHaveBeenCalledTimes(2);
    });

    it('retries a poll request that got a 503', async () => {
      const unavailable = Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE","message":"try later"}}'), { status: 503 });
      const poll = vi.fn()
        .mockRejectedValueOnce(unavailable)
        .mockResolvedValueOnce({ done: true, response: { generatedVideos: [{ video: {} }] } });
      api.client.operations.getVideosOperation = poll;

      await expect(api.waitForCompletion({ name: 'test-op', done: false }, { maxAttempts: 5, intervalMs: 10 })).resolves.toMatchObject({ done: true });
      expect(poll).toHaveBeenCalledTimes(2);
    });

    it('does not retry a poll request that got a 400', async () => {
      const bad = Object.assign(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"bad name"}}'), { status: 400 });
      const poll = vi.fn().mockRejectedValue(bad);
      api.client.operations.getVideosOperation = poll;

      await expect(api.waitForCompletion({ name: 'test-op', done: false }, { maxAttempts: 5, intervalMs: 10 })).rejects.toBe(bad);
      expect(poll).toHaveBeenCalledTimes(1);
    });

    it('a finished operation that failed is terminal: thrown on the first poll, never re-polled — whatever its code', async () => {
      // RESOURCE_EXHAUSTED (8) classifies as TRANSIENT, and 1.x re-polled a finished
      // job whose message mentioned "network"/"timeout" for up to ten minutes.
      const poll = vi.fn().mockResolvedValue({
        name: 'test-op',
        done: true,
        error: { code: 8, message: 'Quota exceeded; network timeout while reserving capacity' },
      });
      api.client.operations.getVideosOperation = poll;

      const err = await api.waitForCompletion({ name: 'test-op', done: false }, { maxAttempts: 60, intervalMs: 10 }).catch((e) => e);
      expect(poll).toHaveBeenCalledTimes(1);
      expect(err.message).toContain('Quota exceeded');
      expect(err.operationError).toEqual({ code: 8, message: 'Quota exceeded; network timeout while reserving capacity' });
      expect(err.code).toBe(8);
      expect(err.classification).toBe('TRANSIENT');
      expect(err.surface).toBe('video');
    });
  });

  describe('downloadVideo', () => {
    it('should download video to specified path', async () => {
      api.client.files.download = vi.fn().mockResolvedValue(undefined);

      const operation: VeoOperation = {
        name: 'op',
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
      const operation: VeoOperation = { name: 'op', done: false };

      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow(/operation is not complete/);
    });

    it("names Google's safety-filter reasons when the output was withheld", async () => {
      const operation: VeoOperation = {
        name: 'op',
        done: true,
        response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['The prompt contains a celebrity likeness.'] },
      };
      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow(
        /No video found in operation response: withheld by Google's safety filters \(The prompt contains a celebrity likeness\.\)/
      );
    });

    it('should throw if no video in response', async () => {
      const operation: VeoOperation = {
        name: 'op',
        done: true,
        response: {},
      };

      await expect(api.downloadVideo(operation, '/tmp/test.mp4')).rejects.toThrow(/No video found/);
    });

    it('should handle errors gracefully', async () => {
      api.client.files.download = vi.fn().mockRejectedValue(new Error('Download failed'));

      const operation: VeoOperation = {
        name: 'op',
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
        name: 'op',
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
      const operation: VeoOperation = { name: 'op', done: false };

      expect(() => api.extractVideo(operation)).toThrow(/operation is not complete/);
    });

    it('should throw if no video in response', () => {
      const operation: VeoOperation = { name: 'op', done: true, response: {} };

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
      const info = api.getModelInfo(VEO_MODELS.VEO_3_1_FAST);
      expect(info.model).toBe(VEO_MODELS.VEO_3_1_FAST);
      expect(info.features.nativeAudio).toBe(true);
    });

    it('should throw for unknown model', () => {
      expect(() => api.getModelInfo('unknown-model' as VeoModel)).toThrow(/Unknown model/);
    });
  });

  describe('model validation in the client (spec D3/D5)', () => {
    const img: VeoImage = { imageBytes: 'data', mimeType: 'image/png' };
    const op: VeoOperation = { name: 'op', done: false };

    it('Lite: generateWithReferences is rejected before any call (owed from P2)', async () => {
      await expect(
        api.generateWithReferences({ prompt: 'x', model: VEO_MODELS.VEO_3_1_LITE, referenceImages: [{ image: img, referenceType: 'asset' }] })
      ).rejects.toThrow('reference-images mode is not supported by veo-3.1-lite-generate-preview');
      expect(api.client.models.generateVideos).not.toHaveBeenCalled();
    });

    it('Lite: extendVideo is rejected before any call (owed from P2)', async () => {
      await expect(api.extendVideo({ prompt: 'x', model: VEO_MODELS.VEO_3_1_LITE, video: { uri: 'v' } })).rejects.toThrow(
        'extension mode is not supported'
      );
      expect(api.client.models.generateVideos).not.toHaveBeenCalled();
    });

    it('Lite: 4k is rejected; interpolation is accepted', async () => {
      await expect(api.generateVideo({ prompt: 'x', model: VEO_MODELS.VEO_3_1_LITE, resolution: '4k', durationSeconds: '8' })).rejects.toThrow(
        "Invalid resolution '4k'"
      );
      api.client.models.generateVideos = vi.fn().mockResolvedValue(op);
      await api.generateWithInterpolation({ model: VEO_MODELS.VEO_3_1_LITE, firstFrame: img, lastFrame: img });
      expect(api.client.models.generateVideos).toHaveBeenCalledTimes(1);
    });

    it("capabilityValidation 'warn': logs and sends", async () => {
      const warnApi = new GoogleGenAIVeoAPI('test-key', 'info', { capabilityValidation: 'warn' }) as unknown as MockedVeoAPI;
      const warn = vi.spyOn(warnApi.logger, 'warn').mockImplementation(() => undefined);
      warnApi.client.models.generateVideos = vi.fn().mockResolvedValue(op);

      await warnApi.generateVideo({ prompt: 'x', model: VEO_MODELS.VEO_3_1_LITE, resolution: '4k' });

      expect(warnApi.client.models.generateVideos).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(/Invalid resolution '4k'.*sending anyway/);
    });

    it("shape violations still throw under 'warn' (seed, spec D15)", async () => {
      const warnApi = new GoogleGenAIVeoAPI('test-key', 'info', { capabilityValidation: 'warn' }) as unknown as MockedVeoAPI;
      await expect(warnApi.generateVideo({ prompt: 'x', seed: 1 } as never)).rejects.toThrow('seed was removed in 2.0');
      expect(warnApi.client.models.generateVideos).not.toHaveBeenCalled();
    });

    it('unknown Veo id: one warning per id, request sent', async () => {
      const warn = vi.spyOn(api.logger, 'warn').mockImplementation(() => undefined);
      api.client.models.generateVideos = vi.fn().mockResolvedValue(op);

      await api.generateVideo({ prompt: 'x', model: 'veo-9-imaginary', resolution: '8k' });
      await api.generateVideo({ prompt: 'y', model: 'veo-9-imaginary' });

      expect(warn.mock.calls.filter((c) => String(c[0]).includes("'veo-9-imaginary' is not in this package's catalog"))).toHaveLength(1);
      expect(api.client.models.generateVideos).toHaveBeenCalledTimes(2);
    });

    it('getModelInfo keeps its 1.x contract: throws for an unknown id; Lite info carries durationRequired', () => {
      expect(() => api.getModelInfo('veo-9-imaginary')).toThrow(/Unknown model/);
      expect(api.getModelInfo(VEO_MODELS.VEO_3_1_LITE).durationRequired).toEqual({ '1080p': '8' });
    });
  });
});

describe('VEO_MODELS', () => {
  it('should export all Veo models', () => {
    expect(VEO_MODELS.VEO_3_1).toBe('veo-3.1-generate-preview');
    expect(VEO_MODELS.VEO_3_1_FAST).toBe('veo-3.1-fast-generate-preview');
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
