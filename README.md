# google-genai-api

[![npm version](https://img.shields.io/npm/v/google-genai-api.svg)](https://www.npmjs.com/package/google-genai-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/google-genai-api)](https://nodejs.org)

A TypeScript/Node.js wrapper and CLI for the [Gemini Developer API](https://ai.google.dev/gemini-api/docs): image generation and editing with the current Gemini (Nano Banana) image models, video generation and conversational video editing with Gemini Omni, and video understanding with Gemini. Built on the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK (2.x).

> **Upgrading from 2.x?** Google shut down every Veo model on 2026-10-22, so `google-genai-api/veo` is gone; video generation is now [Gemini Omni](#video-generation-omni) (`google-genai-api/omni`, CLI `--omni`). The default image model is now Nano Banana 2.1, and video understanding moved to `gemini-3.8-flash`. See [Upgrading to 3.0](#upgrading-to-30). Coming from 1.x, read [Upgrading to 2.0](#upgrading-to-20) too.

## Quick Start

Requires Node.js ≥ 20 and a Gemini API key ([Authentication](#authentication)).

### CLI

```bash
npm install -g google-genai-api
export GOOGLE_GENAI_API_KEY="your-api-key"

# Image (default model: gemini-nano-banana-2.1)
google-genai --gemini --prompt "a serene mountain landscape" --aspect-ratio 16:9

# Edit with several reference images, at 2K
google-genai --gemini --prompt "put the person in the room" -i person.jpg -i room.jpg --image-size 2K

# Video with Gemini Omni — prints an interaction id you can pass back to edit the video
google-genai --omni --prompt "waves crashing against a lighthouse at dusk" --omni-duration 8
google-genai --omni --prompt "Make it night. Keep everything else the same." --omni-previous <interaction-id>

# Video understanding
google-genai --video --input-video ./clip.mp4 --prompt "Summarize this video"
```

### Programmatic

```typescript
import { GoogleGenAIAPI, GoogleGenAIVideoAPI, extractGeminiParts } from 'google-genai-api';
import { GoogleGenAIOmniAPI } from 'google-genai-api/omni';

const images = new GoogleGenAIAPI(process.env.GOOGLE_GENAI_API_KEY!);
const response = await images.generateWithGemini({
  prompt: 'a serene mountain landscape',
  aspectRatio: '16:9',
  imageSize: '2K',
});
const parts = extractGeminiParts(response); // [{ type: 'image', mimeType, data }, ...]

const omni = new GoogleGenAIOmniAPI(process.env.GOOGLE_GENAI_API_KEY!);
const clip = await omni.generate({ prompt: 'a cat playing piano', durationSeconds: 8 });
await omni.saveVideo(clip, './cat.mp4');
const edited = await omni.generate({ prompt: 'Give the cat a top hat.', previousInteractionId: clip.interactionId });
await omni.saveVideo(edited, './cat-hat.mp4');

const video = new GoogleGenAIVideoAPI(process.env.GOOGLE_GENAI_API_KEY!);
const file = await video.uploadVideoFile('./clip.mp4');
const analysis = await video.generateFromVideo({ prompt: 'Summarize this video', fileUri: file.uri, mimeType: file.mimeType });
```

## Table of Contents

- [Upgrading to 3.0](#upgrading-to-30)
- [Upgrading to 2.0](#upgrading-to-20)
- [Models](#models)
- [Model lifecycle](#model-lifecycle)
- [Installation](#installation)
- [Authentication](#authentication)
- [Image generation](#image-generation)
- [Validation](#validation)
- [Video generation (Omni)](#video-generation-omni)
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

## Upgrading to 3.0

3.0 exists because Google shut down every Veo model on the Gemini API on 2026-10-22 — 2.x's video generation has failed on every call since — and named Gemini Omni Flash as the replacement. Omni is not a new Veo: it runs on a different API (Interactions, not a long-running `generateVideos` operation), returns the video from one synchronous call, and edits or extends earlier videos in later turns. So the Veo client is removed rather than repointed. Every other change is a model Google superseded or scheduled for shutdown. The full list is in the [CHANGELOG](CHANGELOG.md).

| 2.x | 3.0 |
|---|---|
| `import { GoogleGenAIVeoAPI } from 'google-genai-api/veo'` | `import { GoogleGenAIOmniAPI } from 'google-genai-api/omni'`. The `./veo` subpath is gone (`ERR_PACKAGE_PATH_NOT_EXPORTED`). |
| `generateVideo` / `generateFromImage` / `generateWithReferences` / `generateWithInterpolation` / `extendVideo` | One `generate(params)`. Omni reads the mode from the prompt and inputs: say what each image is for ("first frame", "the character in the reference image"). |
| `waitForCompletion(op)` + `downloadVideo(op, path)` | `generate` resolves when the video is done; `saveVideo(result, path)` writes it. |
| `extendVideo({ video })` | `generate({ prompt: 'Extend this video…', previousInteractionId })` — or edit it the same way. 3-10 s per turn, up to 30 s total. |
| `VEO_MODELS`, `VEO_MODEL_CONSTRAINTS`, `VEO_*` constants, `getVeoViolations`, `validateVeoParams`, `isKnownVeoModel`, all `Veo*` types | `OMNI_MODELS`, `OMNI_MODEL_CONSTRAINTS`, `OMNI_*`, `getOmniViolations`, `validateOmniParams`, `isKnownOmniModel`, `Omni*` types |
| `imageToVeoInput(path)` → `{ imageBytes, mimeType }` | `imageToInlineData(path)` → `{ data, mimeType }`, passed in `images` |
| `durationSeconds: '4' \| '6' \| '8'` | Any whole number 3-15 (default 10); 3-10 with first+last frame or when extending |
| `resolution`: `720p`, `1080p`, `4k` | `360p`, `720p`, `1080p`, `4k` (1080p and 4k are upscaled) |
| `negativePrompt`, `personGeneration`, `seed` | Not supported by Omni; passing one throws `ValidationError`. Write negatives into the prompt ("No dialogue"). |
| `saveVeoMetadata`, `parseVeoMetadata`, `generateVeoOutputPath`, `createVeoSpinner` | Removed. The CLI writes its own metadata (`interaction_id`, parameters). |
| CLI `--veo`, `--veo-*` | `--omni`, `--omni-aspect-ratio`, `--omni-resolution`, `--omni-duration`, `--omni-image` (repeatable), plus `--omni-previous`, `--omni-video`, `--omni-task`, `--omni-delivery`. A 2.x command line exits 1 with this mapping. |
| Default image model `gemini-3.1-flash-image` | `gemini-nano-banana-2.1` (Google: "recommended for all new projects"). Pass `model: 'gemini-3.1-flash-image'` to keep 2.x output; it is still cataloged. Nano Banana 2.1 has no `512` size. |
| Video understanding on `gemini-2.5-flash` (shuts down 2026-12-01) | `gemini-3.8-flash` |
| `@google/genai ^2.24.0` | `^2.32.0` (still 2.x; Node ≥ 20 unchanged) |

## Upgrading to 2.0

This table records the 1.x → 2.0 step; its Veo rows describe 2.x, which 3.0 replaced with Omni ([Upgrading to 3.0](#upgrading-to-30)). 2.0 exists because Google retired most of what 1.x wrapped, and because 1.x never sent the aspect ratio you passed. Nothing below was removed on this package's own initiative: every removal is a model Google shut down or announced a shutdown for. The full list is in the [CHANGELOG](CHANGELOG.md).

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
| Veo polling retried 429/502/503 and any error whose message contained "network" or "timeout" | Retries only a failed poll request (network error, timeout, 408, 429, any 5xx); a job that finished with an error is thrown at once. (Veo itself is gone in 3.0: [Upgrading to 3.0](#upgrading-to-30).) |
| Video upload polling retried any error whose message contained "network", "timeout" or "processing" | Retries only a failed poll request, as Veo does; a 429 still waits 60 s |
| Production errors: one generic sentence | Category sentence plus Google's own message for rejected requests; `status`, `classification` etc. on every error. See [Errors](#errors). |
| Types not importable | `import type { GeminiGenerateParams, … } from 'google-genai-api'` |
| CLI `--imagen`, `-n/--number-of-images` | `--gemini` / `--model <id>`; one image per call |
| CLI `--aspect-ratio` defaulted to `1:1` | No default |
| CLI exited 0 when no image came back | Exits 1, naming the `finishReason` |

## Models

The package catalogs **current models only** — those Google has announced no shutdown for. Values below are generated from the package's constraint tables (`MODEL_CONSTRAINTS`, `OMNI_MODEL_CONSTRAINTS`), which come from Google's model pages and live probes; if Google accepts something the table does not, see [`capabilityValidation`](#validation).

### Image models

<!-- generated:image-models -->
| Model | Aspect ratios | `imageSize` | Input images |
|---|---|---|---|
| `gemini-nano-banana-2.1` (default) | all 14 | `1K`, `2K`, `4K` | up to 14 |
| `gemini-3.1-flash-image` | all 14 | `512`, `1K`, `2K`, `4K` | up to 14 |
| `gemini-3.1-flash-lite-image` | all 14 | `1K` | up to 14 |
| `gemini-3-pro-image` | `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1K`, `2K`, `4K` | up to 14 |

All aspect ratios: `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1`. All sizes: `512`, `1K`, `2K`, `4K` (uppercase K).
<!-- /generated:image-models -->

At the extreme ratios (`1:4`, `4:1`, `1:8`, `8:1`) Flash and Lite return the exact dimensions but often fill the frame with two or three repeated panels of the scene rather than one composition — model behaviour, seen in the live battery.

`imageSize` is a resolution tier, not a fixed edge: on `gemini-3.1-flash-image`, `2K` gave 2048×2048 at `1:1` and 2816×1536 at the model's default framing (live, 2026-09-22). All images carry Google's SynthID watermark.

`gemini-nano-banana-2.1` is Google's update to Nano Banana 2 (`gemini-3.1-flash-image`) and its recommendation for new work. Its row was checked live on 2026-11-08 at every ratio and size: 1:1 gives 1024², 2048², 4096²; 16:9 at `1K` gives 1376×768; `512` is refused by Google ("Image size 512 is not supported for this model").

### Omni models

<!-- generated:omni-models -->
| Model | Aspect ratios | Resolutions | Duration (s) | First+last frame / extension (s) | Images | Edit | Extend | Audio |
|---|---|---|---|---|---|---|---|---|
| `gemini-omni-1.2-flash` (default) | `16:9`, `9:16` | `360p`, `720p`, `1080p`, `4k` | 3-15 (default 10) | 3-10; extended up to 30 total | up to 6 | yes | yes | yes |
<!-- /generated:omni-models -->

Up to 6 reference images (at most 3 per character, 2 characters). An input video to edit can be up to 15 s; extension continues from its last 10 s. Omni does not take a negative prompt, system instructions or temperature. Editing or extending an *uploaded* video is not available in the EEA, Switzerland or the UK (editing videos Omni generated is). `gemini-omni-1.1-flash` is not cataloged: from 2026-12-03 Google routes it to 1.2.

### Video understanding

<!-- generated:video-model -->
Video understanding uses `gemini-3.8-flash`.
<!-- /generated:video-model -->

## Model lifecycle

- **Current models only.** A model is in the catalog if it generates and Google's [deprecations page](https://ai.google.dev/gemini-api/docs/deprecations) shows no shutdown date for it. When Google announces one, the model is removed in the next release.
- **Removal never cuts you off early.** Any string is accepted as an image or Omni model id (video understanding uses a fixed model, below). An id the package does not catalog — a model newer than this release, or a retired one Google still serves — is sent with a one-time warning per client, with shape checks only (see [Validation](#validation)). `gemini-2.5-flash-image` keeps working this way until Google turns it off on 2027-03-15.
- **Checked automatically.** `npm run check:lifecycle` fails if a cataloged model has a shutdown date or is missing from Google's page. It runs weekly in CI and before every publish.
- `isKnownImageModel(id)` / `isKnownOmniModel(id)` tell you whether an id is cataloged. `MODEL_CONSTRAINTS` and `OMNI_MODEL_CONSTRAINTS` are keyed by string, so looking up a removed id compiles and returns `undefined` — check with the guard first.

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

- **Shape rules** apply to every model id and always throw: a prompt is present and not too long; each input image has data and a well-formed `image/…` MIME type; `aspectRatio` looks like `W:H`; `imageSize` looks like `512` / `2K` (uppercase K); Omni `resolution`, `durationSeconds` (whole seconds), `task` and `delivery` are well-formed, each image or video has exactly one of `data` and `uri`; the 2.x video parameters `negativePrompt`, `personGeneration` and `seed` are rejected.
- **Capability rules** apply to cataloged models: the value is in the model's list, the input count is within its limit, an Omni duration is 3-15 s. The 10-second ceiling for first+last frame and extension is left to the API: Omni decides from the prompt which of those a request is.

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

Without a client, from `google-genai-api/config`: `getModelViolations(model, params)` and `getOmniViolations(model, params)` return the violations; `validateModelParams` throws on the first one (its 1.x contract) and `validateOmniParams` on any.

## Video generation (Omni)

```typescript
import { GoogleGenAIOmniAPI } from 'google-genai-api/omni';
import { imageToInlineData } from 'google-genai-api/utils';

const omni = new GoogleGenAIOmniAPI(apiKey);

// Text-to-video
const first = await omni.generate({ prompt: 'A woman playing violin outdoors.', durationSeconds: 8, resolution: '1080p' });
await omni.saveVideo(first, './violin.mp4');

// Edit it, then extend it — each turn is a new video
const edited = await omni.generate({ prompt: 'Make the violin invisible. Keep everything else the same.', previousInteractionId: first.interactionId });
const longer = await omni.generate({ prompt: 'Extend this video: she takes a bow.', previousInteractionId: edited.interactionId, durationSeconds: 5 });

// Images: say in the prompt what each one is for
const start = await imageToInlineData('./forest-day.png');
const end = await imageToInlineData('./forest-night.png');
const transition = await omni.generate({ prompt: 'Transition from the first frame to the last frame.', images: [start, end], durationSeconds: 6 });
```

**`generate(params)`** returns `{ interactionId, model, status, video: { mimeType, data? , uri? }, text? }`.

| Param | Type | Notes |
|---|---|---|
| `prompt` | `string` | Required. Omni infers the mode from it and the inputs. |
| `model` | `string` | Default `gemini-omni-1.2-flash`; any id is accepted ([Model lifecycle](#model-lifecycle)) |
| `images` | `({ data, mimeType } \| { uri })[]` | In the order the prompt refers to them; up to 6 |
| `video` | `{ uri } \| { data, mimeType }` | A video to edit or extend (up to 15 s). Upload with `GoogleGenAIVideoAPI.uploadVideoFile`. |
| `previousInteractionId` | `string` | Edit or extend the video an earlier call produced |
| `aspectRatio`, `resolution`, `durationSeconds` | | Sent as `response_format`; values: [Omni models](#omni-models) |
| `task` | `OmniTask` | Mode fallback (`generation_config.video_config.task`). Google: try the prompt first. **Not with `previousInteractionId`** — the API rejects the pair; to edit or extend with a task, pass `video`. |
| `delivery` | `'inline' \| 'uri'` | `uri` returns a Files API link instead of base64. Google recommends it over 4 MB, but inline returned 6 MB (4k, 3 s) and 8 MB (360p, 15 s) without trouble live. `saveVideo` handles both. |
| `store` | `boolean` | `false` is faster, but the result can then not be continued. **Google does not reject a later `previousInteractionId` for it**: it silently generates a new, unrelated video, and bills for it (live 2026-11-08). |
| `timeoutMs` | `number` | Default `OMNI_TIMEOUTS.REQUEST` (15 min) |

Wall time observed live (3 s clips): 360p ≈ 14 s, 720p ≈ 20 s, 1080p ≈ 38 s, 4k ≈ 91 s; 4k at 15 s took 213 s. An extension returns the whole video (3 s + 10 s → 13 s).

**One call, never retried.** `generate` is synchronous: it resolves when the video exists. It is never retried automatically, because every attempt is a billed generation — the SDK's Interactions client otherwise retries a 503 up to four times. An interaction that completes without a video (for example, refused by safety filters) throws with `interactionId` and whatever text the model returned.

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

**Outside production** (`NODE_ENV` ≠ `production`), a failed API call rethrows the SDK's own error object — same class, `name` and message as 1.x — with up to four properties added (`status` and `code` only when there is one; none on an error object that is frozen or sealed, which is rethrown as is):

| Property | Meaning |
|---|---|
| `status` | HTTP status, for HTTP failures |
| `code` | gRPC code, for a failed long-running operation (none of the 3.0 clients produce one; kept for compatibility) |
| `classification` | `AUTH`, `TRANSIENT`, `USER_ACTIONABLE`, `SAFETY_BLOCKED`, `AUDIO_BLOCKED`, `NETWORK`, `TIMEOUT` |
| `surface` | `image` (`GoogleGenAIAPI`), `video` (`GoogleGenAIOmniAPI`) or `video-understanding` (`GoogleGenAIVideoAPI`) |

**In production**, the caller gets a new `Error` with the same properties and a message that names the category, for example:

```text
Image generation failed (HTTP 400): Image size 2K is not supported for this model
Video generation failed: authentication or permission failure (HTTP 403).
Image generation failed: a temporary error occurred (HTTP 429). Please try again.
Video generation failed (HTTP 402): Your prepayment credits are depleted. Please go to AI Studio …
```

Only Google's own `error.message` is ever included, and only for rejected requests and safety blocks — never the body's `details` (which can carry project and quota identifiers), never text from a non-Gemini response such as a proxy's HTML page, never for authentication or rate-limit failures, and no `cause` (Node prints cause chains). Validation errors are thrown before any API call and are never rewritten.

All three clients work this way. One exception, kept from 1.x: when `GoogleGenAIVideoAPI.generateFromVideo` is given a file it cannot find, it throws a message of its own in every environment, classified `USER_ACTIONABLE`, with the properties above set. On a 404 that is 1.x's `Video file not found. The file may have expired (files expire after 48 hours) or was deleted.` Google usually answers a missing file with 403 `PERMISSION_DENIED` ("You do not have permission to access the File … or it may not exist"), which also covers a file from another project, so that case reads `Video file not found or not accessible with this API key. It may have expired (files expire after 48 hours), been deleted, or belong to another project.` A poll that runs out of attempts (an Omni `uri` video that never becomes ACTIVE, or video upload processing) throws the package's own timeout error with `isTimeout: true`, not a rewritten one. The Omni client reads Google's message from the Interactions client's error body (a JSON array), where the other clients find it in the error message.

> **Logs are not sanitized.** On failure the clients log the SDK's full error message — including any `details` — at `error` level, in every environment, as 1.x did. That reaches your logs, not your callers. Set the log level (second constructor argument, or `--log-level`) accordingly.

## Public API

Types for everything below — `GeminiGenerateParams`, `GeminiResponse`, `OmniGenerateParams`, `OmniResult`, `ModelConstraint`, `Violation`, … — are exported from the root: `import type { … } from 'google-genai-api'`.

### `google-genai-api`

```typescript
import {
  GoogleGenAIAPI,       // image generation and editing
  GoogleGenAIVideoAPI,  // video understanding
  extractGeminiParts,   // flatten a response into text/image parts
  ValidationError,      // thrown before any API call
} from 'google-genai-api';
```

### `google-genai-api/omni`

```typescript
import {
  GoogleGenAIOmniAPI,
  OMNI_MODELS,
  OMNI_TIMEOUTS,
  getGoogleGenAIApiKey,
} from 'google-genai-api/omni';
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
  OMNI_MODELS,
  OMNI_MODEL_CONSTRAINTS,
  OMNI_ASPECT_RATIOS,
  OMNI_RESOLUTIONS,
  OMNI_TASKS,
  OMNI_TIMEOUTS,
  VIDEO_MIME_TYPES,
  VIDEO_SIZE_LIMITS,
  VIDEO_TIMEOUTS,
  DEFAULT_OUTPUT_DIR,
  // validation
  ValidationError,
  getModelViolations,
  getOmniViolations,
  validateModelParams,
  validateOmniParams,
  validateVideoParams,
  isKnownImageModel,
  isKnownOmniModel,
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
  validateImageUrl,      // SSRF checks (see Security)
  validateImagePath,     // magic-byte check
  validateVideoPath,     // format, size, magic bytes
  saveBase64Image,
  saveMetadata,
  generateFilename,
  ensureDirectory,
  extractVideoMetadata,
  formatTimeOffset,
  createSpinner,
  setLogLevel,
  logger,
  pause,
} from 'google-genai-api/utils';
```

`GoogleGenAIAPI` and `GoogleGenAIOmniAPI` take `(apiKey, logLevel = 'info', options?)`; `options.capabilityValidation` is `'error'` (default) or `'warn'`. `GoogleGenAIVideoAPI` takes `(apiKey, logLevel = 'info')`: it has no constraint table to validate against.

## CLI

```bash
google-genai <mode> --prompt "…" [options]
```

| Mode | |
|---|---|
| `--gemini` | Image generation/editing with `--model` (default `gemini-nano-banana-2.1`) |
| `--model <id>` | Image model; implies image mode. Any id is sent (uncataloged ids with a warning). |
| `--gemini-3-pro` | Shorthand for `--model gemini-3-pro-image` |
| `--omni` | Video generation and editing |
| `--video` | Video understanding (needs `--input-video`) |

| Option | |
|---|---|
| `-p, --prompt <text...>` | One or more prompts (each is a separate request) |
| `-i, --input-image <path>` | Input/reference image; repeat for several |
| `-a, --aspect-ratio <ratio>` | Omit for the model's default framing |
| `--image-size <size>` | `512`, `1K`, `2K`, `4K` — per model |
| `--capability-validation <mode>` | `error` (default) or `warn` |
| `--omni-model`, `--omni-aspect-ratio`, `--omni-resolution`, `--omni-duration` | Omni settings; Google's defaults when omitted (`gemini-omni-1.2-flash`, `16:9`, `720p`, 10 s) |
| `--omni-image <path>` | Image to animate, a first/last frame, or a reference; repeat (up to 6, in order) |
| `--omni-previous <id>` | Edit or extend the video of an earlier run (each run prints its id) |
| `--omni-video <path>` | Upload a video (up to 15 s) to edit or extend |
| `--omni-task`, `--omni-delivery` | Mode fallback; `inline` (default) or `uri` |
| `--input-video`, `--video-start`, `--video-end` | Video understanding |
| `-o, --output-dir <path>` | Default `datasets/google`, or `GOOGLE_GENAI_OUTPUT_DIR` |
| `--api-key`, `--log-level` | |
| `--examples` | Worked examples |

The CLI exits 1 on a validation error, an API error, a run that returns no image or no video analysis (the message names the `finishReason` or block reason), and when no mode is given. `--help` and `--examples` exit 0.

```bash
google-genai --model gemini-3.1-flash-lite-image --prompt "a flat paper-plane icon"
google-genai --gemini-3-pro --prompt "hyper-real mountain lake" --image-size 4K
google-genai --omni --prompt "rain on a window, single continuous shot" --omni-resolution 1080p --omni-duration 8
google-genai --omni --prompt "the cat in this photo wakes up and stretches" --omni-image ./cat.png
google-genai --video --input-video ./clip.mp4 --prompt "Summarize" --prompt "List key moments with timestamps"
```

## Output files

The CLI writes under `--output-dir` (default `datasets/google`), one directory per model:

```text
datasets/google/
├── gemini-nano-banana-2.1/
│   ├── 20261108_101530_a-red-apple.jpg
│   └── 20261108_101530_a-red-apple.json
├── omni/gemini-omni-1.2-flash/
│   ├── 20261108_102210_waves-at-dusk.mp4
│   └── 20261108_102210_waves-at-dusk.json   # interaction_id, parameters, bytes
└── video-analysis/
```

Images take the extension of the bytes the model returned — the current models return JPEG, so `.jpg` — and share their stem with the metadata file. When a response holds several images they are saved as `…_1.jpg`, `…_2.jpg`. Image metadata:

```json
{
  "model": "gemini-nano-banana-2.1",
  "timestamp": "2026-11-08T10:15:30.123Z",
  "prompt": "a red apple",
  "parameters": { "aspectRatio": "16:9", "imageSize": "2K" },
  "finishReason": "STOP",
  "outputs": [{ "type": "image", "filename": "20261108_101530_a-red-apple.jpg" }],
  "text": []
}
```

`outputs` lists the files actually written (1.x regenerated names here that did not match).

## Security

- **API keys** are logged only redacted (last four characters), and only at `debug`.
- **Image URLs** (`imageToInlineData`, `--input-image`) must be HTTPS and may not reach an internal address: `localhost`, the cloud metadata hosts, or any address in the loopback, private, link-local (incl. `169.254.169.254`), carrier-grade NAT, unique-local (`fc00::/7`), multicast or reserved ranges, including when written as IPv4-mapped (`[::ffff:a9fe:a9fe]`), IPv4-compatible (`[::169.254.169.254]`), NAT64, 6to4 or Teredo IPv6, or in numeric forms (`2130706433`, `0x7f.1`). The list of ranges is in `src/download-guard.ts`. The check runs three times: on the URL before downloading; **at connect time** on every address the hostname resolves to (so a second DNS answer, or one that changes after the first check, is caught); and on **every redirect**, which must stay HTTPS and pass the same address check.
- **Downloads** time out after 60 s, are capped at 50 MB, follow at most 5 redirects, and must be PNG, JPEG, WebP or GIF both by `Content-Type` and by magic bytes; the type sent to Gemini is the one the bytes show. Local files are checked by magic bytes.
- **Error messages** in production are limited as described in [Errors](#errors).

See [Known limitations](#known-limitations) for what the URL checks do not cover.

## Known limitations

- **The URL checks cover addresses, not proxies.** With `HTTPS_PROXY` set, the connection goes to the proxy and the target is resolved by the proxy, outside these checks. The IP ranges are a fixed list of special-purpose blocks; an internal network that uses public address space is not recognised as internal.
- **Few timeouts on API calls.** Omni generation is bounded (`OMNI_TIMEOUTS.REQUEST`, 15 min, overridable per call) and so are image downloads (60 s) and the video-file delete (30 s). Image generation, video understanding and the Omni `uri` download (the SDK's `files.download`) use the SDK's defaults, which set none.
- **Video understanding uses a fixed model**, `gemini-3.8-flash`, with no override. When Google retires it, every `generateFromVideo` call fails until a release moves it; `check:lifecycle` flags the announcement for the next release, not for installed copies.
- **Some Omni mistakes cost a generation instead of an error.** Continuing a `store: false` interaction silently makes a new video. Extending past 30 s in total fails only after about a minute of server time ("Request contains an invalid argument"). The client cannot check either one, because it does not know an earlier interaction's storage or length.
- **An Omni call that times out may still have been billed.** The request is synchronous; if the client gives up, Google may finish the video anyway, and there is no operation to resume. Raise `timeoutMs` for 4k or 15 s rather than retrying.
- **What has been exercised live.** 3.0: the battery in [docs/LIVE-BATTERY-2026-11-08.md](docs/LIVE-BATTERY-2026-11-08.md) (through the built package; one key, US region). It covered the Nano Banana 2.1 grid; every Omni aspect ratio, resolution and duration; every mode, task and delivery; editing and extension, including uploaded videos; video understanding on `gemini-3.8-flash`; the error surface; and the CLI. Image models and video understanding from 2.0: [docs/LIVE-BATTERY-2026-09-23.md](docs/LIVE-BATTERY-2026-09-23.md). **Not** exercised live: other regions (Omni's EEA/CH/UK limits), a 429 or a safety refusal on Omni, the rate-limit and long-processing branches of upload polling, and Pro's thought parts.
- **No total-size check on input images.** Validation checks the count; the Gemini API rejects requests over its inline size limit. Only three input images have been exercised live.
- **The constraint tables come from Google's docs and a set of live probes** (see the list above). `capabilityValidation: 'warn'` exists because the docs have been wrong. Omni's regional limits (uploaded-video editing in the EEA, CH, UK) are not modeled.
- **A vendor field this package does not declare cannot be sent.** The SDK only serializes fields it knows; new ones arrive in a release.
- **SDK drift is detected weekly, not prevented.** The package depends on `@google/genai ^2.32.0`; a new 2.x minor is tested by the weekly workflow, not at your install.
- **`@google/genai` 3.x is not supported yet.** It requires Node ≥ 22 and changes the default API version to `v1`; this release stays on 2.x so the Node floor does not move in the same major as the Omni switch.
- **Logs include full SDK error messages** ([Errors](#errors)).

## Troubleshooting

**`GOOGLE_GENAI_API_KEY not found`** — set the variable or create a `.env` ([Authentication](#authentication)).

**`… (HTTP 403)`, or "API key was reported as leaked"** — Google has disabled that key; create a new one.

**`Invalid aspect ratio` / `Invalid imageSize` / `accepts at most N input images`** — the value is not in that model's list ([Models](#models)). If Google has started accepting it, pass `capabilityValidation: 'warn'` (`--capability-validation warn`).

**`returned no image (finishReason: IMAGE_SAFETY)`** — the prompt or input was blocked; rephrase. Other finish reasons are listed in Google's docs.

**`negativePrompt is not supported by Gemini Omni`** (or `personGeneration`, `seed`) — a 2.x Veo parameter ([Upgrading to 3.0](#upgrading-to-30)); write negatives into the prompt ("No dialogue", "No text on screen").

**`--veo … removed in 3.0`** — Google shut Veo down; use `--omni` ([Upgrading to 3.0](#upgrading-to-30)).

**`HTTP 402 … prepayment credits are depleted`** — the key's project has no prepaid balance left; top it up in AI Studio under the project's billing. Every model returns this, not only video.

**`Model '…' is not in this package's catalog`** — a warning, not an error: the request was sent. Check the id if it was a typo.

**Omni `completed without a video`** — usually a safety refusal; the error includes what the model said and the `interactionId`. Rephrase, or describe the edit more simply ("Keep everything else the same").

**`429 … spend-based rate limit`** — Google caps the rate of spend per account by billing history and tier; it is not a per-minute request quota. Space requests out (the battery ran fine at one every 20 s) and retry; the error is classified `TRANSIENT`.

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

**Releasing** is manual. `npm publish` runs `check:release`, which refuses unless `CHANGELOG.md` has a heading for the version and an empty `[Unreleased]`, the build succeeds, the tarball holds only `package.json`, `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` and no `dist/` file without a `src/` module, and `check:lifecycle` passes (it needs network; `npm run check:release -- --offline` uses the committed snapshot of Google's page).

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
