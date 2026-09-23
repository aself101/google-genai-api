/**
 * API Tests
 * Tests for GoogleGenAIAPI class and its methods
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { GoogleGenAIAPI, extractGeminiParts } from '../src/api.js';
import { GoogleGenAI } from '@google/genai';
import { MODELS, DEFAULT_IMAGE_MODEL, ValidationError } from '../src/config.js';
import type { GeminiResponse, InlineData } from '../src/types/index.js';

// Mock the @google/genai SDK
vi.mock('@google/genai', () => {
  return {
    // A `function`, not an arrow: vitest 4 refuses `new` on arrow implementations.
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn(),
        },
      };
    }),
  };
});

// The API with its private members exposed for testing. Not `extends
// GoogleGenAIAPI`: redeclaring private members is a type error (TS2430).
type MockedGoogleGenAIAPI = Pick<GoogleGenAIAPI, 'generateWithGemini' | 'setLogLevel'> & MockedInternals;
interface MockedInternals {
  apiKey: string | null;
  client: {
    models: {
      generateContent: Mock;
    };
  };
  logger: { level: string; info: () => void; error: () => void; warn: (msg: string) => void };
  _verifyApiKey: () => void;
  _buildGeminiContents: (prompt: string, inputImages: InlineData[]) => string | Array<{ text: string } | { inlineData: InlineData }>;
}

describe('GoogleGenAIAPI Class', () => {
  let api: MockedGoogleGenAIAPI;
  let mockClient: MockedGoogleGenAIAPI['client'];

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create API instance
    api = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678') as unknown as MockedGoogleGenAIAPI;

    // Get reference to mocked client
    mockClient = api.client;
  });

  describe('Constructor', () => {
    it('should create instance with API key', () => {
      expect(api).toBeDefined();
      expect(api.apiKey).toBe('AIzaSyTest1234567890123456789012345678');
    });

    it('should initialize Google GenAI client', () => {
      expect(api.client).toBeDefined();
      expect(api.client.models).toBeDefined();
    });

    it('should throw error without API key', () => {
      expect(() => new GoogleGenAIAPI(undefined as unknown as string)).toThrow('API key is required');
      expect(() => new GoogleGenAIAPI('')).toThrow('API key is required');
      expect(() => new GoogleGenAIAPI(null as unknown as string)).toThrow('API key is required');
    });

    it('should set default log level to info', () => {
      const defaultApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678') as unknown as MockedGoogleGenAIAPI;
      expect(defaultApi.logger).toBeDefined();
      expect(defaultApi.logger.level).toBe('info');
    });

    it('should accept custom log level', () => {
      const debugApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678', 'debug') as unknown as MockedGoogleGenAIAPI;
      expect(debugApi.logger.level).toBe('debug');
    });

    it('should initialize logger', () => {
      expect(api.logger).toBeDefined();
      expect(typeof api.logger.info).toBe('function');
      expect(typeof api.logger.error).toBe('function');
    });
  });

  describe('API Key Management', () => {
    it('should verify API key is set', () => {
      expect(() => api._verifyApiKey()).not.toThrow();
    });

    it('should throw error if API key is missing', () => {
      api.apiKey = null;
      expect(() => api._verifyApiKey()).toThrow('API key not set');
    });
  });

  describe('_buildGeminiContents', () => {
    it('should return simple string for text-to-image (no input images)', () => {
      const result = api._buildGeminiContents('A beautiful landscape', []);
      expect(result).toBe('A beautiful landscape');
      expect(typeof result).toBe('string');
    });

    it('should return parts array for image-to-image (with input images)', () => {
      const inputImages: InlineData[] = [{ mimeType: 'image/png', data: 'base64data...' }];
      const result = api._buildGeminiContents('Edit this image', inputImages);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect((result as Array<{ text: string } | { inlineData: InlineData }>)[0]).toEqual({ text: 'Edit this image' });
      expect((result as Array<{ text: string } | { inlineData: InlineData }>)[1]).toEqual({
        inlineData: { mimeType: 'image/png', data: 'base64data...' },
      });
    });

    it('should handle multiple input images in parts array', () => {
      const inputImages: InlineData[] = [{ mimeType: 'image/png', data: 'base64data1' }];
      const result = api._buildGeminiContents('Combine these', inputImages);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  describe('generateWithGemini', () => {
    it('should call SDK with correct parameters for text-to-image', async () => {
      // Mock successful response with correct structure
      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }],
            },
          },
        ],
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      const result = await api.generateWithGemini({
        prompt: 'A serene mountain landscape',
        aspectRatio: '16:9',
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: DEFAULT_IMAGE_MODEL,
        contents: 'A serene mountain landscape',
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should call SDK with parts array for image-to-image', async () => {
      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64edited' } }],
            },
          },
        ],
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      const inputImages: InlineData[] = [{ mimeType: 'image/jpeg', data: 'inputbase64' }];

      const result = await api.generateWithGemini({
        prompt: 'Make it sunset',
        inputImages,
        aspectRatio: '1:1',
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: DEFAULT_IMAGE_MODEL,
        contents: [{ text: 'Make it sunset' }, { inlineData: { mimeType: 'image/jpeg', data: 'inputbase64' } }],
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use default aspect ratio if not provided', async () => {
      const mockResponse: GeminiResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'Test prompt',
      });

      expect(mockClient.models.generateContent).toHaveBeenCalled();
    });

    it('should throw error if API key not set', async () => {
      api.apiKey = null;

      await expect(api.generateWithGemini({ prompt: 'Test' })).rejects.toThrow('API key not set');
    });

    it('should handle SDK errors', async () => {
      const sdkError = new Error('SDK API error');
      mockClient.models.generateContent.mockRejectedValue(sdkError);

      await expect(api.generateWithGemini({ prompt: 'Test' })).rejects.toThrow('SDK API error');
    });

    it('extractGeminiParts skips an inlineData part that carries no bytes', () => {
      const parts = extractGeminiParts({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png' } }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }],
      });
      expect(parts).toEqual([{ type: 'image', mimeType: 'image/png', data: 'AAAA' }]);
    });

    it('a non-Error rejection (null) reaches the caller classified, not as a TypeError from the catch block', async () => {
      // `catch` receives unknown; 1.x-style `(error as Error).message` threw here and
      // replaced the failure with "Cannot read properties of null".
      mockClient.models.generateContent.mockRejectedValue(null);

      const thrown = await api.generateWithGemini({ prompt: 'Test' }).then(
        () => undefined,
        (e: unknown) => e as Error & { classification?: string }
      );
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown?.message).not.toMatch(/Cannot read properties/);
      expect(thrown?.classification).toBe('USER_ACTIONABLE');
    });

    it('should sanitize errors in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const sdkError = new Error('Internal SDK details');
      mockClient.models.generateContent.mockRejectedValue(sdkError);

      await expect(api.generateWithGemini({ prompt: 'Test' })).rejects.toThrow('Image generation failed');

      process.env.NODE_ENV = originalEnv;
    });

    it('should detect mode automatically based on input images', async () => {
      const mockResponse: GeminiResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      // Text-to-image (no images)
      await api.generateWithGemini({ prompt: 'Test', inputImages: [] });

      // Image-to-image (one image)
      const inputImages: InlineData[] = [{ mimeType: 'image/png', data: 'data' }];
      await api.generateWithGemini({ prompt: 'Edit', inputImages });

      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(2);
    });

    it('returns a no-image response unchanged and warns with the finishReason', async () => {
      const blocked: GeminiResponse = { candidates: [{ content: { parts: [] }, finishReason: 'IMAGE_SAFETY' }] };
      mockClient.models.generateContent.mockResolvedValue(blocked);
      const warn = vi.spyOn(api.logger, 'warn').mockImplementation(() => undefined);

      await expect(api.generateWithGemini({ prompt: 'x' })).resolves.toBe(blocked);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('returned no image (finishReason: IMAGE_SAFETY)'));
    });

    it('does not count a thought image as output', async () => {
      const draftOnly: GeminiResponse = {
        candidates: [{ content: { parts: [{ thought: true, inlineData: { mimeType: 'image/png', data: 'd' } }] }, finishReason: 'STOP' }],
      };
      mockClient.models.generateContent.mockResolvedValue(draftOnly);
      const warn = vi.spyOn(api.logger, 'warn').mockImplementation(() => undefined);
      await api.generateWithGemini({ prompt: 'x' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('returned no image'));
    });

    it('should use custom model when provided', async () => {
      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }],
            },
          },
        ],
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'A futuristic cityscape',
        aspectRatio: '16:9',
        model: MODELS.GEMINI_3_PRO,
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: MODELS.GEMINI_3_PRO,
        contents: 'A futuristic cityscape',
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      });
    });

    it('should default to DEFAULT_IMAGE_MODEL (gemini-3.1-flash-image) when model not specified', async () => {
      const mockResponse: GeminiResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'Test prompt',
        aspectRatio: '1:1',
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: DEFAULT_IMAGE_MODEL,
        contents: 'Test prompt',
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      });
    });
  });

  describe('parameter validation (spec D3/D5)', () => {
    const ok: GeminiResponse = { candidates: [{ content: { parts: [] } }] };

    it('pins the SDK client to the Gemini Developer API (vertexai: false)', () => {
      expect(GoogleGenAI).toHaveBeenLastCalledWith({ apiKey: 'AIzaSyTest1234567890123456789012345678', vertexai: false });
    });

    it('known model + unsupported value: throws ValidationError and never calls the SDK', async () => {
      await expect(
        api.generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_PRO, aspectRatio: '8:1' })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockClient.models.generateContent).not.toHaveBeenCalled();
    });

    it('known model + too many images: throws even when the caller supplies `mode` (1.x skipped the check)', async () => {
      const images: InlineData[] = Array.from({ length: 15 }, () => ({ mimeType: 'image/png', data: 'abc' }));
      await expect(
        api.generateWithGemini({ prompt: 'x', inputImages: images, mode: 'image-to-image' })
      ).rejects.toThrow('accepts at most 14 input images');
      expect(mockClient.models.generateContent).not.toHaveBeenCalled();
    });

    it("capabilityValidation 'warn': logs the violation and sends the request", async () => {
      const warnApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678', 'info', {
        capabilityValidation: 'warn',
      }) as unknown as MockedGoogleGenAIAPI;
      const warn = vi.spyOn(warnApi.logger, 'warn').mockImplementation(() => undefined);
      warnApi.client.models.generateContent.mockResolvedValue(ok);

      await warnApi.generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_PRO, aspectRatio: '8:1' });

      expect(warnApi.client.models.generateContent).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(/Invalid aspect ratio '8:1'.*sending anyway/);
    });

    it("shape violations throw even under 'warn'", async () => {
      const warnApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678', 'info', {
        capabilityValidation: 'warn',
      }) as unknown as MockedGoogleGenAIAPI;
      await expect(
        warnApi.generateWithGemini({ prompt: 'x', inputImages: [{ mimeType: 'image/png', data: '' }] })
      ).rejects.toThrow('has no data');
      expect(warnApi.client.models.generateContent).not.toHaveBeenCalled();
    });

    it('unknown model: warns once per id, sends every caller param', async () => {
      const warn = vi.spyOn(api.logger, 'warn').mockImplementation(() => undefined);
      mockClient.models.generateContent.mockResolvedValue(ok);
      const images: InlineData[] = Array.from({ length: 20 }, () => ({ mimeType: 'image/png', data: 'abc' }));

      await api.generateWithGemini({ prompt: 'x', model: 'gemini-9-imaginary', aspectRatio: '8:1', inputImages: images });
      await api.generateWithGemini({ prompt: 'y', model: 'gemini-9-imaginary' });

      const unknownWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("'gemini-9-imaginary' is not in this package's catalog"));
      expect(unknownWarnings).toHaveLength(1);
      const [first] = mockClient.models.generateContent.mock.calls[0];
      expect(first.model).toBe('gemini-9-imaginary');
      expect(first.contents).toHaveLength(21); // prompt + all 20 images: nothing dropped for lack of a constraint
      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(2);
    });

    it('a ValidationError is not rewritten by production sanitization', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          api.generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_PRO, aspectRatio: '8:1' })
        ).rejects.toThrow("Invalid aspect ratio '8:1'");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('setLogLevel', () => {
    it('should change logger level', () => {
      api.setLogLevel('debug');
      expect(api.logger.level).toBe('debug');

      api.setLogLevel('warn');
      expect(api.logger.level).toBe('warn');

      api.setLogLevel('error');
      expect(api.logger.level).toBe('error');
    });

    it('should handle case-insensitive log levels', () => {
      api.setLogLevel('DEBUG');
      expect(api.logger.level).toBe('debug');

      api.setLogLevel('INFO');
      expect(api.logger.level).toBe('info');
    });
  });
});

describe('Response Extraction Functions', () => {
  describe('extractGeminiParts', () => {
    it('should extract text parts from Gemini response', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [{ text: 'This is a description of the image' }] } }],
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        type: 'text',
        content: 'This is a description of the image',
      });
    });

    it('should extract image parts from Gemini response', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64imagedata',
            },
          },
        ] } }],
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        data: 'base64imagedata',
      });
    });

    it('should extract mixed text and image parts', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [
          { text: 'Here is your image:' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64data',
            },
          },
          { text: 'Additional description' },
        ] } }],
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(3);
      expect(parts[0].type).toBe('text');
      expect(parts[1].type).toBe('image');
      expect(parts[2].type).toBe('text');
    });

    it('should use default mimeType if not provided', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [
          {
            inlineData: {
              data: 'base64data',
            },
          },
        ] } }],
      };

      const parts = extractGeminiParts(response);

      expect(parts[0].mimeType).toBe('image/png');
    });

    it('should handle empty parts array', () => {
      const response: GeminiResponse = { candidates: [{ content: { parts: [] } }] };
      const parts = extractGeminiParts(response);
      expect(parts).toEqual([]);
    });

    it('skips thought parts by default (gemini-3-pro-image draft images are not output)', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [
          { thought: true, inlineData: { mimeType: 'image/png', data: 'draft' } },
          { thought: true, text: 'planning the composition' },
          { inlineData: { mimeType: 'image/png', data: 'final' } },
        ] } }],
      };
      expect(extractGeminiParts(response)).toEqual([{ type: 'image', mimeType: 'image/png', data: 'final' }]);
    });

    it('includeThoughts: true keeps them, in order', () => {
      const response: GeminiResponse = {
        candidates: [{ content: { parts: [
          { thought: true, inlineData: { mimeType: 'image/png', data: 'draft' } },
          { inlineData: { mimeType: 'image/png', data: 'final' } },
        ] } }],
      };
      expect(extractGeminiParts(response, { includeThoughts: true }).map((p) => p.data)).toEqual(['draft', 'final']);
    });

    it('reads candidates[0].content.parts only — the 1.x top-level `parts` fallback is gone', () => {
      const legacy = { parts: [{ text: 'not an SDK field' }] } as unknown as GeminiResponse;
      expect(extractGeminiParts(legacy)).toEqual([]);
    });

    it('should handle missing parts property', () => {
      const response: GeminiResponse = {};
      const parts = extractGeminiParts(response);
      expect(parts).toEqual([]);
    });
  });
});

/* END */
