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
