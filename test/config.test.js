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
  VIDEO_MIME_TYPES,
  VIDEO_SIZE_LIMITS,
  VIDEO_TIMEOUTS,
  VEO_MODELS,
  VEO_ASPECT_RATIOS,
  VEO_RESOLUTIONS,
  VEO_DURATIONS,
  VEO_PERSON_GENERATION,
  VEO_TIMEOUTS,
  VEO_MODES,
  VEO_MODEL_CONSTRAINTS,
  getGoogleGenAIApiKey,
  validateApiKeyFormat,
  redactApiKey,
  validateModelParams,
  detectGeminiMode,
  parseTimeOffset,
  validateVideoParams,
  validateVeoParams
} from '../config.js';

describe('Configuration Constants', () => {
  describe('Models', () => {
    it('should have GEMINI model defined', () => {
      expect(MODELS.GEMINI).toBeDefined();
      expect(MODELS.GEMINI).toBe('gemini-2.5-flash-image');
    });

    it('should have GEMINI_3_PRO model defined', () => {
      expect(MODELS.GEMINI_3_PRO).toBeDefined();
      expect(MODELS.GEMINI_3_PRO).toBe('gemini-3-pro-image-preview');
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

    it('should have constraints for Gemini 3 Pro model', () => {
      const gemini3Pro = MODEL_CONSTRAINTS[MODELS.GEMINI_3_PRO];
      expect(gemini3Pro).toBeDefined();
      expect(gemini3Pro.aspectRatios).toEqual(ASPECT_RATIOS);
      expect(gemini3Pro.promptMaxLength).toBe(10000);
      expect(gemini3Pro.inputImagesMax).toBe(1);
      expect(gemini3Pro.features.textToImage).toBe(true);
      expect(gemini3Pro.features.imageToImage).toBe(true);
      expect(gemini3Pro.features.semanticMasking).toBe(true);
      expect(gemini3Pro.responseFormat).toBe('parts');
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

// ============================================================================
// VIDEO CONFIGURATION TESTS
// ============================================================================

describe('Video Configuration Constants', () => {
  describe('VIDEO_MIME_TYPES', () => {
    it('should contain common video MIME types', () => {
      expect(VIDEO_MIME_TYPES).toContain('video/mp4');
      expect(VIDEO_MIME_TYPES).toContain('video/webm');
      expect(VIDEO_MIME_TYPES).toContain('video/avi');
      expect(VIDEO_MIME_TYPES).toContain('video/mov');
      expect(VIDEO_MIME_TYPES).toContain('video/mpeg');
    });

    it('should be an array of strings', () => {
      expect(Array.isArray(VIDEO_MIME_TYPES)).toBe(true);
      VIDEO_MIME_TYPES.forEach(type => {
        expect(typeof type).toBe('string');
        expect(type.startsWith('video/')).toBe(true);
      });
    });
  });

  describe('VIDEO_SIZE_LIMITS', () => {
    it('should have MAX_FILE_SIZE of 200MB', () => {
      expect(VIDEO_SIZE_LIMITS.MAX_FILE_SIZE).toBe(200 * 1024 * 1024);
    });

    it('should have RECOMMENDED_MAX of 20MB', () => {
      expect(VIDEO_SIZE_LIMITS.RECOMMENDED_MAX).toBe(20 * 1024 * 1024);
    });

    it('should have INLINE_MAX of 20MB', () => {
      expect(VIDEO_SIZE_LIMITS.INLINE_MAX).toBe(20 * 1024 * 1024);
    });
  });

  describe('VIDEO_TIMEOUTS', () => {
    it('should have UPLOAD timeout of 10 minutes', () => {
      expect(VIDEO_TIMEOUTS.UPLOAD).toBe(600000);
    });

    it('should have PROCESSING timeout of 20 minutes', () => {
      expect(VIDEO_TIMEOUTS.PROCESSING).toBe(1200000);
    });

    it('should have POLL_INTERVAL_START of 10 seconds', () => {
      expect(VIDEO_TIMEOUTS.POLL_INTERVAL_START).toBe(10000);
    });

    it('should have POLL_INTERVAL_MAX of 30 seconds', () => {
      expect(VIDEO_TIMEOUTS.POLL_INTERVAL_MAX).toBe(30000);
    });

    it('should have POLL_MAX_ATTEMPTS of 120', () => {
      expect(VIDEO_TIMEOUTS.POLL_MAX_ATTEMPTS).toBe(120);
    });
  });

  describe('Model Constraints for Gemini Video', () => {
    it('should have gemini-2.5-flash model constraints', () => {
      const geminiVideo = MODEL_CONSTRAINTS['gemini-2.5-flash'];
      expect(geminiVideo).toBeDefined();
      expect(geminiVideo.video).toBeDefined();
      expect(geminiVideo.features.videoUnderstanding).toBe(true);
    });

    it('should support video clipping', () => {
      const geminiVideo = MODEL_CONSTRAINTS['gemini-2.5-flash'];
      expect(geminiVideo.video.supportsClipping).toBe(true);
    });

    it('should have correct file size limits', () => {
      const geminiVideo = MODEL_CONSTRAINTS['gemini-2.5-flash'];
      expect(geminiVideo.video.maxFileSize).toBe(VIDEO_SIZE_LIMITS.MAX_FILE_SIZE);
    });
  });
});

describe('parseTimeOffset', () => {
  describe('Seconds format', () => {
    it('should parse "90s" → 90', () => {
      expect(parseTimeOffset('90s')).toBe(90);
    });

    it('should parse "90" → 90 (without s suffix)', () => {
      expect(parseTimeOffset('90')).toBe(90);
    });

    it('should parse "0s" → 0', () => {
      expect(parseTimeOffset('0s')).toBe(0);
    });

    it('should parse "0" → 0', () => {
      expect(parseTimeOffset('0')).toBe(0);
    });

    it('should parse large values "3600s" → 3600', () => {
      expect(parseTimeOffset('3600s')).toBe(3600);
    });
  });

  describe('Minutes+seconds format', () => {
    it('should parse "1m30s" → 90', () => {
      expect(parseTimeOffset('1m30s')).toBe(90);
    });

    it('should parse "2m0s" → 120', () => {
      expect(parseTimeOffset('2m0s')).toBe(120);
    });

    it('should parse "0m45s" → 45', () => {
      expect(parseTimeOffset('0m45s')).toBe(45);
    });

    it('should parse "10m30s" → 630', () => {
      expect(parseTimeOffset('10m30s')).toBe(630);
    });

    it('should throw error for seconds >= 60 in XmYs format', () => {
      expect(() => parseTimeOffset('1m60s')).toThrow('Seconds must be less than 60');
    });
  });

  describe('Colon format (MM:SS)', () => {
    it('should parse "1:30" → 90', () => {
      expect(parseTimeOffset('1:30')).toBe(90);
    });

    it('should parse "01:30" → 90 (with leading zero)', () => {
      expect(parseTimeOffset('01:30')).toBe(90);
    });

    it('should parse "0:45" → 45', () => {
      expect(parseTimeOffset('0:45')).toBe(45);
    });

    it('should parse "10:00" → 600', () => {
      expect(parseTimeOffset('10:00')).toBe(600);
    });

    it('should throw error for seconds >= 60 in MM:SS format', () => {
      expect(() => parseTimeOffset('1:60')).toThrow('seconds must be less than 60');
    });
  });

  describe('Colon format (HH:MM:SS)', () => {
    it('should parse "1:15:30" → 4530', () => {
      expect(parseTimeOffset('1:15:30')).toBe(4530);
    });

    it('should parse "01:15:30" → 4530 (with leading zero)', () => {
      expect(parseTimeOffset('01:15:30')).toBe(4530);
    });

    it('should parse "0:30:00" → 1800', () => {
      expect(parseTimeOffset('0:30:00')).toBe(1800);
    });

    it('should parse "2:00:00" → 7200', () => {
      expect(parseTimeOffset('2:00:00')).toBe(7200);
    });

    it('should throw error for minutes >= 60 in HH:MM:SS format', () => {
      expect(() => parseTimeOffset('1:60:00')).toThrow('minutes and seconds must be less than 60');
    });

    it('should throw error for seconds >= 60 in HH:MM:SS format', () => {
      expect(() => parseTimeOffset('1:15:60')).toThrow('minutes and seconds must be less than 60');
    });
  });

  describe('Error handling', () => {
    it('should throw error for null', () => {
      expect(() => parseTimeOffset(null)).toThrow('Time offset is required');
    });

    it('should throw error for undefined', () => {
      expect(() => parseTimeOffset(undefined)).toThrow('Time offset is required');
    });

    it('should throw error for empty string', () => {
      expect(() => parseTimeOffset('')).toThrow('Time offset cannot be empty');
    });

    it('should throw error for whitespace only', () => {
      expect(() => parseTimeOffset('   ')).toThrow('Time offset cannot be empty');
    });

    it('should throw error for invalid format "abc"', () => {
      expect(() => parseTimeOffset('abc')).toThrow('Invalid time offset format');
    });

    it('should throw error for invalid format "1:2:3:4"', () => {
      expect(() => parseTimeOffset('1:2:3:4')).toThrow('Invalid time offset format');
    });

    it('should throw error for invalid format "-30s"', () => {
      expect(() => parseTimeOffset('-30s')).toThrow('Invalid time offset format');
    });
  });
});

describe('validateVideoParams', () => {
  describe('Valid parameters', () => {
    it('should accept empty params', () => {
      const result = validateVideoParams({});
      expect(result).toEqual({});
    });

    it('should accept valid startOffset', () => {
      const result = validateVideoParams({ startOffset: '30s' });
      expect(result).toEqual({ startSeconds: 30 });
    });

    it('should accept valid endOffset', () => {
      const result = validateVideoParams({ endOffset: '60s' });
      expect(result).toEqual({ endSeconds: 60 });
    });

    it('should accept valid start and end offsets', () => {
      const result = validateVideoParams({
        startOffset: '30s',
        endOffset: '60s'
      });
      expect(result).toEqual({ startSeconds: 30, endSeconds: 60 });
    });

    it('should accept various time formats', () => {
      const result = validateVideoParams({
        startOffset: '1:30',
        endOffset: '2m0s'
      });
      expect(result).toEqual({ startSeconds: 90, endSeconds: 120 });
    });
  });

  describe('Offset validation', () => {
    it('should reject endOffset <= startOffset', () => {
      expect(() => validateVideoParams({
        startOffset: '60s',
        endOffset: '30s'
      })).toThrow('must be greater than start offset');
    });

    it('should reject endOffset = startOffset', () => {
      expect(() => validateVideoParams({
        startOffset: '60s',
        endOffset: '60s'
      })).toThrow('must be greater than start offset');
    });

    it('should include offset values in error message', () => {
      expect(() => validateVideoParams({
        startOffset: '60s',
        endOffset: '30s'
      })).toThrow('End offset (30s = 30s) must be greater than start offset (60s = 60s)');
    });
  });

  describe('Invalid offset formats', () => {
    it('should throw error for invalid startOffset format', () => {
      expect(() => validateVideoParams({ startOffset: 'abc' }))
        .toThrow('Invalid time offset format');
    });

    it('should throw error for invalid endOffset format', () => {
      expect(() => validateVideoParams({ endOffset: 'xyz' }))
        .toThrow('Invalid time offset format');
    });
  });
});

// ============================================================================
// VEO VIDEO GENERATION TESTS
// ============================================================================

describe('Veo Configuration Constants', () => {
  describe('VEO_MODELS', () => {
    it('should have all 5 Veo models defined', () => {
      expect(VEO_MODELS.VEO_3_1).toBe('veo-3.1-generate-preview');
      expect(VEO_MODELS.VEO_3_1_FAST).toBe('veo-3.1-fast-generate-preview');
      expect(VEO_MODELS.VEO_3).toBe('veo-3.0-generate-001');
      expect(VEO_MODELS.VEO_3_FAST).toBe('veo-3.0-fast-generate-001');
      expect(VEO_MODELS.VEO_2).toBe('veo-2.0-generate-001');
    });
  });

  describe('VEO_ASPECT_RATIOS', () => {
    it('should have supported aspect ratios', () => {
      expect(VEO_ASPECT_RATIOS).toContain('16:9');
      expect(VEO_ASPECT_RATIOS).toContain('9:16');
      expect(VEO_ASPECT_RATIOS.length).toBe(2);
    });
  });

  describe('VEO_RESOLUTIONS', () => {
    it('should have supported resolutions', () => {
      expect(VEO_RESOLUTIONS).toContain('720p');
      expect(VEO_RESOLUTIONS).toContain('1080p');
      expect(VEO_RESOLUTIONS.length).toBe(2);
    });
  });

  describe('VEO_DURATIONS', () => {
    it('should have durations for Veo 3.1', () => {
      expect(VEO_DURATIONS[VEO_MODELS.VEO_3_1]).toEqual(['4', '6', '8']);
    });

    it('should have durations for Veo 2', () => {
      expect(VEO_DURATIONS[VEO_MODELS.VEO_2]).toEqual(['5', '6', '8']);
    });
  });

  describe('VEO_PERSON_GENERATION', () => {
    it('should have all person generation options', () => {
      expect(VEO_PERSON_GENERATION.ALLOW_ALL).toBe('allow_all');
      expect(VEO_PERSON_GENERATION.ALLOW_ADULT).toBe('allow_adult');
      expect(VEO_PERSON_GENERATION.DONT_ALLOW).toBe('dont_allow');
    });
  });

  describe('VEO_TIMEOUTS', () => {
    it('should have correct timeout values', () => {
      expect(VEO_TIMEOUTS.MIN_LATENCY).toBe(11000);
      expect(VEO_TIMEOUTS.MAX_LATENCY).toBe(360000);
      expect(VEO_TIMEOUTS.POLL_INTERVAL).toBe(10000);
      expect(VEO_TIMEOUTS.POLL_MAX_ATTEMPTS).toBe(60);
      expect(VEO_TIMEOUTS.VIDEO_RETENTION_HOURS).toBe(48);
    });
  });

  describe('VEO_MODES', () => {
    it('should have all generation modes', () => {
      expect(VEO_MODES.TEXT_TO_VIDEO).toBe('text-to-video');
      expect(VEO_MODES.IMAGE_TO_VIDEO).toBe('image-to-video');
      expect(VEO_MODES.REFERENCE_IMAGES).toBe('reference-images');
      expect(VEO_MODES.INTERPOLATION).toBe('interpolation');
      expect(VEO_MODES.EXTENSION).toBe('extension');
    });
  });

  describe('VEO_MODEL_CONSTRAINTS', () => {
    it('should have constraints for all models', () => {
      expect(VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3_1]).toBeDefined();
      expect(VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3_1_FAST]).toBeDefined();
      expect(VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3]).toBeDefined();
      expect(VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3_FAST]).toBeDefined();
      expect(VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_2]).toBeDefined();
    });

    it('should have Veo 3.1 support all features', () => {
      const constraints = VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3_1];
      expect(constraints.features.textToVideo).toBe(true);
      expect(constraints.features.imageToVideo).toBe(true);
      expect(constraints.features.referenceImages).toBe(true);
      expect(constraints.features.interpolation).toBe(true);
      expect(constraints.features.extension).toBe(true);
      expect(constraints.features.nativeAudio).toBe(true);
    });

    it('should have Veo 3 not support advanced features', () => {
      const constraints = VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3];
      expect(constraints.features.referenceImages).toBe(false);
      expect(constraints.features.interpolation).toBe(false);
      expect(constraints.features.extension).toBe(false);
    });

    it('should have Veo 2 support only 720p', () => {
      const constraints = VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_2];
      expect(constraints.resolutions).toEqual(['720p']);
      expect(constraints.features.nativeAudio).toBe(false);
    });
  });
});

describe('validateVeoParams', () => {
  describe('Model validation', () => {
    it('should accept valid Veo 3.1 model', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test' })).toBe(true);
    });

    it('should throw for unknown model', () => {
      expect(() => validateVeoParams('unknown-model', { prompt: 'test' }))
        .toThrow('Unknown Veo model');
    });
  });

  describe('Prompt validation', () => {
    it('should require prompt for text-to-video', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, {}))
        .toThrow('Prompt is required');
    });

    it('should accept valid prompt', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'A cat playing' })).toBe(true);
    });
  });

  describe('Aspect ratio validation', () => {
    it('should accept valid aspect ratios', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', aspectRatio: '16:9' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', aspectRatio: '9:16' })).toBe(true);
    });

    it('should reject invalid aspect ratio', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', aspectRatio: '4:3' }))
        .toThrow('Invalid aspect ratio');
    });
  });

  describe('Resolution validation', () => {
    it('should accept valid resolutions', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '720p' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '1080p', durationSeconds: '8' })).toBe(true);
    });

    it('should reject invalid resolution', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '4K' }))
        .toThrow('Invalid resolution');
    });

    it('should reject 1080p for Veo 2', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_2, { prompt: 'test', resolution: '1080p' }))
        .toThrow('Invalid resolution');
    });
  });

  describe('Duration validation', () => {
    it('should accept valid durations for Veo 3.1', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '4' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '6' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '8' })).toBe(true);
    });

    it('should accept valid durations for Veo 2', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_2, { prompt: 'test', durationSeconds: '5' })).toBe(true);
    });

    it('should reject invalid duration', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '10' }))
        .toThrow('Invalid duration');
    });
  });

  describe('1080p constraints', () => {
    it('should require 8s duration for 1080p on Veo 3.1', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '1080p', durationSeconds: '4' }))
        .toThrow('1080p resolution requires 8-second duration');
    });

    it('should require 16:9 for 1080p on Veo 3', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3, { prompt: 'test', resolution: '1080p', durationSeconds: '8', aspectRatio: '9:16' }))
        .toThrow('1080p resolution requires 16:9 aspect ratio');
    });
  });

  describe('Mode-specific validation', () => {
    it('should reject reference images for Veo 2', () => {
      const refs = [{ image: { imageBytes: 'data', mimeType: 'image/png' }, referenceType: 'asset' }];
      expect(() => validateVeoParams(VEO_MODELS.VEO_2, { prompt: 'test', referenceImages: refs }, VEO_MODES.REFERENCE_IMAGES))
        .toThrow('reference-images mode is not supported');
    });

    it('should reject interpolation for Veo 3', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3, { prompt: 'test', firstFrame: {}, lastFrame: {} }, VEO_MODES.INTERPOLATION))
        .toThrow('interpolation mode is not supported');
    });

    it('should reject extension for Veo 2', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_2, { prompt: 'test', video: {} }, VEO_MODES.EXTENSION))
        .toThrow('extension mode is not supported');
    });
  });

  describe('Reference images validation', () => {
    it('should reject more than 3 reference images', () => {
      const refs = [
        { image: {}, referenceType: 'asset' },
        { image: {}, referenceType: 'asset' },
        { image: {}, referenceType: 'asset' },
        { image: {}, referenceType: 'asset' }
      ];
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', referenceImages: refs }, VEO_MODES.REFERENCE_IMAGES))
        .toThrow('Maximum 3 reference images');
    });

    it('should reject empty reference images array', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', referenceImages: [] }, VEO_MODES.REFERENCE_IMAGES))
        .toThrow('At least one reference image');
    });
  });

  describe('Person generation validation', () => {
    it('should accept valid person generation values', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'allow_all' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'allow_adult' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'dont_allow' })).toBe(true);
    });

    it('should reject invalid person generation value', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'invalid' }))
        .toThrow('Invalid personGeneration value');
    });
  });
});

/* END */
