/**
 * Validation errors (spec D5).
 *
 * Leaf module: imports nothing from this package, so config.ts, api.ts and
 * veo-api.ts can all depend on it without a cycle.
 */

/**
 * One reason a set of parameters was rejected.
 *
 * - `shape`: the value is malformed (missing prompt, empty image data, a ratio
 *   that is not `W:H`). Always enforced, for every model id, including ids this
 *   package does not know.
 * - `capability`: the value is well-formed but the model's constraint table
 *   says it does not accept it (a ratio or size outside the model's list, too
 *   many input images). Enforced only for known models, and downgradable to a
 *   warning with `capabilityValidation: 'warn'`, because the table is derived
 *   from vendor docs that have been wrong before.
 */
export interface Violation {
  kind: 'shape' | 'capability';
  /** Parameter name as the caller passed it (e.g. `aspectRatio`, `inputImages[0].mimeType`). */
  param: string;
  value: unknown;
  /** The accepted values, when the rule is membership in a list. */
  allowed?: readonly unknown[];
  message: string;
}

/**
 * Thrown by the validators and by the clients before any network call.
 *
 * Extends `Error`, and its `message` is the first violation's message — the
 * same text 1.x threw as a plain `Error` for the rules 1.x had — so existing
 * `catch` blocks and message checks keep working. All violations are on
 * `violations`.
 */
export class ValidationError extends Error {
  readonly violations: Violation[];

  constructor(violations: Violation[]) {
    super(violations[0]?.message ?? 'Validation failed');
    this.name = 'ValidationError';
    this.violations = violations;
  }
}

// ============================================================================
// Public error surface (spec D13)
// ============================================================================

/**
 * How an API failure is classified. Drives the production message and, for
 * Veo polling, whether a poll request is retried.
 */
export type PublicErrorClass =
  | 'AUTH'
  | 'TRANSIENT'
  | 'USER_ACTIONABLE'
  | 'SAFETY_BLOCKED'
  | 'AUDIO_BLOCKED'
  | 'NETWORK'
  | 'TIMEOUT';

/** Properties `toPublicError` guarantees on whatever it returns. */
export interface PublicErrorFields {
  /** HTTP status, when the failure was an HTTP response */
  status?: number;
  /** gRPC status code, for a failed Veo operation */
  code?: number;
  classification: PublicErrorClass;
  surface: 'image' | 'video';
}

// The 17 gRPC canonical status names. Gemini API error bodies always carry one
// in `error.status`; the SDK's wrapper for a non-JSON body (a proxy or HTML
// error page) copies the HTTP reason phrase there instead. Matching this list —
// not a pattern like /^[A-Z_]+$/, which `BAD_REQUEST` would also pass — is what
// tells a vendor message from a stranger's page.
const GRPC_STATUS_NAMES = new Set([
  'OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND',
  'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION',
  'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS',
  'UNAUTHENTICATED',
]);

const VENDOR_MESSAGE_MAX = 300;

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  operationError?: { code?: unknown; message?: unknown };
}

/**
 * The vendor's own `error.message`, or undefined. Reads only that field —
 * never `details[]` (which can carry project and quota metadata), never a body
 * that is not a Gemini error.
 */
function vendorMessage(err: ErrorLike): string | undefined {
  if (err.operationError && typeof err.operationError.message === 'string') {
    return err.operationError.message;
  }
  if (typeof err.message !== 'string') return undefined;
  let body: unknown;
  try {
    body = JSON.parse(err.message);
  } catch {
    return undefined;
  }
  const e = (body as { error?: { status?: unknown; message?: unknown } } | null)?.error;
  if (!e || typeof e.status !== 'string' || !GRPC_STATUS_NAMES.has(e.status)) return undefined;
  return typeof e.message === 'string' ? e.message : undefined;
}

function classify(status: number | undefined, code: number | undefined, err: ErrorLike, vendor: string | undefined): PublicErrorClass {
  let cls: PublicErrorClass;
  if (status !== undefined) {
    if (status === 401 || status === 403) cls = 'AUTH';
    else if (status === 408 || status === 429 || status >= 500) cls = 'TRANSIENT';
    else cls = 'USER_ACTIONABLE';
  } else if (code !== undefined) {
    if (code === 4 || code === 8 || code === 14) cls = 'TRANSIENT';
    else if (code === 7 || code === 16) cls = 'AUTH';
    else cls = 'USER_ACTIONABLE';
  } else if (err.name === 'AbortError') {
    cls = 'TIMEOUT';
  } else if (err.name === 'TypeError') {
    cls = 'NETWORK'; // what fetch throws when the connection fails
  } else {
    cls = 'USER_ACTIONABLE'; // SDK client-side rejection: its own text, no vendor data
  }
  // Safety is read from the vendor's message only, never from a raw body, and
  // never overrides an auth or transient status.
  if (vendor && cls === 'USER_ACTIONABLE' && /safety|blocked|policy/i.test(vendor)) {
    cls = /audio/i.test(vendor) ? 'AUDIO_BLOCKED' : 'SAFETY_BLOCKED';
  }
  return cls;
}

function truncate(text: string): string {
  return text.length > VENDOR_MESSAGE_MAX ? `${text.slice(0, VENDOR_MESSAGE_MAX)}…` : text;
}

function productionMessage(cls: PublicErrorClass, surface: 'image' | 'video', status: number | undefined, detail: string | undefined): string {
  const Subject = surface === 'image' ? 'Image generation' : 'Video generation';
  const http = status !== undefined ? ` (HTTP ${status})` : '';
  switch (cls) {
    case 'AUTH':
      return `${Subject} failed: authentication or permission failure${http}.`;
    case 'TRANSIENT':
      return `${Subject} failed: a temporary error occurred${http}. Please try again.`;
    case 'NETWORK':
      return `${Subject} failed: network error. Please try again.`;
    case 'TIMEOUT':
      return `${Subject} failed: the request timed out. Please try again.`;
    case 'SAFETY_BLOCKED':
      return `${Subject} was blocked due to content safety policies.${detail ? ` ${detail}` : ''}`;
    case 'AUDIO_BLOCKED':
      return `${Subject} was blocked due to audio processing issues.${detail ? ` ${detail}` : ''}`;
    case 'USER_ACTIONABLE':
      return `${Subject} failed${http}: ${detail ?? 'the request was rejected. Please check your inputs.'}`;
  }
}

/** Add a property without assignment: `DOMException.code` is a getter with no setter. */
function attach(target: object, key: string, value: unknown): void {
  if (value === undefined || !Object.isExtensible(target)) return;
  const existing = Object.getOwnPropertyDescriptor(target, key);
  if (existing && !existing.configurable) return;
  try {
    Object.defineProperty(target, key, { value, configurable: true, enumerable: false, writable: true });
  } catch {
    // leave the error as it was — never replace the caller's error with ours
  }
}

/**
 * Turn an API failure into what the caller receives (spec D13).
 *
 * - Outside production: the **original** error object — same identity, class,
 *   `name`, `message`, `operationError` — with `status`, `code`,
 *   `classification` and `surface` added. No wrapper, no `cause`.
 * - In production: a new `Error` whose message is a category sentence plus,
 *   for rejected requests and safety blocks, the vendor's own `error.message`
 *   (≤300 chars). Auth and transient failures never include vendor text.
 *   `details[]`, non-JSON bodies and `cause` are never exposed: Node prints a
 *   `cause` chain, which would re-expose the full body.
 */
export function toPublicError(error: unknown, context: { surface: 'image' | 'video' }): Error & PublicErrorFields {
  const err = (error ?? {}) as ErrorLike;
  const status = typeof err.status === 'number' ? err.status : undefined;
  const code = typeof err.operationError?.code === 'number' ? err.operationError.code : undefined;
  const vendor = vendorMessage(err);
  const classification = classify(status, code, err, vendor);
  const fields: PublicErrorFields = { status, code, classification, surface: context.surface };

  if (process.env.NODE_ENV !== 'production') {
    const original = error instanceof Error ? error : new Error(String(error));
    for (const [key, value] of Object.entries(fields)) attach(original, key, value);
    return original as Error & PublicErrorFields;
  }

  let detail: string | undefined;
  if (classification === 'USER_ACTIONABLE' || classification === 'SAFETY_BLOCKED' || classification === 'AUDIO_BLOCKED') {
    if (vendor) detail = truncate(vendor);
    else if (status === undefined && code === undefined && typeof err.message === 'string') detail = truncate(err.message);
  }
  const publicError = new Error(productionMessage(classification, context.surface, status, detail));
  for (const [key, value] of Object.entries(fields)) attach(publicError, key, value);
  return publicError as Error & PublicErrorFields;
}
