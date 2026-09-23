/**
 * Why a Gemini response has no output, from Google's own fields. Internal (not
 * a package export); shared by GoogleGenAIVideoAPI and the CLI.
 */

import type { GeminiResponse } from './types/index.js';

export function noOutputReason(response: GeminiResponse): string {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) return `prompt blocked: ${blockReason}`;
  return `finishReason: ${response?.candidates?.[0]?.finishReason ?? 'none'}`;
}
