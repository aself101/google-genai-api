/**
 * Wire tests (spec D12).
 *
 * Every other test file mocks `@google/genai`, so it can only check what this
 * package hands a fake. That is how 1.x shipped an `aspectRatio` the SDK
 * silently dropped (spec §1.4). Here the REAL SDK serializes the request and a
 * stubbed `fetch` captures what would go on the wire; the assertions are on the
 * parsed request body.
 *
 * The seam: the SDK resolves the global `fetch` per call (1.30, 2.24 and 2.32;
 * spec §1.5) and its `models` client does not retry without `retryOptions`, so
 * each call is exactly one fetch — asserted, so a retry wrapper can never let a
 * check pass on the wrong request. The Interactions client (Omni) also uses the
 * global `fetch`, but passes a `Request` object rather than `(url, init)`, and
 * DOES retry by default (five calls on a 503, observed 2026-11-08) — which is
 * why the Omni client turns retries off, and why a test below counts calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GoogleGenAIAPI } from '../src/api.js';
import { GoogleGenAIOmniAPI } from '../src/omni-api.js';
import { GoogleGenAIVideoAPI } from '../src/video-api.js';
import { DEFAULT_IMAGE_MODEL, MODELS, OMNI_MODELS, OMNI_TIMEOUTS } from '../src/config.js';

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
    if (input instanceof Request) {
      const text = await input.clone().text();
      calls.push({ url: new URL(input.url), method: input.method, body: text ? JSON.parse(text) : {} });
    } else {
      calls.push({
        url: new URL(String(input)),
        method: String(init.method),
        body: init.body ? JSON.parse(String(init.body)) : {},
      });
    }
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

/** The error a promise rejects with; fails the test if it resolves. */
async function rejection(p: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await p;
  } catch (e) {
    return e as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

describe('image request on the wire', () => {
  it('model id goes in the URL: …/models/{model}:generateContent', async () => {
    await api().generateWithGemini({ prompt: 'x', model: MODELS.GEMINI_3_PRO });
    const { url, method } = only();
    expect(method).toBe('POST');
    expect(url.host).toBe(GEMINI_HOST);
    expect(url.pathname).toBe('/v1beta/models/gemini-3-pro-image:generateContent');
  });

  it('default model is gemini-nano-banana-2.1', async () => {
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

describe('video understanding request on the wire', () => {
  it('clipping offsets travel beside fileData on the part (1.x nested them; the API rejects that)', async () => {
    nextResponse = respondJson(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] });
    await new GoogleGenAIVideoAPI('test-key', 'error').generateFromVideo({
      prompt: 'describe',
      fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
      mimeType: 'video/mp4',
      videoMetadata: { startOffset: '2s', endOffset: '6s' },
    });
    const part = only().body.contents[0].parts[1];
    expect(part.videoMetadata).toEqual({ startOffset: '2s', endOffset: '6s' });
    expect(part.fileData).toEqual({ fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'video/mp4' });
  });
});

describe('Omni request on the wire (spec 3.0 D19, D22)', () => {
  const OMNI_OK = {
    id: 'v1_abc',
    status: 'completed',
    model: 'gemini-omni-1.2-flash',
    object: 'interaction',
    steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'AAAAIGZ0eXA=' }] }],
  };
  const omni = (options?: ConstructorParameters<typeof GoogleGenAIOmniAPI>[2]) => new GoogleGenAIOmniAPI('test-key', 'error', options);
  const img = { data: 'aGVsbG8=', mimeType: 'image/png' };

  beforeEach(() => {
    nextResponse = respondJson(200, OMNI_OK);
  });

  it('POST …/v1beta/interactions with the model in the body', async () => {
    await omni().generate({ prompt: 'x' });
    const { url, method, body } = only();
    expect(method).toBe('POST');
    expect(url.host).toBe(GEMINI_HOST);
    expect(url.pathname).toBe('/v1beta/interactions');
    expect(body.model).toBe(OMNI_MODELS.OMNI_1_2_FLASH);
  });

  it('a bare prompt is sent as a string, with no response_format or generation_config', async () => {
    await omni().generate({ prompt: 'a red ball bounces' });
    expect(only().body).toEqual({ model: 'gemini-omni-1.2-flash', input: 'a red ball bounces' });
  });

  it('settings → response_format: aspect_ratio, resolution, duration as "<n>s", delivery', async () => {
    await omni().generate({ prompt: 'x', aspectRatio: '9:16', resolution: '1080p', durationSeconds: 8, delivery: 'uri' });
    expect(only().body.response_format).toEqual({ type: 'video', aspect_ratio: '9:16', resolution: '1080p', duration: '8s', delivery: 'uri' });
  });

  it('a string duration from the CLI is sent the same way', async () => {
    await omni().generate({ prompt: 'x', durationSeconds: '12' });
    expect(only().body.response_format).toEqual({ type: 'video', duration: '12s' });
  });

  it('images → input blocks before the text, order preserved (first frame, last frame)', async () => {
    await omni().generate({ prompt: 'from the first frame to the last', images: [img, { uri: 'https://generativelanguage.googleapis.com/v1beta/files/end' }] });
    expect(only().body.input).toEqual([
      { type: 'image', data: 'aGVsbG8=', mime_type: 'image/png' },
      { type: 'image', uri: 'https://generativelanguage.googleapis.com/v1beta/files/end' },
      { type: 'text', text: 'from the first frame to the last' },
    ]);
  });

  it('video → a video block first (Google guide order: video, images, text)', async () => {
    await omni().generate({ prompt: 'extend', video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1', mimeType: 'video/mp4' }, images: [img] });
    expect(only().body.input.map((b: { type: string }) => b.type)).toEqual(['video', 'image', 'text']);
    expect(only().body.input[0]).toEqual({ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1', mime_type: 'video/mp4' });
  });

  it('previousInteractionId and store map to their wire names', async () => {
    await omni().generate({ prompt: 'Make the violin invisible.', previousInteractionId: 'v1_prev', store: false });
    const { body } = only();
    expect(body.previous_interaction_id).toBe('v1_prev');
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty('generation_config');
  });

  it('task → generation_config.video_config.task', async () => {
    await omni().generate({ prompt: 'Make this anime.', video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1' }, task: 'edit' });
    expect(only().body.generation_config).toEqual({ video_config: { task: 'edit' } });
  });

  it('task with previousInteractionId never reaches the network (the API rejects the pair, live 2026-11-08)', async () => {
    await expect(omni().generate({ prompt: 'x', previousInteractionId: 'v1_prev', task: 'edit' })).rejects.toThrow(/previousInteractionId/);
    expect(calls).toHaveLength(0);
  });

  it('durationSeconds 0 is sent in warn mode, not silently dropped to the default', async () => {
    await omni({ capabilityValidation: 'warn' }).generate({ prompt: 'x', durationSeconds: 0 });
    expect(only().body.response_format.duration).toBe('0s');
  });

  it('unknown Omni id: sent with every param, no capability check (spec D3)', async () => {
    await omni().generate({ prompt: 'x', model: 'gemini-omni-9-flash', resolution: '8k', durationSeconds: 60 });
    expect(only().body).toMatchObject({ model: 'gemini-omni-9-flash', response_format: { resolution: '8k', duration: '60s' } });
  });

  it('a rejected parameter never reaches the network', async () => {
    await expect(omni().generate({ prompt: 'x', resolution: '8k' })).rejects.toThrow(/Invalid resolution/);
    await expect(omni().generate({ prompt: 'x', negativePrompt: 'blur' } as never)).rejects.toThrow(/not supported by Gemini Omni/);
    expect(calls).toHaveLength(0);
  });

  it('returns the interaction id and the inline video', async () => {
    const result = await omni().generate({ prompt: 'x' });
    expect(result).toEqual({
      interactionId: 'v1_abc',
      model: 'gemini-omni-1.2-flash',
      status: 'completed',
      video: { mimeType: 'video/mp4', data: 'AAAAIGZ0eXA=' },
    });
  });

  it('a uri delivery returns the uri, not data', async () => {
    const uri = 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media';
    nextResponse = respondJson(200, { ...OMNI_OK, steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri }] }] });
    const result = await omni().generate({ prompt: 'x', delivery: 'uri' });
    expect(result.video).toEqual({ mimeType: 'video/mp4', uri });
  });

  it('saveVideo: a uri video whose file FAILED processing throws at once, without downloading', async () => {
    const uri = 'https://generativelanguage.googleapis.com/v1beta/files/bad1:download?alt=media';
    const result = { interactionId: 'v1_abc', model: 'gemini-omni-1.2-flash', status: 'completed', video: { mimeType: 'video/mp4', uri } };
    nextResponse = respondJson(200, { name: 'files/bad1', state: 'FAILED' });
    await expect(omni().saveVideo(result, path.join(mkdtempSync(path.join(tmpdir(), 'omni-wire-')), 'never-written.mp4'))).rejects.toThrow('files/bad1 failed processing');
    expect(calls.map((c) => c.url.pathname)).toEqual(['/v1beta/files/bad1']);
  });

  it.each(['development', 'production'])(
    'saveVideo: the file-poll timeout is thrown as is, with isTimeout (%s) — parity with video understanding',
    async (env) => {
      vi.stubEnv('NODE_ENV', env);
      const saved = { ...OMNI_TIMEOUTS };
      Object.assign(OMNI_TIMEOUTS, { FILE_POLL_MAX_ATTEMPTS: 2, FILE_POLL_INTERVAL: 0 });
      try {
        const uri = 'https://generativelanguage.googleapis.com/v1beta/files/slow1:download?alt=media';
        const result = { interactionId: 'v1_abc', model: 'gemini-omni-1.2-flash', status: 'completed', video: { mimeType: 'video/mp4', uri } };
        nextResponse = respondJson(200, { name: 'files/slow1', state: 'PROCESSING' });
        const err = await rejection(omni().saveVideo(result, path.join(mkdtempSync(path.join(tmpdir(), 'omni-wire-')), 'never-written.mp4')));
        expect(err.isTimeout).toBe(true);
        expect(err.message).toBe('Video file files/slow1 was not ready after 2 checks');
        expect(calls).toHaveLength(2);
      } finally {
        Object.assign(OMNI_TIMEOUTS, saved);
      }
    }
  );

  it('completed with no video → an error naming the interaction and what the model said', async () => {
    nextResponse = respondJson(200, { ...OMNI_OK, steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I cannot generate that.' }] }] });
    const err = await rejection(omni().generate({ prompt: 'x' }));
    expect(err.message).toBe('Omni interaction v1_abc completed without a video. Model said: I cannot generate that.');
    expect(err.interactionId).toBe('v1_abc');
    expect(err.surface).toBe('video');
  });

  it("status 'failed' → an error carrying the interaction's own message", async () => {
    nextResponse = respondJson(200, { id: 'v1_f', status: 'failed', object: 'interaction', errors: [{ code: 'x', message: 'Video generation was blocked by safety filters.' }] });
    const err = await rejection(omni().generate({ prompt: 'x' }));
    expect(err.message).toContain("ended with status 'failed': Video generation was blocked by safety filters.");
    expect(err.classification).toBe('SAFETY_BLOCKED');
  });

  it('Vertex environment variables do not reroute Omni', async () => {
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'some-project');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1');
    await omni().generate({ prompt: 'x' });
    expect(only().url.host).toBe(GEMINI_HOST);
  });
});

describe('Omni errors from the wire (spec D13, 3.0 D22)', () => {
  // The Interactions client's error body: a JSON ARRAY of one Gemini error (observed live 2026-11-08).
  const vendor = (code: number, status: string, message: string) => () =>
    new Response(JSON.stringify([{ error: { code, message, status, details: [{ metadata: { consumer: 'projects/123456789' } }] } }]), {
      status: code,
      headers: { 'content-type': 'application/json' },
    });

  async function failure(): Promise<Error & Record<string, unknown>> {
    try {
      await new GoogleGenAIOmniAPI('test-key', 'error').generate({ prompt: 'x' });
    } catch (e) {
      return e as Error & Record<string, unknown>;
    }
    throw new Error('expected a failure');
  }

  it('a 503 is NOT retried: one billed generation attempt, never five (the SDK default)', async () => {
    nextResponse = vendor(503, 'UNAVAILABLE', 'The model is overloaded.');
    const err = await failure();
    expect(calls).toHaveLength(1);
    expect(err.classification).toBe('TRANSIENT');
  });

  it('outside production: the SDK error itself, with status/classification/surface added', async () => {
    nextResponse = vendor(400, 'INVALID_ARGUMENT', 'Duration must be between 3s and 15s.');
    const err = await failure();
    expect(err.constructor.name).toBe('BadRequestError'); // identity kept
    // The Interactions client's own message is `400 API error occurred: {"httpMeta":…}`;
    // it is replaced by the vendor error, as the models client's ApiError message already is (3.0 D27).
    expect(err.message).not.toContain('httpMeta');
    expect(JSON.parse(err.message)).toMatchObject({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Duration must be between 3s and 15s.' } });
    expect(err.status).toBe(400);
    expect(err.classification).toBe('USER_ACTIONABLE');
    expect(err.surface).toBe('video');
  });

  // The Interactions client wraps transport failures in its own classes, which
  // carry no status: APIConnectionError and APIConnectionTimeoutError (SDK 2.32).
  it('a connection failure is NETWORK, as on the image client (consumer-validate #8)', async () => {
    nextResponse = () => {
      throw new TypeError('fetch failed');
    };
    const err = await failure();
    expect(err.constructor.name).toBe('APIConnectionError');
    expect(err.classification).toBe('NETWORK');
  });

  it('timeoutMs expiring is TIMEOUT, not USER_ACTIONABLE (consumer-validate #8)', async () => {
    vi.stubGlobal('fetch', (input: string | URL | Request, init: RequestInit = {}) => {
      const signal = input instanceof Request ? input.signal : init.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
      });
    });
    const err = await rejection(new GoogleGenAIOmniAPI('test-key', 'error').generate({ prompt: 'x', timeoutMs: 50 }));
    expect(err.constructor.name).toBe('APIConnectionTimeoutError');
    expect(err.classification).toBe('TIMEOUT');
  });

  it('completed without a video: a refusal naming safety or policy is SAFETY_BLOCKED; other text is USER_ACTIONABLE', async () => {
    const said = (text: string) => respondJson(200, { id: 'v1_n', status: 'completed', object: 'interaction', model: 'gemini-omni-1.2-flash', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] });
    nextResponse = said('I cannot create this video because it violates our safety policy.');
    expect((await failure()).classification).toBe('SAFETY_BLOCKED');
    nextResponse = said('Here is a description instead of a video.');
    expect((await failure()).classification).toBe('USER_ACTIONABLE'); // control: our own prefix triggers nothing
  });

  describe('in production', () => {
    beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

    it('a connection failure → the network sentence, not the SDK text', async () => {
      nextResponse = () => {
        throw new TypeError('fetch failed');
      };
      const err = await failure();
      expect(err.classification).toBe('NETWORK');
      expect(err.message).toBe('Video generation failed: network error. Please try again.');
    });

    it('timeoutMs expiring → says it may be billed and to raise timeoutMs, not "please try again"', async () => {
      vi.stubGlobal('fetch', (input: string | URL | Request, init: RequestInit = {}) => {
        const signal = input instanceof Request ? input.signal : init.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
        });
      });
      const err = await rejection(new GoogleGenAIOmniAPI('test-key', 'error').generate({ prompt: 'x', timeoutMs: 50 }));
      expect(err.classification).toBe('TIMEOUT');
      expect(err.message).toBe('Video generation failed: the request timed out. The video may still have been generated and billed; raise timeoutMs rather than retrying.');
    });

    it("a failed interaction keeps its interactionId, so a billed failure can be traced (consumer-validate #8)", async () => {
      nextResponse = respondJson(200, { id: 'v1_f', status: 'failed', object: 'interaction', errors: [{ code: 'x', message: 'Internal error while generating.' }] });
      const err = await failure();
      expect(err.interactionId).toBe('v1_f');
    });

    it('a video completed without a video keeps its interactionId too', async () => {
      nextResponse = respondJson(200, { id: 'v1_n', status: 'completed', object: 'interaction', steps: [] });
      const err = await failure();
      expect(err.interactionId).toBe('v1_n');
    });

    it('400 → the vendor message read from the array body, never details[]', async () => {
      nextResponse = vendor(400, 'INVALID_ARGUMENT', 'Duration must be between 3s and 15s.');
      const err = await failure();
      expect(err.message).toBe('Video generation failed (HTTP 400): Duration must be between 3s and 15s.');
      expect(err.message).not.toContain('projects/');
      expect(err.message).not.toContain('httpMeta');
      expect(err.cause).toBeUndefined();
    });

    it("400 in the Interactions API's own format ({error: {message, code: 'invalid_request'}}) → the vendor message", async () => {
      // Observed live 2026-11-08 for request validation (aspect_ratio 1:1): no gRPC status, a string code, no array.
      const message = "The value '1:1' is not supported for 'response_format.aspect_ratio'. Supported values: '16:9', '9:16'.";
      nextResponse = respondJson(400, { error: { message, code: 'invalid_request' } });
      const err = await failure();
      expect(err.message).toBe(`Video generation failed (HTTP 400): ${message}`);
    });

    it('a JSON body whose code is not a lowercase identifier is not trusted as a vendor message', async () => {
      nextResponse = respondJson(400, { error: { message: 'internal stack trace at proxy.js:12', code: 'Some Proxy 1.0' } });
      const err = await failure();
      expect(err.message).toBe('Video generation failed (HTTP 400): the request was rejected. Please check your inputs.');
    });

    it('402 (prepaid credits depleted) → the vendor message, so the user learns it is billing', async () => {
      nextResponse = vendor(402, 'RESOURCE_EXHAUSTED', 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing. ');
      const err = await failure();
      expect(err.message).toBe('Video generation failed (HTTP 402): Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.');
      expect(err.classification).toBe('USER_ACTIONABLE');
    });

    it('403 → auth sentence, no vendor text', async () => {
      nextResponse = vendor(403, 'PERMISSION_DENIED', 'Your API key was reported as leaked.');
      const err = await failure();
      expect(err.message).toBe('Video generation failed: authentication or permission failure (HTTP 403).');
    });
  });
});
