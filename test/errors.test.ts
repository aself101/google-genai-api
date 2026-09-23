/**
 * toPublicError (spec D13) — classification, the vendor-message discriminator,
 * production vs non-production output, and property attachment on awkward
 * error objects.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { errorMessage, thrownFields, toPublicError, ValidationError } from '../src/errors.js';

/** What the SDK throws for an HTTP error: message = JSON.stringify(body), status = HTTP. */
function apiError(status: number, body: unknown): Error & { status: number } {
  return Object.assign(new Error(JSON.stringify(body)), { name: 'ApiError', status });
}

afterEach(() => vi.unstubAllEnvs());

describe('classification', () => {
  const cls = (e: unknown) => toPublicError(e, { surface: 'video' }).classification;

  it('by HTTP status', () => {
    expect(cls(apiError(401, {}))).toBe('AUTH');
    expect(cls(apiError(403, {}))).toBe('AUTH');
    expect(cls(apiError(408, {}))).toBe('TRANSIENT');
    expect(cls(apiError(429, {}))).toBe('TRANSIENT');
    expect(cls(apiError(500, {}))).toBe('TRANSIENT');
    expect(cls(apiError(503, {}))).toBe('TRANSIENT');
    expect(cls(apiError(400, {}))).toBe('USER_ACTIONABLE');
    expect(cls(apiError(404, {}))).toBe('USER_ACTIONABLE');
    expect(cls(apiError(422, {}))).toBe('USER_ACTIONABLE');
  });

  it('by gRPC code, for a failed Veo operation', () => {
    const op = (code: number) => Object.assign(new Error('x'), { operationError: { code, message: 'x' } });
    for (const code of [4, 8, 14]) expect(cls(op(code))).toBe('TRANSIENT');
    for (const code of [3, 5, 9]) expect(cls(op(code))).toBe('USER_ACTIONABLE');
    for (const code of [7, 16]) expect(cls(op(code))).toBe('AUTH');
  });

  it('by error kind when there is no status', () => {
    expect(cls(new TypeError('fetch failed'))).toBe('NETWORK');
    expect(cls(new DOMException('aborted', 'AbortError'))).toBe('TIMEOUT');
    expect(cls(new Error('seed parameter is not supported in Gemini API.'))).toBe('USER_ACTIONABLE');
  });

  it('safety comes from the vendor message only, and never overrides auth or transient', () => {
    const safety = { error: { status: 'INVALID_ARGUMENT', message: 'Blocked by safety policy' } };
    expect(cls(apiError(400, safety))).toBe('SAFETY_BLOCKED');
    expect(cls(apiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'audio blocked by policy' } }))).toBe('AUDIO_BLOCKED');
    expect(cls(apiError(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'blocked: quota' } }))).toBe('TRANSIENT');
    // "blocked" in details[] only — not the vendor message — does not count
    expect(cls(apiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad', details: [{ reason: 'POLICY_BLOCKED' }] } }))).toBe(
      'USER_ACTIONABLE'
    );
  });
});

describe('non-production: the original error, augmented', () => {
  it('returns the same object with the four properties added', () => {
    const original = apiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'nope' } });
    const out = toPublicError(original, { surface: 'image' });
    expect(out).toBe(original);
    expect(out).toMatchObject({ status: 400, classification: 'USER_ACTIONABLE', surface: 'image' });
    expect(out).not.toHaveProperty('cause');
  });

  it('keeps a Veo operationError', () => {
    const original = Object.assign(new Error('failed'), { operationError: { code: 3, message: 'failed' } });
    const out = toPublicError(original, { surface: 'video' });
    expect(out).toBe(original);
    expect((out as unknown as { operationError: unknown }).operationError).toEqual({ code: 3, message: 'failed' });
    expect(out.code).toBe(3);
  });

  it("does not throw on DOMException AbortError, whose `code` is a getter with no setter", () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    expect(() => toPublicError(abort, { surface: 'video' })).not.toThrow();
    expect(toPublicError(abort, { surface: 'video' })).toBe(abort);
    expect(toPublicError(abort, { surface: 'video' }).classification).toBe('TIMEOUT');
  });

  it('writes `code` onto an object whose prototype has a getter-only `code` without throwing', () => {
    // DOMException.prototype.code has no setter: in strict mode `err.code = 14`
    // throws and would replace the caller's error. Only reachable when there is
    // a gRPC code to write, so give the DOMException one.
    const abort = Object.assign(new DOMException('aborted', 'AbortError'), { operationError: { code: 14, message: 'x' } });
    let out: unknown;
    expect(() => {
      out = toPublicError(abort, { surface: 'video' });
    }).not.toThrow();
    expect(out).toBe(abort);
    expect((out as { code: unknown }).code).toBe(14);
  });

  it('rethrows a non-extensible error untouched', () => {
    const frozen = Object.freeze(new Error('frozen'));
    const out = toPublicError(frozen, { surface: 'image' });
    expect(out).toBe(frozen);
    expect(out).not.toHaveProperty('classification');
  });

  it('does not overwrite the SDK’s own status', () => {
    const original = apiError(503, {});
    Object.defineProperty(original, 'status', { value: 503, configurable: false, writable: false });
    expect(toPublicError(original, { surface: 'image' }).status).toBe(503);
  });
});

describe('production: a new Error that discloses only the vendor message', () => {
  const prod = (e: unknown, surface: 'image' | 'video' = 'video') => {
    vi.stubEnv('NODE_ENV', 'production');
    return toPublicError(e, { surface });
  };

  it('a gRPC status name marks a Gemini body; a proxy reason phrase does not — even BAD_REQUEST', () => {
    const gemini = prod(apiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad resolution' } }));
    expect(gemini.message).toBe('Video generation failed (HTTP 400): bad resolution');
    const proxy = prod(apiError(400, { error: { status: 'BAD_REQUEST', message: '<html>proxy</html>', code: 400 } }));
    expect(proxy.message).toBe('Video generation failed (HTTP 400): the request was rejected. Please check your inputs.');
  });

  it('video-surface sentences', () => {
    expect(prod(apiError(503, {})).message).toBe('Video generation failed: a temporary error occurred (HTTP 503). Please try again.');
    expect(prod(apiError(403, { error: { status: 'PERMISSION_DENIED', message: 'leaked key' } })).message).toBe(
      'Video generation failed: authentication or permission failure (HTTP 403).'
    );
    expect(prod(new TypeError('fetch failed')).message).toBe('Video generation failed: network error. Please try again.');
    expect(prod(apiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'Blocked by safety policy' } })).message).toBe(
      'Video generation was blocked due to content safety policies. Blocked by safety policy'
    );
  });

  it('a failed Veo operation surfaces its own message with the gRPC code attached', () => {
    const op = Object.assign(new Error('Unsupported aspect ratio'), { operationError: { code: 3, message: 'Unsupported aspect ratio' } });
    const out = prod(op);
    expect(out.message).toBe('Video generation failed: Unsupported aspect ratio');
    expect(out.code).toBe(3);
    expect(out).not.toHaveProperty('operationError');
  });

  it('truncates the vendor message to 300 characters', () => {
    const long = 'x'.repeat(500);
    expect(prod(apiError(400, { error: { status: 'INVALID_ARGUMENT', message: long } })).message.length).toBeLessThan(
      'Video generation failed (HTTP 400): '.length + 302
    );
  });

  it('never attaches cause', () => {
    expect(prod(apiError(400, {}))).not.toHaveProperty('cause');
    expect(prod(apiError(400, {})).cause).toBeUndefined();
  });
});

describe('ValidationError', () => {
  it('message is the first violation’s; all violations are kept', () => {
    const e = new ValidationError([
      { kind: 'shape', param: 'prompt', value: '', message: 'Prompt is required' },
      { kind: 'capability', param: 'imageSize', value: '2K', message: 'no 2K' },
    ]);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ValidationError');
    expect(e.message).toBe('Prompt is required');
    expect(e.violations).toHaveLength(2);
  });
});

describe('reading whatever was thrown (errorMessage, thrownFields)', () => {
  it('errorMessage: an Error or error-like object gives its message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage({ message: 'plain object' })).toBe('plain object');
  });

  it.each([
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['a string', 'oops', 'oops'],
    ['an object with a non-string message', { message: 42 }, '[object Object]'],
  ])('errorMessage: %s does not throw', (_case, value, expected) => {
    expect(errorMessage(value)).toBe(expected);
  });

  it('thrownFields: fields of an object, {} for null, undefined and primitives', () => {
    const err = Object.assign(new Error('x'), { code: 'ENOENT', status: 404 });
    expect(thrownFields(err).code).toBe('ENOENT');
    expect(thrownFields(err).status).toBe(404);
    expect(thrownFields(null)).toEqual({});
    expect(thrownFields(undefined)).toEqual({});
    expect(thrownFields('ENOENT')).toEqual({});
  });
});

