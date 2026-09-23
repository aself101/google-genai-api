/**
 * Wire tests (spec D12).
 *
 * Every other test file mocks `@google/genai`, so it can only check what this
 * package hands a fake. That is how 1.x shipped an `aspectRatio` the SDK
 * silently dropped (spec §1.4). Here the REAL SDK serializes the request and a
 * stubbed `fetch` captures what would go on the wire; the assertions are on the
 * parsed request body.
 *
 * The seam: the SDK resolves the global `fetch` per call (1.30 and 2.24; spec
 * §1.5) and does not retry without `retryOptions`, so each call is exactly one
 * fetch — asserted, so a retry wrapper can never let a check pass on the wrong
 * request.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleGenAIAPI } from '../src/api.js';
import { GoogleGenAIVeoAPI } from '../src/veo-api.js';
import { DEFAULT_IMAGE_MODEL, MODELS, VEO_MODELS } from '../src/config.js';

interface Captured {
  url: URL;
  method: string;
  body: Record<string, any>;
}

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const IMAGE_OK = {
  candidates: [
    { content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }, finishReason: 'STOP' },
  ],
};

let calls: Captured[];
let nextResponse: () => Response;

function respondJson(status: number, body: unknown): () => Response {
  return () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  calls = [];
  nextResponse = respondJson(200, IMAGE_OK);
  vi.stubGlobal('fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: new URL(String(input)),
      method: String(init.method),
      body: init.body ? JSON.parse(String(init.body)) : {},
    });
    return nextResponse();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function api(options?: ConstructorParameters<typeof GoogleGenAIAPI>[2]): GoogleGenAIAPI {
  return new GoogleGenAIAPI('test-key', 'error', options);
}

function only(): Captured {
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe('image request on the wire', () => {
  it('model id goes in the URL: …/models/{model}:generateContent', async () => {
    await api().generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_PRO });
    const { url, method } = only();
    expect(method).toBe('POST');
    expect(url.host).toBe(GEMINI_HOST);
    expect(url.pathname).toBe('/v1beta/models/gemini-3-pro-image:generateContent');
  });

  it('default model is gemini-3.1-flash-image', async () => {
    await api().generateWithGemini({ prompt: 'x' });
    expect(only().url.pathname).toBe(`/v1beta/models/${DEFAULT_IMAGE_MODEL}:generateContent`);
  });

  it('prompt → contents[0].parts[0].text', async () => {
    await api().generateWithGemini({ prompt: 'a red apple' });
    const { body } = only();
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'a red apple' }] }]);
  });

  it('inputImages → contents[0].parts[1..].inlineData, order preserved', async () => {
    await api().generateWithGemini({
      prompt: 'combine',
      inputImages: [
        { mimeType: 'image/png', data: 'AAA1' },
        { mimeType: 'image/jpeg', data: 'AAA2' },
        { mimeType: 'image/webp', data: 'AAA3' },
      ],
    });
    const parts = only().body.contents[0].parts;
    expect(parts[0]).toEqual({ text: 'combine' });
    expect(parts.slice(1)).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'AAA1' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'AAA2' } },
      { inlineData: { mimeType: 'image/webp', data: 'AAA3' } },
    ]);
  });

  it('aspectRatio → generationConfig.imageConfig.aspectRatio (the §1.4 fix)', async () => {
    await api().generateWithGemini({ prompt: 'x', aspectRatio: '9:16' });
    const { body } = only();
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '9:16' });
    expect(body.generationConfig).not.toHaveProperty('aspectRatio');
  });

  it('imageSize → generationConfig.imageConfig.imageSize', async () => {
    await api().generateWithGemini({ prompt: 'x', imageSize: '2K' });
    expect(only().body.generationConfig.imageConfig).toEqual({ imageSize: '2K' });
  });

  it('neither passed → no imageConfig at all (model-chosen framing and size, as 1.x delivered)', async () => {
    await api().generateWithGemini({ prompt: 'x' });
    expect(only().body.generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'] });
  });

  it('responseModalities is always ["TEXT","IMAGE"]', async () => {
    await api().generateWithGemini({ prompt: 'x', aspectRatio: '1:1', imageSize: '1K' });
    expect(only().body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });

  it('unknown model id: same body shape, every caller param sent (spec D3)', async () => {
    const images = Array.from({ length: 20 }, (_, i) => ({ mimeType: 'image/png', data: `IMG${i}` }));
    await api().generateWithGemini({
      prompt: 'x',
      model: 'gemini-9-imaginary',
      aspectRatio: '3:1',
      imageSize: '8K',
      inputImages: images,
    });
    const { url, body } = only();
    expect(url.pathname).toBe('/v1beta/models/gemini-9-imaginary:generateContent');
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '3:1', imageSize: '8K' });
    expect(body.contents[0].parts).toHaveLength(21);
  });

  it('a rejected parameter never reaches the network', async () => {
    await expect(api().generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_1_FLASH_LITE, imageSize: '2K' })).rejects.toThrow(
      "Invalid imageSize '2K'"
    );
    expect(calls).toHaveLength(0);
  });

  it('Vertex environment variables do not reroute the request (vertexai: false, spec D5)', async () => {
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true');
    vi.stubEnv('GOOGLE_GENAI_USE_ENTERPRISE', 'true');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'some-project');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1');
    await api().generateWithGemini({ prompt: 'x' });
    expect(only().url.host).toBe(GEMINI_HOST);
  });
});

describe('image errors from the wire (spec D13)', () => {
  const vendor400 = {
    error: {
      code: 400,
      message: 'Image size 2K is not supported for this model',
      status: 'INVALID_ARGUMENT',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', metadata: { consumer: 'projects/123456789' } }],
    },
  };
  const vendor403 = {
    error: { code: 403, message: 'Your API key was reported as leaked.', status: 'PERMISSION_DENIED', details: [{ metadata: { consumer: 'projects/123456789' } }] },
  };
  const vendor429 = {
    error: { code: 429, message: 'Quota exceeded for metric generate_content_requests', status: 'RESOURCE_EXHAUSTED', details: [{ quotaId: 'GenerateRequestsPerMinute' }] },
  };
  const html400 = () =>
    new Response('<html><body>Bad Request — upstream proxy</body></html>', { status: 400, statusText: 'BAD_REQUEST', headers: { 'content-type': 'text/html' } });

  async function failure(): Promise<Error & Record<string, unknown>> {
    try {
      await api().generateWithGemini({ prompt: 'x', model: 'gemini-9-imaginary' });
    } catch (e) {
      expect(calls).toHaveLength(1); // no retry
      return e as Error & Record<string, unknown>;
    }
    throw new Error('expected a failure');
  }

  describe('outside production: the original SDK error, with fields added', () => {
    it('keeps the SDK error identity and message; adds status/classification/surface', async () => {
      nextResponse = respondJson(400, vendor400);
      const err = await failure();
      expect(err.name).toBe('ApiError');
      expect(err.message).toContain('Image size 2K is not supported');
      expect(err.status).toBe(400);
      expect(err.classification).toBe('USER_ACTIONABLE');
      expect(err.surface).toBe('image');
      expect(err).not.toHaveProperty('cause');
    });
  });

  describe('in production', () => {
    beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

    it('400 with a Gemini error body → the vendor message, never details[]', async () => {
      nextResponse = respondJson(400, vendor400);
      const err = await failure();
      expect(err.message).toBe('Image generation failed (HTTP 400): Image size 2K is not supported for this model');
      expect(err.message).not.toContain('projects/');
      expect(err.status).toBe(400);
      expect(err.classification).toBe('USER_ACTIONABLE');
      expect(err.cause).toBeUndefined();
    });

    it('400 with an HTML body (reason phrase BAD_REQUEST) → no body text at all', async () => {
      nextResponse = html400;
      const err = await failure();
      expect(err.message).toBe('Image generation failed (HTTP 400): the request was rejected. Please check your inputs.');
      expect(err.message).not.toContain('html');
      expect(err.message).not.toContain('proxy');
    });

    it('403 → auth sentence, no vendor text, no project metadata', async () => {
      nextResponse = respondJson(403, vendor403);
      const err = await failure();
      expect(err.message).toBe('Image generation failed: authentication or permission failure (HTTP 403).');
      expect(err.classification).toBe('AUTH');
    });

    it('429 → transient sentence, no quota metadata', async () => {
      nextResponse = respondJson(429, vendor429);
      const err = await failure();
      expect(err.message).toBe('Image generation failed: a temporary error occurred (HTTP 429). Please try again.');
      expect(err.message).not.toContain('Quota');
      expect(err.classification).toBe('TRANSIENT');
    });
  });
});

describe('Veo polling through the real SDK', () => {
  const NAME = 'models/veo-3.1-generate-preview/operations/op42';
  const DONE = {
    name: NAME,
    done: true,
    response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://example.test/v.mp4' } }] } },
  };

  it('waitForCompletion accepts a plain { name, done: false } (e.g. rebuilt from a saved operation name)', async () => {
    nextResponse = respondJson(200, DONE);
    const veo = new GoogleGenAIVeoAPI('test-key', 'error');

    // 1.x cast this object to the SDK's class; the SDK then called its
    // _fromAPIResponse method and threw "is not a function".
    const done = await veo.waitForCompletion({ name: NAME, done: false }, { intervalMs: 1 });

    expect(only().method).toBe('GET');
    expect(only().url.pathname).toBe(`/v1beta/${NAME}`);
    expect(done.name).toBe(NAME);
    expect(done.done).toBe(true);
    expect(done.response?.generatedVideos?.[0]?.video.uri).toBe('https://example.test/v.mp4');
  });

  it('a submission with no operation name is an error, not an operation that cannot be polled', async () => {
    nextResponse = respondJson(200, { done: false });
    await expect(new GoogleGenAIVeoAPI('test-key', 'error').generateVideo({ prompt: 'x' })).rejects.toThrow('without a name');
  });
});

describe('Veo request on the wire (spec D7, D12)', () => {
  const OP = { name: 'models/veo/operations/op1', done: false };
  const img = { imageBytes: 'SU1H', mimeType: 'image/png' };
  const lastFrame = { imageBytes: 'TEFTVA==', mimeType: 'image/png' };
  let sdkWarnings: string[];

  beforeEach(() => {
    nextResponse = respondJson(200, OP);
    sdkWarnings = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      sdkWarnings.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    // The SDK warns when prompt/image/video are passed top-level instead of in
    // `source` (2.24 index.mjs:15469). Using `source` must never trigger it.
    expect(sdkWarnings.filter((w) => w.includes('deprecated'))).toEqual([]);
    vi.restoreAllMocks();
  });

  const veo = () => new GoogleGenAIVeoAPI('test-key', 'error');
  const instance = () => only().body.instances[0];
  const parameters = () => only().body.parameters;

  it('durationSeconds 0 is sent (in warn mode), not silently dropped to the default', async () => {
    const veoWarn = new GoogleGenAIVeoAPI('test-key', 'error', { capabilityValidation: 'warn' });
    await veoWarn.generateVideo({ prompt: 'x', durationSeconds: 0 });
    expect(parameters()).toEqual({ durationSeconds: 0 });
  });

  it('model id in the URL: …/models/{model}:predictLongRunning', async () => {
    await veo().generateVideo({ prompt: 'x', model: VEO_MODELS.VEO_3_1_LITE });
    expect(only().url.pathname).toBe('/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning');
    expect(only().url.host).toBe(GEMINI_HOST);
  });

  it('text-to-video: prompt → instances[0].prompt; settings → parameters (durationSeconds numeric)', async () => {
    await veo().generateVideo({
      prompt: 't2v',
      aspectRatio: '9:16',
      resolution: '4k',
      durationSeconds: '8',
      negativePrompt: 'blur',
      personGeneration: 'allow_all',
    });
    expect(instance()).toEqual({ prompt: 't2v' });
    expect(parameters()).toEqual({
      aspectRatio: '9:16',
      resolution: '4k',
      durationSeconds: 8,
      negativePrompt: 'blur',
      personGeneration: 'allow_all',
    });
  });

  it('image-to-video: image → instances[0].image', async () => {
    await veo().generateFromImage({ prompt: 'i2v', image: img });
    expect(instance()).toEqual({ prompt: 'i2v', image: { bytesBase64Encoded: 'SU1H', mimeType: 'image/png' } });
  });

  it("reference images → instances[0].referenceImages, referenceType sent as given ('asset')", async () => {
    await veo().generateWithReferences({ prompt: 'refs', referenceImages: [{ image: img, referenceType: 'asset' }] });
    expect(instance().referenceImages).toEqual([
      { image: { bytesBase64Encoded: 'SU1H', mimeType: 'image/png' }, referenceType: 'asset' },
    ]);
    expect(parameters()).toEqual({ durationSeconds: 8 });
  });

  it('interpolation: firstFrame → instances[0].image, lastFrame → instances[0].lastFrame, duration 8', async () => {
    await veo().generateWithInterpolation({ prompt: 'interp', firstFrame: img, lastFrame });
    expect(instance()).toEqual({
      prompt: 'interp',
      image: { bytesBase64Encoded: 'SU1H', mimeType: 'image/png' },
      lastFrame: { bytesBase64Encoded: 'TEFTVA==', mimeType: 'image/png' },
    });
    expect(parameters()).toEqual({ durationSeconds: 8 });
  });

  it('extension: video → instances[0].video; sampleCount 1, 720p', async () => {
    await veo().extendVideo({ prompt: 'ext', video: { uri: 'https://example.test/v.mp4' } });
    expect(instance()).toEqual({ prompt: 'ext', video: { uri: 'https://example.test/v.mp4' } });
    expect(parameters()).toEqual({ sampleCount: 1, resolution: '720p' });
  });

  it('unknown Veo id: sent with every declared param (spec D3)', async () => {
    await veo().generateVideo({ prompt: 'x', model: 'veo-9-imaginary', resolution: '8k', durationSeconds: '30' });
    expect(only().url.pathname).toBe('/v1beta/models/veo-9-imaginary:predictLongRunning');
    expect(parameters()).toEqual({ resolution: '8k', durationSeconds: 30 });
  });

  it('seed never reaches the network (spec D15)', async () => {
    await expect(veo().generateVideo({ prompt: 'x', seed: 42 } as never)).rejects.toThrow('seed was removed in 2.0');
    expect(calls).toHaveLength(0);
  });

  it('Vertex environment variables do not reroute Veo either', async () => {
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'some-project');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1');
    await veo().generateVideo({ prompt: 'x' });
    expect(only().url.host).toBe(GEMINI_HOST);
  });
});
