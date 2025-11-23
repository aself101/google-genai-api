/**
 * API Tests
 * Tests for GoogleGenAIAPI class and its methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleGenAIAPI, extractGeminiParts, extractImagenImages } from '../api.js';
import { MODELS } from '../config.js';

// Mock the @google/genai SDK
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: vi.fn(),
          generateImages: vi.fn()
        }
      };
    })
  };
});

describe('GoogleGenAIAPI Class', () => {
  let api;
  let mockClient;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create API instance
    api = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678');

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
      expect(() => new GoogleGenAIAPI()).toThrow('API key is required');
      expect(() => new GoogleGenAIAPI('')).toThrow('API key is required');
      expect(() => new GoogleGenAIAPI(null)).toThrow('API key is required');
    });

    it('should set default log level to info', () => {
      const defaultApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678');
      expect(defaultApi.logger).toBeDefined();
      expect(defaultApi.logger.level).toBe('info');
    });

    it('should accept custom log level', () => {
      const debugApi = new GoogleGenAIAPI('AIzaSyTest1234567890123456789012345678', 'debug');
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
      const inputImages = [
        { mimeType: 'image/png', data: 'base64data...' }
      ];
      const result = api._buildGeminiContents('Edit this image', inputImages);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'Edit this image' });
      expect(result[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'base64data...' } });
    });

    it('should handle multiple input images in parts array', () => {
      const inputImages = [
        { mimeType: 'image/png', data: 'base64data1' }
      ];
      const result = api._buildGeminiContents('Combine these', inputImages);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  describe('generateWithGemini', () => {
    it('should call SDK with correct parameters for text-to-image', async () => {
      // Mock successful response with correct structure
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }
            ]
          }
        }]
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      const result = await api.generateWithGemini({
        prompt: 'A serene mountain landscape',
        aspectRatio: '16:9'
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: MODELS.GEMINI,
        contents: 'A serene mountain landscape',
        config: { aspectRatio: '16:9' }
      });
      expect(result).toEqual(mockResponse);
    });

    it('should call SDK with parts array for image-to-image', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'base64edited' } }
            ]
          }
        }]
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      const inputImages = [
        { mimeType: 'image/jpeg', data: 'inputbase64' }
      ];

      const result = await api.generateWithGemini({
        prompt: 'Make it sunset',
        inputImages,
        aspectRatio: '1:1'
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: MODELS.GEMINI,
        contents: [
          { text: 'Make it sunset' },
          { inlineData: { mimeType: 'image/jpeg', data: 'inputbase64' } }
        ],
        config: { aspectRatio: '1:1' }
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use default aspect ratio if not provided', async () => {
      const mockResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'Test prompt'
      });

      expect(mockClient.models.generateContent).toHaveBeenCalled();
    });

    it('should throw error if API key not set', async () => {
      api.apiKey = null;

      await expect(
        api.generateWithGemini({ prompt: 'Test' })
      ).rejects.toThrow('API key not set');
    });

    it('should handle SDK errors', async () => {
      const sdkError = new Error('SDK API error');
      mockClient.models.generateContent.mockRejectedValue(sdkError);

      await expect(
        api.generateWithGemini({ prompt: 'Test' })
      ).rejects.toThrow('SDK API error');
    });

    it('should sanitize errors in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const sdkError = new Error('Internal SDK details');
      mockClient.models.generateContent.mockRejectedValue(sdkError);

      await expect(
        api.generateWithGemini({ prompt: 'Test' })
      ).rejects.toThrow('Image generation failed');

      process.env.NODE_ENV = originalEnv;
    });

    it('should detect mode automatically based on input images', async () => {
      const mockResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      // Text-to-image (no images)
      await api.generateWithGemini({ prompt: 'Test', inputImages: [] });

      // Image-to-image (one image)
      const inputImages = [{ mimeType: 'image/png', data: 'data' }];
      await api.generateWithGemini({ prompt: 'Edit', inputImages });

      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should use custom model when provided', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }
            ]
          }
        }]
      };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'A futuristic cityscape',
        aspectRatio: '16:9',
        model: MODELS.GEMINI_3_PRO
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: MODELS.GEMINI_3_PRO,
        contents: 'A futuristic cityscape',
        config: { aspectRatio: '16:9' }
      });
    });

    it('should default to GEMINI model when model not specified', async () => {
      const mockResponse = { candidates: [{ content: { parts: [] } }] };
      mockClient.models.generateContent.mockResolvedValue(mockResponse);

      await api.generateWithGemini({
        prompt: 'Test prompt',
        aspectRatio: '1:1'
      });

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: MODELS.GEMINI,
        contents: 'Test prompt',
        config: { aspectRatio: '1:1' }
      });
    });
  });

  describe('generateWithImagen', () => {
    it('should call SDK with correct parameters', async () => {
      const mockResponse = {
        generatedImages: [
          { image: { imageBytes: 'base64image1' } }
        ]
      };
      mockClient.models.generateImages.mockResolvedValue(mockResponse);

      const result = await api.generateWithImagen({
        prompt: 'Futuristic cityscape',
        numberOfImages: 1,
        aspectRatio: '16:9'
      });

      expect(mockClient.models.generateImages).toHaveBeenCalledWith({
        model: MODELS.IMAGEN,
        prompt: 'Futuristic cityscape',
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9'
        }
      });
      expect(result).toEqual(mockResponse);
    });

    it('should generate multiple images', async () => {
      const mockResponse = {
        generatedImages: [
          { image: { imageBytes: 'base64image1' } },
          { image: { imageBytes: 'base64image2' } },
          { image: { imageBytes: 'base64image3' } },
          { image: { imageBytes: 'base64image4' } }
        ]
      };
      mockClient.models.generateImages.mockResolvedValue(mockResponse);

      const result = await api.generateWithImagen({
        prompt: 'Character designs',
        numberOfImages: 4,
        aspectRatio: '1:1'
      });

      expect(mockClient.models.generateImages).toHaveBeenCalledWith({
        model: MODELS.IMAGEN,
        prompt: 'Character designs',
        config: {
          numberOfImages: 4,
          aspectRatio: '1:1'
        }
      });
      expect(result.generatedImages).toHaveLength(4);
    });

    it('should use default numberOfImages if not provided', async () => {
      const mockResponse = {
        generatedImages: [{ image: { imageBytes: 'base64' } }]
      };
      mockClient.models.generateImages.mockResolvedValue(mockResponse);

      await api.generateWithImagen({
        prompt: 'Test',
        aspectRatio: '1:1'
      });

      expect(mockClient.models.generateImages).toHaveBeenCalledWith({
        model: MODELS.IMAGEN,
        prompt: 'Test',
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1'
        }
      });
    });

    it('should throw error if API key not set', async () => {
      api.apiKey = null;

      await expect(
        api.generateWithImagen({ prompt: 'Test' })
      ).rejects.toThrow('API key not set');
    });

    it('should handle SDK errors', async () => {
      const sdkError = new Error('SDK error');
      mockClient.models.generateImages.mockRejectedValue(sdkError);

      await expect(
        api.generateWithImagen({ prompt: 'Test', numberOfImages: 2 })
      ).rejects.toThrow('SDK error');
    });

    it('should sanitize errors in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const sdkError = new Error('Internal error details');
      mockClient.models.generateImages.mockRejectedValue(sdkError);

      await expect(
        api.generateWithImagen({ prompt: 'Test' })
      ).rejects.toThrow('Image generation failed');

      process.env.NODE_ENV = originalEnv;
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
      const response = {
        parts: [
          { text: 'This is a description of the image' }
        ]
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        type: 'text',
        content: 'This is a description of the image'
      });
    });

    it('should extract image parts from Gemini response', () => {
      const response = {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64imagedata'
            }
          }
        ]
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        data: 'base64imagedata'
      });
    });

    it('should extract mixed text and image parts', () => {
      const response = {
        parts: [
          { text: 'Here is your image:' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64data'
            }
          },
          { text: 'Additional description' }
        ]
      };

      const parts = extractGeminiParts(response);

      expect(parts).toHaveLength(3);
      expect(parts[0].type).toBe('text');
      expect(parts[1].type).toBe('image');
      expect(parts[2].type).toBe('text');
    });

    it('should use default mimeType if not provided', () => {
      const response = {
        parts: [
          {
            inlineData: {
              data: 'base64data'
            }
          }
        ]
      };

      const parts = extractGeminiParts(response);

      expect(parts[0].mimeType).toBe('image/png');
    });

    it('should handle empty parts array', () => {
      const response = { parts: [] };
      const parts = extractGeminiParts(response);
      expect(parts).toEqual([]);
    });

    it('should handle missing parts property', () => {
      const response = {};
      const parts = extractGeminiParts(response);
      expect(parts).toEqual([]);
    });
  });

  describe('extractImagenImages', () => {
    it('should extract single image from Imagen response', () => {
      const response = {
        generatedImages: [
          {
            image: {
              imageBytes: 'base64imagedata1'
            }
          }
        ]
      };

      const images = extractImagenImages(response);

      expect(images).toHaveLength(1);
      expect(images[0]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        data: 'base64imagedata1'
      });
    });

    it('should extract multiple images from Imagen response', () => {
      const response = {
        generatedImages: [
          { image: { imageBytes: 'base64image1' } },
          { image: { imageBytes: 'base64image2' } },
          { image: { imageBytes: 'base64image3' } },
          { image: { imageBytes: 'base64image4' } }
        ]
      };

      const images = extractImagenImages(response);

      expect(images).toHaveLength(4);
      images.forEach((img, idx) => {
        expect(img.type).toBe('image');
        expect(img.mimeType).toBe('image/png');
        expect(img.data).toBe(`base64image${idx + 1}`);
      });
    });

    it('should handle empty generatedImages array', () => {
      const response = { generatedImages: [] };
      const images = extractImagenImages(response);
      expect(images).toEqual([]);
    });

    it('should handle missing generatedImages property', () => {
      const response = {};
      const images = extractImagenImages(response);
      expect(images).toEqual([]);
    });

    it('should always set mimeType to image/png for Imagen', () => {
      const response = {
        generatedImages: [
          { image: { imageBytes: 'data1' } },
          { image: { imageBytes: 'data2' } }
        ]
      };

      const images = extractImagenImages(response);

      images.forEach(img => {
        expect(img.mimeType).toBe('image/png');
      });
    });
  });
});

/* END */
