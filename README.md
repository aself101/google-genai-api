# google-genai-api

[![npm version](https://img.shields.io/npm/v/google-genai-api.svg)](https://www.npmjs.com/package/google-genai-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/google-genai-api)](https://nodejs.org)

A TypeScript/Node.js wrapper and CLI for the [Gemini Developer API](https://ai.google.dev/gemini-api/docs): image generation and editing with the current Gemini image models, video generation with Veo 3.1, and video understanding with Gemini. Built on the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK (2.x).

> **Upgrading from 1.x?** Imagen and Veo 3.0/2.0 are gone (Google shut them down), the default image model changed, and `aspectRatio` is now actually sent. See [Upgrading to 2.0](#upgrading-to-20).

## Quick Start

### CLI

```bash
npm install -g google-genai-api
export GOOGLE_GENAI_API_KEY="your-api-key"

# Image (default model: gemini-3.1-flash-image)
google-genai --gemini --prompt "a serene mountain landscape" --aspect-ratio 16:9

# Edit with several reference images, at 2K
google-genai --gemini --prompt "put the person in the room" -i person.jpg -i room.jpg --image-size 2K

# Video with Veo 3.1
google-genai --veo --prompt "waves crashing against a lighthouse at dusk" --veo-duration 8
```

### Programmatic

```typescript
import { GoogleGenAIAPI, extractGeminiParts } from 'google-genai-api';
import { GoogleGenAIVeoAPI } from 'google-genai-api/veo';

const images = new GoogleGenAIAPI(process.env.GOOGLE_GENAI_API_KEY!);
const response = await images.generateWithGemini({
  prompt: 'a serene mountain landscape',
  aspectRatio: '16:9',
  imageSize: '2K',
});
const parts = extractGeminiParts(response); // [{ type: 'image', mimeType, data }, ...]

const veo = new GoogleGenAIVeoAPI(process.env.GOOGLE_GENAI_API_KEY!);
let operation = await veo.generateVideo({ prompt: 'a cat playing piano', durationSeconds: '8' });
operation = await veo.waitForCompletion(operation);
await veo.downloadVideo(operation, './cat.mp4');
```

## Table of Contents

- [Upgrading to 2.0](#upgrading-to-20)
- [Models](#models)
- [Model lifecycle](#model-lifecycle)
- [Installation](#installation)
- [Authentication](#authentication)
- [Image generation](#image-generation)
- [Validation](#validation)
- [Video generation (Veo)](#video-generation-veo)
- [Video understanding](#video-understanding)
- [Errors](#errors)
- [Public API](#public-api)
- [CLI](#cli)
- [Output files](#output-files)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Maintainer notes](#maintainer-notes)

## Upgrading to 2.0

2.0 exists because Google retired most of what 1.x wrapped, and because 1.x never sent the aspect ratio you passed. Nothing below was removed on this package's own initiative: every removal is a model Google shut down or announced a shutdown for. The full list is in the [CHANGELOG](CHANGELOG.md).

**Requires Node.js ≥ 20** (the `@google/genai` 2.x floor).

| 1.x | 2.0 |
|---|---|
| `generateWithImagen({ prompt, numberOfImages, aspectRatio })` | `generateWithGemini({ prompt, aspectRatio })` — one image per call; call again for more. Imagen was shut down on 2026-08-17. |
| `extractImagenImages(res)` | `extractGeminiParts(res)` |
| `MODELS.IMAGEN` | `DEFAULT_IMAGE_MODEL` or `MODELS.GEMINI_3_1_FLASH` |
| `MODELS.GEMINI` (`gemini-2.5-flash-image`, shutdown 2026-10-02) | Removed — use `DEFAULT_IMAGE_MODEL`. It was removed rather than pointed at a new model so code that used it fails visibly instead of silently switching models. |
| `MODELS.GEMINI_3_PRO` = `gemini-3-pro-image-preview` | Same key, now the GA `gemini-3-pro-image` |
| Implicit default model `gemini-2.5-flash-image` | `gemini-3.1-flash-image` |
| `aspectRatio` accepted but **never sent** | Sent (`imageConfig.aspectRatio`). **Output framing now follows the value you pass.** Omit it to keep what 1.x actually gave you: the model's default framing. |
| `aspectRatio` defaulted to `1:1` | No default |
| — | `imageSize` (`512`, `1K`, `2K`, `4K`, per model) |
| One input image | Up to 14, per model |
| `generateWithGemini` did not validate | Validates before any API call; throws `ValidationError`. `capabilityValidation: 'warn'` downgrades table-based rejections to warnings. |
| Unknown model id: CLI and Veo threw | Sent with a one-time warning (see [Model lifecycle](#model-lifecycle)) |
| `validateModelParams` / `validateVeoParams` threw `Error`, also for unknown ids | Throw `ValidationError` (an `Error`), not for unknown ids |
| `detectGeminiMode` threw on more than one image | Never throws on count |
| `extractGeminiParts` returned thought parts as output | Skips them; `{ includeThoughts: true }` keeps them |
| `GeminiResponse.parts` (not an SDK field) | Removed; parts are in `candidates[0].content.parts` |
| `VEO_MODELS.VEO_3`, `VEO_3_FAST`, `VEO_2` (shut down 2026-06-30) | `VEO_3_1`, `VEO_3_1_FAST`, `VEO_3_1_LITE` |
| `durationSeconds: '5'` (Veo 2 only) | `'4'`, `'6'` or `'8'` |
| `VeoGenerateParams.seed` | Removed: the Gemini Developer API rejects it (every 1.x call with a seed failed). Passing it throws `ValidationError`. |
| `VeoModelConstraint.resolution1080p` | Still there, deprecated; use `durationRequired` |
| Veo polling retried 429/502/503 and any error whose message contained "network" or "timeout" | Retries only a failed poll request (network error, timeout, 408, 429, any 5xx); a job that finished with an error is thrown at once. See [Video generation](#video-generation-veo). |
| Production errors: one generic sentence | Category sentence plus Google's own message for rejected requests; `status`, `classification` etc. on every error. See [Errors](#errors). |
| Types not importable | `import type { GeminiGenerateParams, … } from 'google-genai-api'` |
| CLI `--imagen`, `-n/--number-of-images` | `--gemini` / `--model <id>`; one image per call |
| CLI `--aspect-ratio` defaulted to `1:1` | No default |
| CLI exited 0 when no image came back | Exits 1, naming the `finishReason` |

## Models

The package catalogs **current models only** — those Google has announced no shutdown for. Values below are generated from the package's constraint tables (`MODEL_CONSTRAINTS`, `VEO_MODEL_CONSTRAINTS`), which come from Google's model pages and live probes; if Google accepts something the table does not, see [`capabilityValidation`](#validation).

### Image models

<!-- generated:image-models -->
| Model | Aspect ratios | `imageSize` | Input images |
|---|---|---|---|
| `gemini-3.1-flash-image` (default) | all 14 | `512`, `1K`, `2K`, `4K` | up to 14 |
| `gemini-3.1-flash-lite-image` | all 14 | `1K` | up to 14 |
| `gemini-3-pro-image` | `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1K`, `2K`, `4K` | up to 14 |

All aspect ratios: `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1`. All sizes: `512`, `1K`, `2K`, `4K` (uppercase K).
<!-- /generated:image-models -->

`imageSize` is a resolution tier, not a fixed edge: on `gemini-3.1-flash-image`, `2K` gave 2048×2048 at `1:1` and 2816×1536 at the model's default framing (live, 2026-09-22). All images carry Google's SynthID watermark.

### Veo models

<!-- generated:veo-models -->
| Model | Resolutions | Durations (s) | Reference images | Interpolation | Extension | Audio | Needs 8 s |
|---|---|---|---|---|---|---|---|
| `veo-3.1-generate-preview` (default) | `720p`, `1080p`, `4k` | 4, 6, 8 | up to 3 | yes | yes | yes | `1080p`, `4k` |
| `veo-3.1-fast-generate-preview` | `720p`, `1080p`, `4k` | 4, 6, 8 | up to 3 | yes | yes | yes | `1080p`, `4k` |
| `veo-3.1-lite-generate-preview` | `720p`, `1080p` | 4, 6, 8 | — | yes | — | yes | `1080p` |
<!-- /generated:veo-models -->

All three are Google preview models. Veo 3.1 Lite rejects reference images (verified live) and does not support extension or 4k.

### Video understanding

<!-- generated:video-model -->
Video understanding uses `gemini-2.5-flash`.
<!-- /generated:video-model -->

## Model lifecycle

- **Current models only.** A model is in the catalog if it generates and Google's [deprecations page](https://ai.google.dev/gemini-api/docs/deprecations) shows no shutdown date for it. When Google announces one, the model is removed in the next release.
- **Removal never cuts you off early.** Any string is accepted as a model id. An id the package does not catalog — a model newer than this release, or a retired one Google still serves — is sent with a one-time warning per client, with shape checks only (see [Validation](#validation)). `gemini-2.5-flash-image` keeps working this way until Google turns it off on 2026-10-02.
- **Checked automatically.** `npm run check:lifecycle` fails if a cataloged model has a shutdown date or is missing from Google's page. It runs weekly in CI and before every publish.
- `isKnownImageModel(id)` / `isKnownVeoModel(id)` tell you whether an id is cataloged. `MODEL_CONSTRAINTS` and `VEO_MODEL_CONSTRAINTS` are keyed by string, so looking up a removed id compiles and returns `undefined` — check with the guard first.

## Installation

```bash
npm install google-genai-api          # library
npm install -g google-genai-api       # CLI: google-genai
```

Node.js 20 or newer. Runtime dependencies: `@google/genai`, `axios` (image URL downloads and one Files API call), `commander`, `dotenv`, `file-type`, `winston`.

## Authentication

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). The CLI and `getGoogleGenAIApiKey()` look in this order:

1. `--api-key <key>` (CLI only)
2. `GOOGLE_GENAI_API_KEY` in the environment
3. `.env` in the current directory
4. `~/.google-genai/.env` (for global installs)

```bash
export GOOGLE_GENAI_API_KEY=your_key
# or
mkdir -p ~/.google-genai && echo "GOOGLE_GENAI_API_KEY=your_key" > ~/.google-genai/.env
```

The library classes take the key as their first constructor argument. Never commit `.env` files.

## Image generation

```typescript
import { GoogleGenAIAPI, extractGeminiParts } from 'google-genai-api';
import { imageToInlineData } from 'google-genai-api/utils';

const api = new GoogleGenAIAPI(apiKey);

// Text-to-image
const response = await api.generateWithGemini({ prompt: 'a red sports car', aspectRatio: '16:9' });

// Editing / reference images (local paths or HTTPS URLs)
const person = await imageToInlineData('./person.jpg');
const room = await imageToInlineData('https://example.com/room.jpg');
const edited = await api.generateWithGemini({
  prompt: 'Put the person in this room',
  inputImages: [person, room],
  model: 'gemini-3-pro-image',
  imageSize: '2K',
});

for (const part of extractGeminiParts(edited)) {
  if (part.type === 'image') console.log(part.mimeType, part.data.length);
  else console.log(part.content);
}
```

**`generateWithGemini(params)`**

| Param | Type | Notes |
|---|---|---|
| `prompt` | `string` | Required |
| `model` | `string` | Default `DEFAULT_IMAGE_MODEL`. Any id is accepted ([Model lifecycle](#model-lifecycle)). |
| `aspectRatio` | `string` | Sent as `imageConfig.aspectRatio`. Omit for the model's default framing. Per-model values: [Models](#models). |
| `imageSize` | `string` | Sent as `imageConfig.imageSize`. Per-model values: [Models](#models). |
| `inputImages` | `InlineData[]` | `{ mimeType, data }` (base64). Per-model limit: [Models](#models). |
| `mode` | `GeminiMode` | Optional; detected from `inputImages` |

Every request also sends `responseModalities: ['TEXT', 'IMAGE']`. The response is the SDK's; `extractGeminiParts(response, { includeThoughts })` flattens `candidates[0].content.parts` into `{ type: 'text', content }` / `{ type: 'image', mimeType, data }`, skipping interim "thinking" parts unless asked. A response with no image (for example `finishReason: 'IMAGE_SAFETY'`) is returned as-is, with a warning naming the finish reason — check `parts.length`.

## Validation

Both clients check parameters before any network call.

- **Shape rules** apply to every model id and always throw: a prompt is present and not too long; each input image has data and a well-formed `image/…` MIME type; `aspectRatio` looks like `W:H`; `imageSize` looks like `512` / `2K` (uppercase K); Veo `resolution`, `durationSeconds` and `personGeneration` are well-formed; Veo `seed` is rejected.
- **Capability rules** apply to cataloged models: the value is in the model's list, the input count is within its limit, the Veo mode is one the model supports, 1080p/4k use an 8-second duration.

A violation throws `ValidationError` (an `Error`; `violations` lists every problem, each tagged `shape` or `capability`). Capability rules come from Google's docs, which have been wrong before, so they can be downgraded:

```typescript
import { GoogleGenAIAPI, ValidationError } from 'google-genai-api';

const api = new GoogleGenAIAPI(apiKey, 'info', { capabilityValidation: 'warn' });
// A capability violation is now logged and the request is sent anyway.
// Shape violations still throw.

try {
  await new GoogleGenAIAPI(apiKey).generateWithGemini({ prompt: 'x', model: 'gemini-3.1-flash-lite-image', imageSize: '2K' });
} catch (e) {
  if (e instanceof ValidationError) console.log(e.violations); // [{ kind: 'capability', param: 'imageSize', allowed: [...], ... }]
}
```

Without a client, from `google-genai-api/config`: `getModelViolations(model, params)` and `getVeoViolations(model, params, mode)` return the violations; `validateModelParams` and `validateVeoParams` throw on the first one (their 1.x contract).

## Video generation (Veo)

```typescript
import { GoogleGenAIVeoAPI, VEO_MODELS } from 'google-genai-api/veo';
import { imageToVeoInput } from 'google-genai-api/utils';

const veo = new GoogleGenAIVeoAPI(apiKey);

// Text-to-video
let op = await veo.generateVideo({ prompt: 'a butterfly in a garden', resolution: '1080p', durationSeconds: '8' });

// Image-to-video
op = await veo.generateFromImage({ prompt: 'the cat wakes up', image: await imageToVeoInput('./cat.png') });

// Reference images (3.1 / Fast), first-to-last-frame interpolation, extension (3.1 / Fast)
op = await veo.generateWithReferences({ prompt: '…', referenceImages: [{ image: await imageToVeoInput('./dress.png'), referenceType: 'asset' }] });
op = await veo.generateWithInterpolation({ firstFrame: await imageToVeoInput('./a.png'), lastFrame: await imageToVeoInput('./b.png'), model: VEO_MODELS.VEO_3_1_LITE });

op = await veo.waitForCompletion(op, { onProgress: (_op, ms) => console.log(`${ms / 1000}s`) });
await veo.downloadVideo(op, './out.mp4');
op = await veo.extendVideo({ prompt: 'the butterfly lands', video: veo.extractVideo(op).video });
```

`VeoGenerateParams`: `prompt`, `model`, `aspectRatio`, `resolution`, `durationSeconds` (string or number; sent as a number), `negativePrompt`, `personGeneration`. Per-model values: [Models](#models). Modes keep fixed settings the API requires: reference images and interpolation always use 8 seconds; extension always uses 720p and one video.

**Polling.** `waitForCompletion` polls every 10 s for up to 60 attempts. Only a failed *poll request* is retried (network error, timeout, 408/429/5xx). A job that finished with an error is thrown at once. If polling runs out, the error has `isTimeout: true` and `operationName` — the job may still finish; Google keeps generated videos for 48 hours.

`getModelInfo(model?)` returns a cataloged model's constraints and throws for an uncataloged id.

## Video understanding

```typescript
import { GoogleGenAIVideoAPI } from 'google-genai-api';

const video = new GoogleGenAIVideoAPI(apiKey);
const file = await video.uploadVideoFile('./clip.mp4'); // Files API, up to 200 MB
const result = await video.generateFromVideo({
  prompt: 'What happens between 0:30 and 1:30?',
  fileUri: file.uri,
  mimeType: file.mimeType,
  videoMetadata: { startOffset: '30s', endOffset: '1:30' },
});
await video.deleteVideoFile(file.uri); // best-effort
```

Offsets accept `"90s"`, `"90"`, `"1m30s"`, `"1:30"`, `"1:15:30"`. Supported formats are in `VIDEO_MIME_TYPES` (`google-genai-api/config`).

## Errors

**Outside production** (`NODE_ENV` ≠ `production`), a failed API call rethrows the SDK's own error object — same class, `name` and message as 1.x — with up to four properties added (`status` and `code` only when there is one):

| Property | Meaning |
|---|---|
| `status` | HTTP status, for HTTP failures |
| `code` | gRPC code, for a Veo job that failed |
| `classification` | `AUTH`, `TRANSIENT`, `USER_ACTIONABLE`, `SAFETY_BLOCKED`, `AUDIO_BLOCKED`, `NETWORK`, `TIMEOUT` |
| `surface` | `image` or `video` |

**In production**, the caller gets a new `Error` with the same properties and a message that names the category, for example:

```
Image generation failed (HTTP 400): Image size 2K is not supported for this model
Video generation failed: authentication or permission failure (HTTP 403).
Image generation failed: a temporary error occurred (HTTP 429). Please try again.
```

Only Google's own `error.message` is ever included, and only for rejected requests and safety blocks — never the body's `details` (which can carry project and quota identifiers), never text from a non-Gemini response such as a proxy's HTML page, never for authentication or rate-limit failures, and no `cause` (Node prints cause chains). Validation errors are thrown before any API call and are never rewritten.

This applies to `GoogleGenAIAPI` (images) and `GoogleGenAIVeoAPI`. **`GoogleGenAIVideoAPI` (video understanding) keeps its 1.x error handling:** generic messages in production ("A temporary error occurred…"), and none of the properties above.

> **Logs are not sanitized.** On failure the clients log the SDK's full error message — including any `details` — at `error` level, in every environment, as 1.x did. That reaches your logs, not your callers. Set the log level (second constructor argument, or `--log-level`) accordingly.

## Public API

Types for everything below — `GeminiGenerateParams`, `GeminiResponse`, `VeoGenerateParams`, `VeoOperation`, `ModelConstraint`, `Violation`, … — are exported from the root: `import type { … } from 'google-genai-api'`.

### `google-genai-api`

```typescript
import {
  GoogleGenAIAPI,       // image generation and editing
  GoogleGenAIVideoAPI,  // video understanding
  extractGeminiParts,   // flatten a response into text/image parts
  ValidationError,      // thrown before any API call
} from 'google-genai-api';
```

### `google-genai-api/veo`

```typescript
import {
  GoogleGenAIVeoAPI,
  VEO_MODELS,
  VEO_MODES,
  VEO_TIMEOUTS,
  getGoogleGenAIApiKey,
} from 'google-genai-api/veo';
```

### `google-genai-api/video`

```typescript
import { GoogleGenAIVideoAPI, getGoogleGenAIApiKey } from 'google-genai-api/video';
```

### `google-genai-api/config`

```typescript
import {
  // catalog
  MODELS,
  DEFAULT_IMAGE_MODEL,
  MODEL_CONSTRAINTS,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  SUPPORTED_IMAGE_MIME_TYPES,
  GEMINI_MODES,
  VEO_MODELS,
  VEO_MODEL_CONSTRAINTS,
  VEO_ASPECT_RATIOS,
  VEO_RESOLUTIONS,
  VEO_DURATIONS,
  VEO_MODES,
  VEO_PERSON_GENERATION,
  VEO_TIMEOUTS,
  VIDEO_MIME_TYPES,
  VIDEO_SIZE_LIMITS,
  VIDEO_TIMEOUTS,
  DEFAULT_OUTPUT_DIR,
  // validation
  ValidationError,
  getModelViolations,
  getVeoViolations,
  validateModelParams,
  validateVeoParams,
  validateVideoParams,
  isKnownImageModel,
  isKnownVeoModel,
  detectGeminiMode,
  // keys and helpers
  getGoogleGenAIApiKey,
  validateApiKeyFormat,
  redactApiKey,
  parseTimeOffset,
} from 'google-genai-api/config';
```

### `google-genai-api/utils`

```typescript
import {
  imageToInlineData,     // local path or HTTPS URL → { mimeType, data }
  imageToVeoInput,       // local path → { imageBytes, mimeType }
  validateImageUrl,      // SSRF checks (see Security)
  validateImagePath,     // magic-byte check
  validateVideoPath,     // format, size, magic bytes
  saveBase64Image,
  saveMetadata,
  saveVeoMetadata,
  parseVeoMetadata,
  generateFilename,
  generateVeoOutputPath,
  ensureDirectory,
  extractVideoMetadata,
  formatTimeOffset,
  createSpinner,
  createVeoSpinner,
  setLogLevel,
  logger,
  pause,
} from 'google-genai-api/utils';
```

Both client classes take `(apiKey, logLevel = 'info', options?)`; `options.capabilityValidation` is `'error'` (default) or `'warn'`.

## CLI

```bash
google-genai <mode> --prompt "…" [options]
```

| Mode | |
|---|---|
| `--gemini` | Image generation/editing with `--model` (default `gemini-3.1-flash-image`) |
| `--model <id>` | Image model; implies image mode. Any id is sent (uncataloged ids with a warning). |
| `--gemini-3-pro` | Shorthand for `--model gemini-3-pro-image` |
| `--veo` | Video generation |
| `--video` | Video understanding (needs `--input-video`) |

| Option | |
|---|---|
| `-p, --prompt <text...>` | One or more prompts (each is a separate request) |
| `-i, --input-image <path>` | Input/reference image; repeat for several |
| `-a, --aspect-ratio <ratio>` | Omit for the model's default framing |
| `--image-size <size>` | `512`, `1K`, `2K`, `4K` — per model |
| `--capability-validation <mode>` | `error` (default) or `warn` |
| `--veo-model`, `--veo-aspect-ratio`, `--veo-resolution`, `--veo-duration` | Veo settings; defaults `veo-3.1-generate-preview`, `16:9`, `720p`, `8` |
| `--veo-negative-prompt`, `--veo-image`, `--veo-person-generation` | Veo settings; no default |
| `--input-video`, `--video-start`, `--video-end` | Video understanding |
| `-o, --output-dir <path>` | Default `datasets/google`, or `GOOGLE_GENAI_OUTPUT_DIR` |
| `--api-key`, `--log-level` | |
| `--examples` | Worked examples |

The CLI exits 1 on a validation error, an API error, or a run that returns no image (the message names the `finishReason`).

```bash
google-genai --model gemini-3.1-flash-lite-image --prompt "a flat paper-plane icon"
google-genai --gemini-3-pro --prompt "hyper-real mountain lake" --image-size 4K
google-genai --veo --veo-model veo-3.1-lite-generate-preview --prompt "rain on a window" --veo-resolution 1080p --veo-duration 8
google-genai --veo --prompt "the cat stretches" --veo-image ./cat.png
google-genai --video --input-video ./clip.mp4 --prompt "Summarize" --prompt "List key moments with timestamps"
```

## Output files

The CLI writes under `--output-dir` (default `datasets/google`), one directory per model:

```
datasets/google/
├── gemini-3.1-flash-image/
│   ├── 20260922_101530_a-red-apple.png
│   └── 20260922_101530_a-red-apple.json
├── veo/veo-3.1-generate-preview/
│   ├── 20260922_102210_waves-at-dusk.mp4
│   └── 20260922_102210_waves-at-dusk.json
└── video-analysis/
```

When a response holds several images they are saved as `…_1.png`, `…_2.png`. Image metadata:

```json
{
  "model": "gemini-3.1-flash-image",
  "timestamp": "2026-09-22T10:15:30.123Z",
  "prompt": "a red apple",
  "parameters": { "aspectRatio": "16:9", "imageSize": "2K" },
  "finishReason": "STOP",
  "outputs": [{ "type": "image", "filename": "20260922_101530_a-red-apple.png" }],
  "text": []
}
```

`outputs` lists the files actually written (1.x regenerated names here that did not match).

## Security

- **API keys** are logged only redacted (last four characters), and only at `debug`.
- **Image URLs** (`imageToInlineData`, `--input-image`) must be HTTPS. The URL host is rejected if it is `localhost`, a cloud metadata host (`metadata.google.internal`, `169.254.169.254`), or a private, loopback or link-local address, including IPv4-mapped IPv6 forms like `[::ffff:127.0.0.1]`. A hostname is resolved first and rejected if it resolves to such an address.
- **Downloads** time out after 60 s, are capped at 50 MB, follow at most 5 redirects, and must be PNG, JPEG, WebP or GIF both by `Content-Type` and by magic bytes; the type sent to Gemini is the one the bytes show. Local files are checked by magic bytes.
- **Error messages** in production are limited as described in [Errors](#errors).

See [Known limitations](#known-limitations) for what the URL checks do not cover.

## Known limitations

- **SSRF check resolves once, first address only.** The hostname is resolved and its first address checked; the download then resolves again. A hostname with several addresses, or one whose answer changes between the check and the download, is not fully covered. Do not pass untrusted URLs to `imageToInlineData` on a network where that matters.
- **No timeout on API calls.** Generation calls use the SDK's defaults; only image downloads (60 s) and the video-file delete (30 s) set their own.
- **No total-size check on input images.** Validation checks the count; the Gemini API rejects requests over its inline size limit. Only three input images have been exercised live.
- **The constraint tables come from Google's docs and a set of live probes** (one key, one region, 2026-09-22). `capabilityValidation: 'warn'` exists because the docs have been wrong. Regional `personGeneration` limits are not modeled.
- **A vendor field this package does not declare cannot be sent.** The SDK only serializes fields it knows; new ones arrive in a release.
- **SDK drift is detected weekly, not prevented.** The package depends on `@google/genai ^2.24.0`; a new 2.x minor is tested by the weekly workflow, not at your install.
- **Every Veo model is a Google preview.**
- **Logs include full SDK error messages** ([Errors](#errors)).
- **Video understanding errors are still 1.x-shaped.** `GoogleGenAIVideoAPI` was not moved to the 2.0 error handling; its errors carry no `classification` or `status` ([Errors](#errors)).

## Troubleshooting

**`GOOGLE_GENAI_API_KEY not found`** — set the variable or create a `.env` ([Authentication](#authentication)).

**`… (HTTP 403)`, or "API key was reported as leaked"** — Google has disabled that key; create a new one.

**`Invalid aspect ratio` / `Invalid imageSize` / `accepts at most N input images`** — the value is not in that model's list ([Models](#models)). If Google has started accepting it, pass `capabilityValidation: 'warn'` (`--capability-validation warn`).

**`returned no image (finishReason: IMAGE_SAFETY)`** — the prompt or input was blocked; rephrase. Other finish reasons are listed in Google's docs.

**`seed was removed in 2.0`** — the Gemini Developer API does not support Veo seeds; remove it.

**`Model '…' is not in this package's catalog`** — a warning, not an error: the request was sent. Check the id if it was a typo.

**Veo `timed out after …`** — the job may still complete; retry `waitForCompletion` with the same operation.

## Development

```bash
git clone https://github.com/aself101/google-genai-api.git && cd google-genai-api
npm install
npm run verify           # typecheck (source and tests), build, test
npm run check:lifecycle  # cataloged models vs Google's deprecations page
npm run readme:tables    # re-render the generated README tables
node dist/cli.js --help
```

Tests run offline. Most mock the SDK; `test/wire.test.ts` runs the real SDK serializer against a stubbed `fetch` and checks the request body, and `test/cli.test.ts` runs the built CLI in a subprocess against canned responses.

**Releasing** is manual. `npm publish` runs `check:release`, which refuses unless `CHANGELOG.md` has a heading for the version and an empty `[Unreleased]`, the build succeeds, the tarball holds only `package.json`, `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `check:lifecycle` passes (it needs network; `npm run check:release -- --offline` uses the committed snapshot of Google's page).

## Maintainer notes

- `.github/workflows/sdk-drift.yml` runs weekly: the full suite against the newest `@google/genai` 2.x, and `check:lifecycle` against Google's live page. A failure opens an issue labeled `sdk-drift` or `model-lifecycle`. GitHub disables scheduled workflows in public repositories after 60 days without activity — re-enable it under Actions if it has gone quiet.
- When `check:lifecycle` fails: remove the model from the catalog (constants, constraints, types, CLI examples) in the next release. Its id keeps working through passthrough until Google turns it off.

## Related packages

- [`openai-image-api`](https://github.com/aself101/openai-image-api) — OpenAI GPT Image
- [`bfl-api`](https://github.com/aself101/bfl-api) — Black Forest Labs FLUX
- [`kling-api`](https://github.com/aself101/kling-api) — Kling video and image
- [`ideogram-api`](https://github.com/aself101/ideogram-api) — Ideogram
- [`stability-ai-api`](https://github.com/aself101/stability-ai-api) — Stability AI

This project is an independent wrapper and is not affiliated with Google.

## License

MIT — see [LICENSE](LICENSE).
