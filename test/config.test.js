/**
 * Configuration Tests
 * Tests for API configuration, models, and validation functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MODELS,
  ASPECT_RATIOS,
  GEMINI_MODES,
  MODEL_CONSTRAINTS,
  DEFAULT_OUTPUT_DIR,
  getGoogleGenAIApiKey,
  validateApiKeyFormat,
  redactApiKey,
  validateModelParams,
  detectGeminiMode
} from '../config.js';

describe('Configuration Constants', () => {
  describe('Models', () => {
    it('should have GEMINI model defined', () => {
      expect(MODELS.GEMINI).toBeDefined();
      expect(MODELS.GEMINI).toBe('gemini-2.5-flash-image');
    });

    it('should have IMAGEN model defined', () => {
      expect(MODELS.IMAGEN).toBeDefined();
      expect(MODELS.IMAGEN).toBe('imagen-4.0-generate-001');
    });
  });

  describe('Aspect Ratios', () => {
    it('should have valid aspect ratios', () => {
      expect(ASPECT_RATIOS).toBeDefined();
      expect(ASPECT_RATIOS).toContain('1:1');
      expect(ASPECT_RATIOS).toContain('3:4');
      expect(ASPECT_RATIOS).toContain('4:3');
      expect(ASPECT_RATIOS).toContain('9:16');
      expect(ASPECT_RATIOS).toContain('16:9');
      expect(ASPECT_RATIOS.length).toBe(5);
    });
  });

  describe('Gemini Modes', () => {
    it('should have all generation modes defined', () => {
      expect(GEMINI_MODES.TEXT_TO_IMAGE).toBe('text-to-image');
      expect(GEMINI_MODES.IMAGE_TO_IMAGE).toBe('image-to-image');
      expect(GEMINI_MODES.SEMANTIC_MASKING).toBe('semantic-masking');
    });
  });

  describe('Model Constraints', () => {
    it('should have constraints for Gemini model', () => {
      const gemini = MODEL_CONSTRAINTS[MODELS.GEMINI];
      expect(gemini).toBeDefined();
      expect(gemini.aspectRatios).toEqual(ASPECT_RATIOS);
      expect(gemini.promptMaxLength).toBe(10000);
      expect(gemini.inputImagesMax).toBe(1);
      expect(gemini.features.textToImage).toBe(true);
      expect(gemini.features.imageToImage).toBe(true);
      expect(gemini.features.semanticMasking).toBe(true);
      expect(gemini.responseFormat).toBe('parts');
    });

    it('should have constraints for Imagen model', () => {
      const imagen = MODEL_CONSTRAINTS[MODELS.IMAGEN];
      expect(imagen).toBeDefined();
      expect(imagen.aspectRatios).toEqual(ASPECT_RATIOS);
      expect(imagen.promptMaxLength).toBe(10000);
      expect(imagen.numberOfImages.min).toBe(1);
      expect(imagen.numberOfImages.max).toBe(4);
      expect(imagen.numberOfImages.default).toBe(1);
      expect(imagen.features.textToImage).toBe(true);
      expect(imagen.features.multipleImages).toBe(true);
      expect(imagen.responseFormat).toBe('generatedImages');
    });
  });

  describe('Default Output Directory', () => {
    it('should have default output directory', () => {
      expect(DEFAULT_OUTPUT_DIR).toBeDefined();
      expect(DEFAULT_OUTPUT_DIR).toBe('datasets/google');
    });
  });
});

describe('API Key Functions', () => {
  // Save original environment
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.GOOGLE_GENAI_API_KEY;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.GOOGLE_GENAI_API_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_GENAI_API_KEY;
    }
  });

  describe('getGoogleGenAIApiKey', () => {
    it('should return CLI API key if provided', () => {
      const cliKey = 'AIzaSyBx7nVz1234567890123456789012345';
      const key = getGoogleGenAIApiKey(cliKey);
      expect(key).toBe(cliKey);
    });

    it('should return environment variable if CLI key not provided', () => {
      const envKey = 'AIzaSyEnv1234567890123456789012345678';
      process.env.GOOGLE_GENAI_API_KEY = envKey;
      const key = getGoogleGenAIApiKey();
      expect(key).toBe(envKey);
    });

    it('should prioritize CLI key over environment variable', () => {
      const cliKey = 'AIzaSyCLI1234567890123456789012345678';
      const envKey = 'AIzaSyEnv1234567890123456789012345678';
      process.env.GOOGLE_GENAI_API_KEY = envKey;
      const key = getGoogleGenAIApiKey(cliKey);
      expect(key).toBe(cliKey);
    });

    it('should throw error if API key not found', () => {
      delete process.env.GOOGLE_GENAI_API_KEY;
      expect(() => getGoogleGenAIApiKey()).toThrow('GOOGLE_GENAI_API_KEY not found');
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should validate correct API key format', () => {
      const validKey = 'AIzaSyBx7nVz123456789012345678901234567'; // Exactly 39 chars
      expect(validateApiKeyFormat(validKey)).toBe(true);
    });

    it('should reject key with wrong prefix', () => {
      const invalidKey = 'xyz123456789012345678901234567890123';
      expect(validateApiKeyFormat(invalidKey)).toBe(false);
    });

    it('should reject key with wrong length', () => {
      const shortKey = 'AIzaSyShort';
      expect(validateApiKeyFormat(shortKey)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(validateApiKeyFormat(null)).toBe(false);
      expect(validateApiKeyFormat(undefined)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(validateApiKeyFormat(123)).toBe(false);
      expect(validateApiKeyFormat({})).toBe(false);
    });
  });

  describe('redactApiKey', () => {
    it('should show only last 4 characters', () => {
      const key = 'AIzaSyBx7nVz1234567890123456789012345';
      const redacted = redactApiKey(key);
      expect(redacted).toBe('xxx...2345');
    });

    it('should handle short keys', () => {
      const shortKey = 'abc';
      const redacted = redactApiKey(shortKey);
      expect(redacted).toBe('xxx...xxx');
    });

    it('should handle null or undefined', () => {
      expect(redactApiKey(null)).toBe('xxx...xxx');
      expect(redactApiKey(undefined)).toBe('xxx...xxx');
    });

    it('should handle non-string values', () => {
      expect(redactApiKey(123)).toBe('xxx...xxx');
    });
  });
});

describe('Validation Functions', () => {
  describe('validateModelParams', () => {
    describe('Common validation', () => {
      it('should throw error for unknown model', () => {
        expect(() => validateModelParams('unknown-model', { prompt: 'test' }))
          .toThrow('Unknown model');
      });

      it('should throw error if prompt is missing', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {}))
          .toThrow('Prompt is required');
      });

      it('should throw error if prompt is not a string', () => {
        expect(() => validateModelParams(MODELS.GEMINI, { prompt: 123 }))
          .toThrow('Prompt is required and must be a string');
      });

      it('should throw error if prompt exceeds max length', () => {
        const longPrompt = 'a'.repeat(10001);
        expect(() => validateModelParams(MODELS.GEMINI, { prompt: longPrompt }))
          .toThrow('Prompt exceeds maximum length');
      });

      it('should throw error for invalid aspect ratio', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {
          prompt: 'test',
          aspectRatio: '99:1'
        })).toThrow('Invalid aspect ratio');
      });

      it('should accept valid aspect ratios', () => {
        ASPECT_RATIOS.forEach(ratio => {
          expect(() => validateModelParams(MODELS.GEMINI, {
            prompt: 'test',
            aspectRatio: ratio
          })).not.toThrow();
        });
      });
    });

    describe('Gemini-specific validation', () => {
      it('should accept valid Gemini parameters', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {
          prompt: 'test',
          aspectRatio: '16:9',
          inputImages: []
        })).not.toThrow();
      });

      it('should accept one input image', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {
          prompt: 'test',
          inputImages: [{ mimeType: 'image/png', data: 'base64...' }]
        })).not.toThrow();
      });

      it('should throw error for multiple input images', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {
          prompt: 'test',
          inputImages: [
            { mimeType: 'image/png', data: 'base64...' },
            { mimeType: 'image/png', data: 'base64...' }
          ]
        })).toThrow('Gemini supports maximum 1 input image');
      });

      it('should throw error for numberOfImages > 1', () => {
        expect(() => validateModelParams(MODELS.GEMINI, {
          prompt: 'test',
          numberOfImages: 4
        })).toThrow('Gemini only generates one image per request');
      });
    });

    describe('Imagen-specific validation', () => {
      it('should accept valid Imagen parameters', () => {
        expect(() => validateModelParams(MODELS.IMAGEN, {
          prompt: 'test',
          numberOfImages: 4,
          aspectRatio: '1:1'
        })).not.toThrow();
      });

      it('should accept numberOfImages from 1 to 4', () => {
        [1, 2, 3, 4].forEach(num => {
          expect(() => validateModelParams(MODELS.IMAGEN, {
            prompt: 'test',
            numberOfImages: num
          })).not.toThrow();
        });
      });

      it('should throw error for numberOfImages < 1', () => {
        expect(() => validateModelParams(MODELS.IMAGEN, {
          prompt: 'test',
          numberOfImages: 0
        })).toThrow('numberOfImages must be between 1 and 4');
      });

      it('should throw error for numberOfImages > 4', () => {
        expect(() => validateModelParams(MODELS.IMAGEN, {
          prompt: 'test',
          numberOfImages: 5
        })).toThrow('numberOfImages must be between 1 and 4');
      });

      it('should throw error if input images provided', () => {
        expect(() => validateModelParams(MODELS.IMAGEN, {
          prompt: 'test',
          inputImages: [{ mimeType: 'image/png', data: 'base64...' }]
        })).toThrow('Imagen does not support input images');
      });
    });
  });

  describe('detectGeminiMode', () => {
    it('should detect TEXT_TO_IMAGE with no input images', () => {
      const mode = detectGeminiMode([]);
      expect(mode).toBe(GEMINI_MODES.TEXT_TO_IMAGE);
    });

    it('should detect IMAGE_TO_IMAGE with one input image', () => {
      const mode = detectGeminiMode([{ mimeType: 'image/png', data: 'base64...' }]);
      expect(mode).toBe(GEMINI_MODES.IMAGE_TO_IMAGE);
    });

    it('should throw error for multiple input images', () => {
      expect(() => detectGeminiMode([
        { mimeType: 'image/png', data: 'base64...' },
        { mimeType: 'image/png', data: 'base64...' }
      ])).toThrow('Gemini supports maximum 1 input image');
    });
  });
});

/* END */
