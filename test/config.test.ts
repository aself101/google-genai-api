/**
 * Configuration Tests
 * Tests for API configuration, models, and validation functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MODELS,
  DEFAULT_IMAGE_MODEL,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  SUPPORTED_IMAGE_MIME_TYPES,
  ValidationError,
  getModelViolations,
  isKnownImageModel,
  isKnownVeoModel,
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
  validateVeoParams,
  getVeoViolations,
} from '../src/config.js';
import type { InlineData, VeoReferenceImage, VeoPersonGeneration, VeoMode } from '../src/types/index.js';

describe('Configuration Constants', () => {
  describe('Models', () => {
    it('catalogs only current image models (spec D2)', () => {
      expect(MODELS.GEMINI_3_1_FLASH).toBe('gemini-3.1-flash-image');
      expect(MODELS.GEMINI_3_1_FLASH_LITE).toBe('gemini-3.1-flash-lite-image');
      expect(MODELS.GEMINI_3_PRO).toBe('gemini-3-pro-image');
      expect(MODELS.GEMINI_VIDEO).toBe('gemini-2.5-flash');
    });

    it('does not keep keys for models with an announced shutdown', () => {
      expect(Object.keys(MODELS).sort()).toEqual(
        ['GEMINI_3_1_FLASH', 'GEMINI_3_1_FLASH_LITE', 'GEMINI_3_PRO', 'GEMINI_VIDEO'].sort()
      );
      expect(Object.values(MODELS)).not.toContain('gemini-2.5-flash-image');
      expect(Object.values(MODELS)).not.toContain('gemini-3-pro-image-preview');
    });

    it('defaults image generation to gemini-3.1-flash-image (spec D4)', () => {
      expect(DEFAULT_IMAGE_MODEL).toBe('gemini-3.1-flash-image');
      expect(DEFAULT_IMAGE_MODEL).toBe(MODELS.GEMINI_3_1_FLASH);
    });
  });

  describe('Aspect Ratios', () => {
    it('lists the ten standard ratios plus the four 3.1 extremes', () => {
      expect(ASPECT_RATIOS).toEqual([
        '1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
        '1:4', '4:1', '1:8', '8:1',
      ]);
    });

    it('lists image sizes and supported input MIME types', () => {
      expect(IMAGE_SIZES).toEqual(['512', '1K', '2K', '4K']);
      expect(SUPPORTED_IMAGE_MIME_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
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
    const imageModels = [MODELS.GEMINI_3_1_FLASH, MODELS.GEMINI_3_1_FLASH_LITE, MODELS.GEMINI_3_PRO];

    it('has an entry for every MODELS value, and nothing else', () => {
      expect(Object.keys(MODEL_CONSTRAINTS).sort()).toEqual([...Object.values(MODELS)].sort());
    });

    it('keeps every 1.x ModelConstraint field on image models (spec D5, additive only)', () => {
      for (const m of imageModels) {
        const c = MODEL_CONSTRAINTS[m];
        expect(c.promptMaxLength).toBe(10000);
        expect(c.supportedModes).toEqual(Object.values(GEMINI_MODES));
        expect(c.features!.textToImage).toBe(true);
        expect(c.features!.imageToImage).toBe(true);
        expect(c.features!.semanticMasking).toBe(true);
        expect(c.responseFormat).toBe('parts');
        expect(c.inputImagesMax).toBe(14);
      }
    });

    it('records per-model ratios and sizes from vendor docs and live probes', () => {
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_1_FLASH].aspectRatios).toEqual(ASPECT_RATIOS);
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_1_FLASH].imageSizes).toEqual(['512', '1K', '2K', '4K']);
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_1_FLASH_LITE].aspectRatios).toEqual(ASPECT_RATIOS);
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_1_FLASH_LITE].imageSizes).toEqual(['1K']);
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_PRO].aspectRatios).toHaveLength(10);
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_PRO].aspectRatios).not.toContain('1:4');
      expect(MODEL_CONSTRAINTS[MODELS.GEMINI_3_PRO].imageSizes).toEqual(['1K', '2K', '4K']);
    });

    it('keeps the video-understanding entry unchanged', () => {
      const video = MODEL_CONSTRAINTS[MODELS.GEMINI_VIDEO];
      expect(video.features!.videoUnderstanding).toBe(true);
      expect(video.responseFormat).toBe('candidates');
      expect(video.imageSizes).toBeUndefined();
    });

    it('removed ids are gone from the string-keyed table (runtime undefined, spec §6)', () => {
      expect(MODEL_CONSTRAINTS['gemini-2.5-flash-image']).toBeUndefined();
      expect(MODEL_CONSTRAINTS['gemini-3-pro-image-preview']).toBeUndefined();
    });
  });

  describe('Model guards', () => {
    it('isKnownImageModel is true only for cataloged image models', () => {
      expect(isKnownImageModel('gemini-3.1-flash-image')).toBe(true);
      expect(isKnownImageModel('gemini-3-pro-image')).toBe(true);
      expect(isKnownImageModel('gemini-2.5-flash')).toBe(false); // video understanding, not image
      expect(isKnownImageModel('gemini-2.5-flash-image')).toBe(false); // dropped (spec D2)
      expect(isKnownImageModel('not-a-model')).toBe(false);
    });

    it('isKnownVeoModel is true only for cataloged Veo models', () => {
      expect(isKnownVeoModel(VEO_MODELS.VEO_3_1)).toBe(true);
      expect(isKnownVeoModel('veo-2.0-generate-001')).toBe(false);
      expect(isKnownVeoModel('toString')).toBe(false); // own-property check, not the prototype
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
  let originalEnv: string | undefined;

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
      expect(validateApiKeyFormat(null as unknown as string)).toBe(false);
      expect(validateApiKeyFormat(undefined as unknown as string)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(validateApiKeyFormat(123 as unknown as string)).toBe(false);
      expect(validateApiKeyFormat({} as unknown as string)).toBe(false);
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
      expect(redactApiKey(null as unknown as string)).toBe('xxx...xxx');
      expect(redactApiKey(undefined as unknown as string)).toBe('xxx...xxx');
    });

    it('should handle non-string values', () => {
      expect(redactApiKey(123 as unknown as string)).toBe('xxx...xxx');
    });
  });
});

describe('Validation Functions', () => {
  const png = (data = 'iVBORw0KGgo='): InlineData => ({ mimeType: 'image/png', data });

  describe('validateModelParams (throwing wrapper — 1.x contract)', () => {
    it('throws ValidationError, which is an Error', () => {
      let caught: unknown;
      try {
        validateModelParams(DEFAULT_IMAGE_MODEL, { prompt: 'test', aspectRatio: '7:3' });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect(caught).toBeInstanceOf(Error);
      expect((caught as ValidationError).name).toBe('ValidationError');
      expect((caught as ValidationError).violations[0].param).toBe('aspectRatio');
    });

    // One case per 1.x rule, so a failure names the rule that regressed.
    it.each([
      ['missing prompt', DEFAULT_IMAGE_MODEL, {}, 'Prompt is required'],
      ['non-string prompt', DEFAULT_IMAGE_MODEL, { prompt: 123 }, 'Prompt is required and must be a string'],
      ['prompt over the limit', DEFAULT_IMAGE_MODEL, { prompt: 'a'.repeat(10001) }, 'Prompt exceeds maximum length'],
      ['aspect ratio the model lacks', MODELS.GEMINI_3_PRO, { prompt: 'test', aspectRatio: '1:4' }, 'Invalid aspect ratio'],
      ['numberOfImages other than 1', DEFAULT_IMAGE_MODEL, { prompt: 'test', numberOfImages: 4 }, 'Gemini generates one image per request'],
    ])('keeps the 1.x message for %s', (_rule, model, params, message) => {
      expect(() => validateModelParams(model, params as never)).toThrow(message);
    });

    it('accepts every ratio a model lists', () => {
      for (const m of [MODELS.GEMINI_3_1_FLASH, MODELS.GEMINI_3_1_FLASH_LITE, MODELS.GEMINI_3_PRO]) {
        for (const ratio of MODEL_CONSTRAINTS[m].aspectRatios!) {
          expect(() => validateModelParams(m, { prompt: 'test', aspectRatio: ratio })).not.toThrow();
        }
      }
    });

    it('no longer throws for an unknown model id (spec D3); shape rules still apply', () => {
      expect(() => validateModelParams('gemini-9-imaginary', { prompt: 'test', aspectRatio: '7:3' })).not.toThrow();
      expect(() => validateModelParams('gemini-9-imaginary', { prompt: '' })).toThrow('Prompt is required');
    });
  });

  describe('getModelViolations — shape (every id)', () => {
    const cases: Array<[string, Parameters<typeof getModelViolations>[1], string]> = [
      ['missing prompt', { prompt: '' }, 'prompt'],
      ['ratio not W:H', { prompt: 'x', aspectRatio: 'wide' }, 'aspectRatio'],
      ['lowercase k', { prompt: 'x', imageSize: '2k' }, 'imageSize'],
      ['empty image data', { prompt: 'x', inputImages: [png('')] }, 'inputImages[0].data'],
      ['malformed mimeType', { prompt: 'x', inputImages: [{ mimeType: 'png', data: 'abc' }] }, 'inputImages[0].mimeType'],
    ];
    for (const model of [DEFAULT_IMAGE_MODEL, 'gemini-9-imaginary']) {
      for (const [name, params, param] of cases) {
        it(`${model}: ${name} → shape violation on ${param}`, () => {
          const v = getModelViolations(model, params);
          expect(v.map((x) => [x.kind, x.param])).toContainEqual(['shape', param]);
        });
      }
    }

    it('shape patterns are open: an unseen ratio or size passes shape', () => {
      expect(getModelViolations('gemini-9-imaginary', { prompt: 'x', aspectRatio: '3:1', imageSize: '8K' })).toEqual([]);
    });
  });

  describe('getModelViolations — capability (known ids only)', () => {
    it('rejects a ratio the model does not list', () => {
      const [v] = getModelViolations(MODELS.GEMINI_3_PRO, { prompt: 'x', aspectRatio: '8:1' });
      expect(v).toMatchObject({ kind: 'capability', param: 'aspectRatio', value: '8:1' });
      expect(v.allowed).toHaveLength(10);
    });

    it('rejects a size the model does not list (Lite: 1K only — 2K rejected live)', () => {
      const [v] = getModelViolations(MODELS.GEMINI_3_1_FLASH_LITE, { prompt: 'x', imageSize: '2K' });
      expect(v).toMatchObject({ kind: 'capability', param: 'imageSize', allowed: ['1K'] });
      expect(getModelViolations(MODELS.GEMINI_3_1_FLASH, { prompt: 'x', imageSize: '512' })).toEqual([]);
    });

    it('rejects imageSize on a model that does not take it', () => {
      const [v] = getModelViolations(MODELS.GEMINI_VIDEO, { prompt: 'x', imageSize: '1K' });
      expect(v).toMatchObject({ kind: 'capability', param: 'imageSize' });
    });

    it('allows up to 14 input images and rejects 15', () => {
      const fourteen = Array.from({ length: 14 }, () => png());
      expect(getModelViolations(DEFAULT_IMAGE_MODEL, { prompt: 'x', inputImages: fourteen })).toEqual([]);
      const [v] = getModelViolations(DEFAULT_IMAGE_MODEL, { prompt: 'x', inputImages: [...fourteen, png()] });
      expect(v).toMatchObject({ kind: 'capability', param: 'inputImages', value: 15 });
    });

    it('rejects a well-formed but unsupported input type; accepts gif (1.x set)', () => {
      const [v] = getModelViolations(DEFAULT_IMAGE_MODEL, { prompt: 'x', inputImages: [{ mimeType: 'image/tiff', data: 'abc' }] });
      expect(v).toMatchObject({ kind: 'capability', param: 'inputImages[0].mimeType' });
      expect(getModelViolations(DEFAULT_IMAGE_MODEL, { prompt: 'x', inputImages: [{ mimeType: 'image/gif', data: 'abc' }] })).toEqual([]);
    });

    it('gives an unknown id no capability violations, whatever it is passed', () => {
      const v = getModelViolations('gemini-9-imaginary', {
        prompt: 'x', aspectRatio: '8:1', imageSize: '4K', numberOfImages: 3,
        inputImages: Array.from({ length: 20 }, () => ({ mimeType: 'image/tiff', data: 'abc' })),
      });
      expect(v).toEqual([]);
    });

    it('reports a malformed value once, as shape — not again as capability', () => {
      const v = getModelViolations(DEFAULT_IMAGE_MODEL, { prompt: 'x', aspectRatio: 'wide' });
      expect(v.map((x) => x.kind)).toEqual(['shape']);
    });
  });

  describe('detectGeminiMode', () => {
    it('should detect TEXT_TO_IMAGE with no input images', () => {
      expect(detectGeminiMode([])).toBe(GEMINI_MODES.TEXT_TO_IMAGE);
    });

    it('should detect IMAGE_TO_IMAGE with one input image', () => {
      expect(detectGeminiMode([png()])).toBe(GEMINI_MODES.IMAGE_TO_IMAGE);
    });

    it('returns IMAGE_TO_IMAGE for several images — the count is a model capability, not a mode (spec §6)', () => {
      expect(detectGeminiMode([png(), png(), png()])).toBe(GEMINI_MODES.IMAGE_TO_IMAGE);
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
      VIDEO_MIME_TYPES.forEach((type) => {
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
      expect(geminiVideo.features!.videoUnderstanding).toBe(true);
    });

    it('should support video clipping', () => {
      const geminiVideo = MODEL_CONSTRAINTS['gemini-2.5-flash'];
      expect(geminiVideo.video!.supportsClipping).toBe(true);
    });

    it('should have correct file size limits', () => {
      const geminiVideo = MODEL_CONSTRAINTS['gemini-2.5-flash'];
      expect(geminiVideo.video!.maxFileSize).toBe(VIDEO_SIZE_LIMITS.MAX_FILE_SIZE);
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
      expect(() => parseTimeOffset(null as unknown as string)).toThrow('Time offset is required');
    });

    it('should throw error for undefined', () => {
      expect(() => parseTimeOffset(undefined as unknown as string)).toThrow('Time offset is required');
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
        endOffset: '60s',
      });
      expect(result).toEqual({ startSeconds: 30, endSeconds: 60 });
    });

    it('should accept various time formats', () => {
      const result = validateVideoParams({
        startOffset: '1:30',
        endOffset: '2m0s',
      });
      expect(result).toEqual({ startSeconds: 90, endSeconds: 120 });
    });
  });

  describe('Offset validation', () => {
    it('should reject endOffset <= startOffset', () => {
      expect(() =>
        validateVideoParams({
          startOffset: '60s',
          endOffset: '30s',
        })
      ).toThrow('must be greater than start offset');
    });

    it('should reject endOffset = startOffset', () => {
      expect(() =>
        validateVideoParams({
          startOffset: '60s',
          endOffset: '60s',
        })
      ).toThrow('must be greater than start offset');
    });

    it('should include offset values in error message', () => {
      expect(() =>
        validateVideoParams({
          startOffset: '60s',
          endOffset: '30s',
        })
      ).toThrow('End offset (30s = 30s) must be greater than start offset (60s = 60s)');
    });
  });

  describe('Invalid offset formats', () => {
    it('should throw error for invalid startOffset format', () => {
      expect(() => validateVideoParams({ startOffset: 'abc' })).toThrow('Invalid time offset format');
    });

    it('should throw error for invalid endOffset format', () => {
      expect(() => validateVideoParams({ endOffset: 'xyz' })).toThrow('Invalid time offset format');
    });
  });
});

// ============================================================================
// VEO VIDEO GENERATION TESTS
// ============================================================================

describe('Veo Configuration Constants', () => {
  describe('VEO_MODELS', () => {
    it('should have the Veo 3.1 models defined', () => {
      expect(VEO_MODELS.VEO_3_1).toBe('veo-3.1-generate-preview');
      expect(VEO_MODELS.VEO_3_1_FAST).toBe('veo-3.1-fast-generate-preview');
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
      expect(VEO_RESOLUTIONS).toEqual(['720p', '1080p', '4k']);
    });
  });

  describe('VEO_DURATIONS', () => {
    it('should have durations for Veo 3.1', () => {
      expect(VEO_DURATIONS[VEO_MODELS.VEO_3_1]).toEqual(['4', '6', '8']);
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
  });
});

describe('validateVeoParams', () => {
  describe('Model validation', () => {
    it('should accept valid Veo 3.1 model', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test' })).toBe(true);
    });

    it('no longer throws for an unknown model id (spec D3); shape rules still apply', () => {
      expect(validateVeoParams('veo-9-imaginary', { prompt: 'test', resolution: '8k', durationSeconds: '30' })).toBe(true);
      expect(() => validateVeoParams('veo-9-imaginary', {})).toThrow('Prompt is required');
    });

    it('throws ValidationError, returns true (1.x contract kept)', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1_LITE, { prompt: 'x' })).toBe(true);
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1_LITE, { prompt: 'x', resolution: '4k' })).toThrow(ValidationError);
    });
  });

  describe('Veo 3.1 Lite (spec §2.2; owed from P2 — the feature-gate branches have a model again)', () => {
    const ref: VeoReferenceImage[] = [{ image: { imageBytes: 'data', mimeType: 'image/png' }, referenceType: 'asset' }];

    it('is cataloged with 720p/1080p, no refs, no extension, interpolation yes', () => {
      const c = VEO_MODEL_CONSTRAINTS[VEO_MODELS.VEO_3_1_LITE];
      expect(VEO_MODELS.VEO_3_1_LITE).toBe('veo-3.1-lite-generate-preview');
      expect(c.resolutions).toEqual(['720p', '1080p']);
      expect(c.features).toMatchObject({ referenceImages: false, extension: false, interpolation: true, nativeAudio: true });
      expect(c.referenceImages).toBeNull();
      expect(c.extension).toBeNull();
      expect(c.durationRequired).toEqual({ '1080p': '8' });
    });

    it('rejects reference-images mode (was: Veo 2/3)', () => {
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1_LITE, { prompt: 'x', referenceImages: ref }, VEO_MODES.REFERENCE_IMAGES as VeoMode)
      ).toThrow('reference-images mode is not supported by veo-3.1-lite-generate-preview');
    });

    it('rejects extension mode (was: Veo 2/3)', () => {
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1_LITE, { prompt: 'x', video: {} }, VEO_MODES.EXTENSION as VeoMode)
      ).toThrow('extension mode is not supported');
    });

    it('rejects an unsupported resolution — 4k (was: 1080p on Veo 2)', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1_LITE, { prompt: 'x', resolution: '4k' })).toThrow(
        "Invalid resolution '4k' for veo-3.1-lite-generate-preview"
      );
    });

    it('accepts interpolation', () => {
      expect(
        validateVeoParams(
          VEO_MODELS.VEO_3_1_LITE,
          { firstFrame: { imageBytes: 'a', mimeType: 'image/png' }, lastFrame: { imageBytes: 'b', mimeType: 'image/png' } },
          VEO_MODES.INTERPOLATION as VeoMode
        )
      ).toBe(true);
    });
  });

  describe('4k and durationRequired', () => {
    it('3.1 and Fast accept 4k at 8s and reject it at 4s', () => {
      for (const m of [VEO_MODELS.VEO_3_1, VEO_MODELS.VEO_3_1_FAST]) {
        expect(validateVeoParams(m, { prompt: 'x', resolution: '4k', durationSeconds: '8' })).toBe(true);
        expect(() => validateVeoParams(m, { prompt: 'x', resolution: '4k', durationSeconds: '4' })).toThrow(
          '4k resolution requires 8-second duration'
        );
      }
    });

    it('keeps the deprecated resolution1080p populated alongside durationRequired', () => {
      for (const m of Object.values(VEO_MODELS)) {
        expect(VEO_MODEL_CONSTRAINTS[m].resolution1080p).toEqual({ requiresDuration: '8', aspectRatio: null });
        expect(VEO_MODEL_CONSTRAINTS[m].durationRequired!['1080p']).toBe('8');
      }
    });
  });

  describe('getVeoViolations — shape vs capability', () => {
    it('seed is a shape violation, for every id (spec D15)', () => {
      for (const m of [VEO_MODELS.VEO_3_1, 'veo-9-imaginary']) {
        expect(getVeoViolations(m, { prompt: 'x', seed: 42 }).map((v) => [v.kind, v.param])).toContainEqual(['shape', 'seed']);
      }
    });

    it('malformed values are shape; well-formed but unlisted values are capability', () => {
      expect(getVeoViolations(VEO_MODELS.VEO_3_1, { prompt: 'x', resolution: '4K' })).toMatchObject([{ kind: 'shape', param: 'resolution' }]);
      expect(getVeoViolations(VEO_MODELS.VEO_3_1, { prompt: 'x', resolution: '8k' })).toMatchObject([{ kind: 'capability', param: 'resolution' }]);
      expect(getVeoViolations(VEO_MODELS.VEO_3_1, { prompt: 'x', personGeneration: 'Allow All' })).toMatchObject([{ kind: 'shape' }]);
      expect(getVeoViolations(VEO_MODELS.VEO_3_1, { prompt: 'x', personGeneration: 'allow_robots' })).toMatchObject([{ kind: 'capability' }]);
    });

    it('an unknown id gets no capability violations — a future 8k or new personGeneration value reaches the vendor', () => {
      expect(
        getVeoViolations('veo-9-imaginary', { prompt: 'x', resolution: '8k', durationSeconds: '30', aspectRatio: '1:1', personGeneration: 'allow_robots' })
      ).toEqual([]);
    });
  });

  describe('Prompt validation', () => {
    it('should require prompt for text-to-video', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, {})).toThrow('Prompt is required');
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
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', aspectRatio: '4:3' })).toThrow(
        'Invalid aspect ratio'
      );
    });
  });

  describe('Resolution validation', () => {
    it('should accept valid resolutions', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '720p' })).toBe(true);
      expect(
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '1080p', durationSeconds: '8' })
      ).toBe(true);
    });

    it('should reject invalid resolution', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '4K' })).toThrow(
        'Invalid resolution'
      );
    });
  });

  describe('Duration validation', () => {
    it('should accept valid durations for Veo 3.1', () => {
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '4' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '6' })).toBe(true);
      expect(validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '8' })).toBe(true);
    });

    it('should reject invalid duration', () => {
      expect(() => validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', durationSeconds: '10' })).toThrow(
        'Invalid duration'
      );
    });
  });

  describe('1080p constraints', () => {
    it('should require 8s duration for 1080p on Veo 3.1', () => {
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', resolution: '1080p', durationSeconds: '4' })
      ).toThrow('1080p resolution requires 8-second duration');
    });
  });

  describe('Reference images validation', () => {
    it('should reject more than 3 reference images', () => {
      const refs: VeoReferenceImage[] = [
        { image: { imageBytes: '', mimeType: '' }, referenceType: 'asset' },
        { image: { imageBytes: '', mimeType: '' }, referenceType: 'asset' },
        { image: { imageBytes: '', mimeType: '' }, referenceType: 'asset' },
        { image: { imageBytes: '', mimeType: '' }, referenceType: 'asset' },
      ];
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', referenceImages: refs }, VEO_MODES.REFERENCE_IMAGES as VeoMode)
      ).toThrow('Maximum 3 reference images');
    });

    it('should reject empty reference images array', () => {
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', referenceImages: [] }, VEO_MODES.REFERENCE_IMAGES as VeoMode)
      ).toThrow('At least one reference image');
    });
  });

  describe('Person generation validation', () => {
    it('should accept valid person generation values', () => {
      expect(
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'allow_all' as VeoPersonGeneration })
      ).toBe(true);
      expect(
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'allow_adult' as VeoPersonGeneration })
      ).toBe(true);
      expect(
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'dont_allow' as VeoPersonGeneration })
      ).toBe(true);
    });

    it('should reject invalid person generation value', () => {
      expect(() =>
        validateVeoParams(VEO_MODELS.VEO_3_1, { prompt: 'test', personGeneration: 'invalid' as VeoPersonGeneration })
      ).toThrow('Invalid personGeneration value');
    });
  });
});

/* END */
