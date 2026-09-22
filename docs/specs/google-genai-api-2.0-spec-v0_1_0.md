# google-genai-api 2.0 — specification

| | |
|---|---|
| Version | v0.1.0 (draft, pre-review) |
| Date | 2026-09-22 |
| Target repo | `misc/npm-packages/google-genai-api`, branch `release/2.0` |
| From → To | 1.3.0 (`3e52d92`, `master`) → 2.0.0 |
| Decision owner | Alex |
| Settled decisions | Omni Flash + Lyria out of scope (separate releases); drop semantic-release; rename `master` → `main` (both 2026-09-22) |
| Companion | [`google-genai-api-2.0-checklist.md`](./google-genai-api-2.0-checklist.md) |
| Vendor source | `docs/api/*.md` — raw `.md.txt` snapshots of ai.google.dev pages + js-genai `CHANGELOG.md`, fetched 2026-09-22 |
| Tags | **[LIVE]** = observed against the real API this date; **[DOC]** = vendor docs snapshot; **[VERIFY]** = unresolved, must be settled by a P0 probe before the constraint is written |

## 0. Summary

Imagen and three of five Veo models this package ships are shut down; the default image model shuts down 2026-10-02; and the package has been silently dropping `aspectRatio` on every Gemini image call. 2.0 removes the dead surface, adds the current Gemini image family and Veo 3.1 Lite/4K behind per-model capability validation, fixes the request shape, and moves to `@google/genai` 2.x on Node ≥20. It is a semver major because exported symbols are removed; it is deliberately *not* a rewrite — the HTTP layer, class structure, subpath exports and constructor are preserved so darkroom's integration survives unchanged.

## 1. Evidence

### 1.1 Trigger
Alex, 2026-09-22: "The entire imagen model family no longer works."

### 1.2 Live probes [LIVE]
`GET /v1beta/models/<id>` with a working key, control `does-not-exist-control` → 404 (so the probe can fail).

| Result | Models |
|---|---|
| 404 | `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`, `imagen-3.0-generate-002`, `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` |
| 200 | `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3-pro-image-preview`, `nano-banana-pro-preview`, `gemini-3.1-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image`, `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`, `lyria-3.5` |

A metadata 200 proves the model record exists, **not** that generation succeeds. It is sufficient evidence to delete (404) and insufficient to keep (see §4 D2, V2).

*Probe note:* the first probe attempt returned 403 "API key was reported as leaked" for every id including the control — an inert check, discarded. Recorded because the listing endpoint succeeded on the same key, i.e. `models.list` is not a key-health check.

### 1.3 Vendor statements [DOC] — `docs/api/deprecations.md`

| Model | Shutdown | Vendor replacement |
|---|---|---|
| `imagen-4.0-{,ultra-,fast-}generate-001` | 2026-08-17 | `gemini-3.1-flash-image` |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` | 2026-06-30 | `veo-3.1-{,fast-}generate-preview` |
| `gemini-3-pro-image-preview` | 2026-06-25 | `gemini-3-pro-image` |
| `gemini-3.1-flash-image-preview` | 2026-06-25 | `gemini-3.1-flash-image` |
| `gemini-2.5-flash-image` | **2026-10-02** | table says `gemini-3.1-flash-image-preview` — itself past shutdown; a vendor-table error. Treated as `gemini-3.1-flash-image` (Imagen's stated replacement; GA). |

The two previews are past shutdown on paper yet answer 200 — the contradiction V2 resolves.

### 1.4 Correctness defect (found by the 2026-09-22 baseline audit, confirmed in source)
`src/api.ts:181`: `config: { aspectRatio } as Record<string, unknown>`. The SDK serializes image aspect ratio from `config.imageConfig.aspectRatio`; a top-level `aspectRatio` is not a `GenerateContentConfig` field. The cast suppressed the compiler error that would have caught it. Consequence: every 1.x caller passing `aspectRatio` to `generateWithGemini` received the model's default framing. [VERIFY live — V3 control]

### 1.5 SDK [DOC] — `docs/api/js-genai-CHANGELOG.md`
Pinned `^1.30.0` (lock 1.30.0); latest 2.24.0. 2.0.0 (2026-05-07) is "BREAKING CHANGES — Interactions only … GenerateContent usage is unaffected." Material to this package: `engines.node >=20`; `generateImages` deprecated (2.14, moot after Imagen removal); `generateVideos` top-level `prompt`/`image`/`video` deprecated in favor of `source` (2.14, removal "not before 2026-07-31" — already past, so the old shape may go in any minor). `ImageConfig` present since 1.22. `ResponseFormat` is annotated "not supported in Gemini API" despite the REST docs showing `responseFormat.image` — the SDK's `imageConfig` path is used.

### 1.6 Consumer — darkroom (`~/projects/darkroom/lib/providers.js`)
Depends `^1.3.0`. Uses: `GoogleGenAIAPI` + `extractGeminiParts` (root), `GoogleGenAIVeoAPI` (`/veo`), `getGoogleGenAIApiKey` (`/config`); ctor `(apiKey, logLevel)`; `generateWithGemini({prompt, model, aspectRatio, inputImages})`; `generateVideo`/`generateFromImage`/`waitForCompletion`/`downloadVideo` with `durationSeconds` as string and `image: {imageBytes, mimeType}`. **Sends `gemini-3.1-flash-image`, unknown to 1.3.0** — works only because `generateWithGemini` does not validate the model. Imagen already removed there (`6d91be8`). Darkroom's `^1.3.0` range will not auto-take 2.0.0.

## 2. Vendor landscape (in scope)

### 2.1 Image — `generateContent` [DOC: `image-generation.md`, `models_*.md`]

| Model | Status | Aspect ratios | `imageSize` | Max input images | Thinking | Search grounding |
|---|---|---|---|---|---|---|
| `gemini-3.1-flash-image` | Stable | STD + `1:4`,`4:1`,`1:8`,`8:1` | `512`, `1K`, `2K`, `4K` | 14 (10 object + 4 character) | `minimal` (default) \| `high` | web + image search |
| `gemini-3.1-flash-lite-image` | Stable | STD [VERIFY: page says "14 ratios", lists 10] | `1K` only | 14 [VERIFY] | `minimal` \| `high` | not supported |
| `gemini-3-pro-image` | Stable | STD | `1K`, `2K`, `4K` | 14 (6 object + 5 character) | always on, not configurable | web |
| `gemini-2.5-flash-image` | Stable, shutdown 2026-10-02 | STD | fixed ~1024px, no param | best ≤3 | no | no |

STD = `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. `imageSize` requires uppercase `K`; `512` spelling [VERIFY — prose says "0.5K", code comments "512"]. Output count is not a parameter ("the model won't always follow the exact number"). Responses: iterate `candidates[0].content.parts`; images in `inlineData`; thought parts carry `thought: true`.

### 2.2 Video — Veo 3.1 [DOC: `veo.md` §Parameters, §Model features]

| | 3.1 / 3.1 Fast | 3.1 Lite |
|---|---|---|
| Resolution | `720p` (default), `1080p` (8s), `4k` (8s); extension 720p only | `720p`, `1080p` (8s); **no 4k** |
| Duration | `4`,`6`,`8`; `8` with extension / refs / 1080p / 4k | `4`,`6`,`8`; `8` with refs / 1080p |
| Aspect | `16:9`, `9:16` | same |
| Reference images | ≤3 | table cell reads "`n/a` object" while the duration row mentions refs — [VERIFY] |
| Interpolation (`image` + `lastFrame`) | yes | yes |
| Extension | yes | **no** (explicit, model page + §Extending) |
| Audio | always on | always on |
| `personGeneration` | T2V/extension `allow_all`; I2V/interp/refs `allow_adult` | T2V `allow_all`; I2V/interp/refs `allow_adult` |

No shutdown announced for any 3.1 preview.

## 3. Current surface and disposition

| 1.x element | Location | 2.0 |
|---|---|---|
| `generateWithImagen`, `extractImagenImages` | `api.ts:224-261, 328-340` | **removed** |
| `MODELS.IMAGEN`, Imagen constraint, `ImagenModel`/`ImagenGenerateParams`/`ImagenResponse`/`ImagenGeneratedImage` | `config.ts:60, 166-182`; `types/index.ts` | **removed** |
| `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2`, their durations/constraints, `VeoDuration '5'` | `config.ts:506-508, 529-532, 623-679`; types | **removed** |
| 1080p aspect-ratio branch; `hasAudio` fallback | `config.ts:787-793`; `veo-api.ts:673` | **removed** (only legacy models exercised them) |
| Veo feature-gate branches (refs/extension unsupported) | `config.ts:805-817, 854-856` | **kept** — now exercised by Lite |
| `MODELS.GEMINI` (`gemini-2.5-flash-image`) | `config.ts:58` | kept, deprecated tier |
| `MODELS.GEMINI_3_PRO` (`gemini-3-pro-image-preview`) | `config.ts:59` | value becomes `gemini-3-pro-image`; preview id → V2 |
| identity check `model === MODELS.GEMINI \|\| …` | `config.ts:330` | **replaced** by constraint lookup |
| `detectGeminiMode` hard 1-image throw | `config.ts:357-366` | **replaced** by per-model `maxInputImages` |
| `config: { aspectRatio } as Record` | `api.ts:181` | **fixed** → `imageConfig` |
| `generateVideos({model, prompt, image, video, config})` | `veo-api.ts:228, 293, 353, 415, 477` | → `source: {prompt, image, video}` |
| CLI `--imagen`, `-n/--number-of-images`, multi-image `_N` naming | `cli.ts:329, 341, 800-823, 871-883` | **removed** |
| `.releaserc.json`, `release.yml`, semantic-release devDeps | repo root, `.github/` | **removed** |
| `MIGRATION-PLAN.md` (the completed 1.3.0 TS migration) | root | → `docs/archive/` |

Preserved verbatim: class names, `(apiKey, logLevel)` constructors, subpath exports (`.`, `./api`, `./video`, `./veo`, `./utils`, `./config`), `extractGeminiParts`, `getGoogleGenAIApiKey`, Veo method names and parameter shapes, `GoogleGenAIVideoAPI` (video understanding) entirely.

## 4. Decisions

**D1 — Semver major 2.0.0.** Removing exported methods, constants and union members breaks compilation for any consumer referencing them, regardless of the endpoints already 404ing. npm registry `time` map checked 2026-09-22: no tombstoned versions; `2.0.0` is free. *Breaks if:* someone publishes a 2.0.0 pre-release first — recheck before publish.

**D2 — Two-tier retirement.** Confirmed dead (404 [LIVE]) → delete. Announced shutdown but live → keep, list in `MODEL_DEPRECATIONS: Record<string, {shutdown: string; replacement: string}>`, emit one `logger.warn` per model per instance, wording tense-aware ("shuts down on" / "was scheduled to shut down on"), request still sent. Covers `gemini-2.5-flash-image`. The two past-shutdown previews are routed by **V2**: generation succeeds → deprecated tier (past-tense warning); generation fails → delete with the other dead ids. *Why not delete everything past its paper date:* openai precedent — "nothing was removed on this package's own initiative"; the live API is the authority. *Breaks if:* Google 404s a preview between V2 and publish — harmless, it just becomes a warned-about dead id until 2.0.1.

**D3 — Unknown model ids pass through.** `model: KnownImageModel | (string & {})`. Unknown id → one `logger.warn` ("not in this package's catalog; sending without capability validation"), then request as-is, with shape-only checks (prompt present, input images well-formed). Known id → full capability validation. *Why:* darkroom sends `gemini-3.1-flash-image` today against a package that doesn't know it; strict rejection would have broken it, and the next Google model would break every consumer on release day. kling D9 precedent. `validateModelParams`' current throw on unknown models (`config.ts:285-289`) is the behavior removed.

**D4 — Default image model `gemini-3.1-flash-image`.** Google's named replacement for both Imagen and (corrected) 2.5-flash-image; GA; widest capability set. Veo default unchanged (`veo-3.1-generate-preview`). *Consequence:* callers relying on the implicit default get a different model — CHANGELOG `Changed`.

**D5 — Capability-driven validation.** `MODEL_CONSTRAINTS[model]` gains `aspectRatios`, `imageSizes | null`, `maxInputImages`, `thinking: 'configurable' | 'always' | 'none'`, `grounding: {web: boolean; image: boolean}`, `tier: 'current' | 'deprecated'`. `validateModelParams` reads only the constraint object; no model-id comparisons remain in validation. `detectGeminiMode` stops throwing on >1 image; mode detection is text-only vs with-images, and the count check moves to validation.

**D6 — Request shape.** `generateWithGemini` builds a typed SDK `GenerateContentConfig`:
```ts
{
  responseModalities: ['TEXT', 'IMAGE'],
  imageConfig: { aspectRatio?, imageSize? },
  thinkingConfig?: { thinkingLevel },            // only if caller set it and model is 'configurable'
  tools?: [{ googleSearch: {...} }],              // only if caller requested grounding and model supports it
}
```
No casts. New optional params on `GeminiGenerateParams`: `imageSize`, `thinkingLevel`, `grounding: boolean | {web?: boolean; image?: boolean}`. `extractGeminiParts` skips parts with `thought: true` by default (option to include). Also drop the non-SDK `response.parts` fallback (`api.ts:185, 294`). `aspectRatio` default: **omit** unless caller passes it (1.x defaulted to `'1:1'`, which was never sent — sending it now would silently change every default call's framing). [Review: confirm this default]

**D7 — Veo `source` shape.** `generateVideos({model, source: {prompt, image?, video?}, config})`. Public method signatures unchanged. *Breaks if:* SDK removes `source` — no signal of that.

**D8 — CLI.** `--model <id>` selects the image model (default D4). `--gemini` retained = image mode with default model; `--gemini-3-pro` retained as alias for `gemini-3-pro-image`. `--input-image` repeatable (max per D5). New: `--image-size`, `--thinking <minimal|high>`, `--grounding [web|image|both]`. Veo `--veo-resolution` accepts `4k`. Removed: `--imagen`, `-n`. Fix `cli.ts:912` metadata filename.

**D9 — Platform.** `engines.node >=20` (SDK floor); CI matrix 20/22. `@google/genai ^2.24.0`; TS ^5.9, vitest ^4, `@types/node` ^24 (sibling parity). axios retained (`utils.ts`, `video-api.ts`) — out of scope.

**D10 — Release mechanics.** Remove semantic-release (config, workflow, 6 devDeps, script). Add `.github/workflows/ci.yml` (push/PR, Node 20/22, `npm ci && npm run verify`) — verifies, never publishes. `verify` = typecheck + build + test. Hand-written CHANGELOG under `[Unreleased]` → `[2.0.0] — date`. Rename `master` → `main`. Publish: Verdaccio → darkroom validation → Alex `npm publish` → `npm deprecate google-genai-api@"<2.0.0"`.

## 5. Target catalog (constants)

```ts
MODELS = {
  GEMINI_3_1_FLASH: 'gemini-3.1-flash-image',        // DEFAULT_IMAGE_MODEL
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite-image',
  GEMINI_3_PRO: 'gemini-3-pro-image',
  GEMINI: 'gemini-2.5-flash-image',                  // deprecated 2026-10-02
  GEMINI_VIDEO: 'gemini-2.5-flash',                  // video understanding, unchanged
}
MODEL_DEPRECATIONS = {
  'gemini-2.5-flash-image': { shutdown: '2026-10-02', replacement: 'gemini-3.1-flash-image' },
  // + previews if V2 routes them here
}
VEO_MODELS = { VEO_3_1, VEO_3_1_FAST, VEO_3_1_LITE }
VEO_RESOLUTIONS = ['720p', '1080p', '4k']
VEO_DURATIONS = ['4', '6', '8'] for all three
```
Key names `GEMINI`, `GEMINI_3_PRO` preserved (the latter's value moves to GA) so `MODELS.X` references in consumers keep compiling.

## 6. Migration table (1.x → 2.0), for README "Upgrading to 2.0"

| 1.x | 2.0 |
|---|---|
| `generateWithImagen({prompt, numberOfImages, aspectRatio})` | `generateWithGemini({prompt, aspectRatio})` — one image per call; loop for more |
| `extractImagenImages(res)` | `extractGeminiParts(res)` |
| `MODELS.IMAGEN` | `MODELS.GEMINI_3_1_FLASH` / `DEFAULT_IMAGE_MODEL` |
| `MODELS.GEMINI_3_PRO` = preview id | same key, GA id |
| implicit default `gemini-2.5-flash-image` | `gemini-3.1-flash-image` |
| `aspectRatio` accepted, silently not sent | sent via `imageConfig` — output framing changes |
| `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2` | `VEO_3_1`, `VEO_3_1_FAST`, `VEO_3_1_LITE` |
| `durationSeconds: '5'` | `'4' \| '6' \| '8'` |
| unknown model → throws | unknown model → warns, sends |
| `google-genai --imagen -n 4` | `google-genai --model gemini-3.1-flash-image` |
| Node ≥18 | Node ≥20 |

## 7. Verification

Every check states how it can fail.

| # | Check | Fails when / control |
|---|---|---|
| V1 | `npm run verify` green, Node 20 and 22 (CI). Test count recorded (baseline 358). | any typecheck/test failure |
| V2 | Live `generateContent` on `gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` | result routes D2; both outcomes recorded |
| V3 | Live 16:9 on `gemini-3.1-flash-image` via 2.0 shape returns width > height | control: same prompt via 1.x flat shape returns ~square (confirms §1.4) |
| V4 | Unit: `generateContent` called with `config.imageConfig.aspectRatio` | mutation: revert to flat → test must fail |
| V5 | Dead-literal census `grep -rnE "imagen\|veo-3\.0\|veo-2\.0\|VEO_3[^_]\|VEO_3_FAST\|VEO_2[^_]" src test` = 0 | control: run pre-removal → non-zero |
| V6 | Unknown id → one warn, request sent, no throw; known id + unsupported param → throws | mutation: restore unknown-model throw → test fails |
| V7 | Deprecation warn fires exactly once per instance per model | two calls → one warn |
| V8 | Lite: extension and 4k rejected client-side; live Lite 720p/4s T2V completes; live Lite refs call result settles [VERIFY] | — |
| V9 | darkroom installs 2.0.0 from Verdaccio (project `.npmrc`), its tests pass, one image + one video job succeed through its queue | lockfile jq scan for `localhost:4873` after npm promotion must be empty |
| V10 | `imageSize: '512'` accepted live on 3.1-flash [VERIFY spelling]; `'2K'` returns ~2048px long edge | lowercase `'2k'` → client-side reject |
| V11 | Multi-image: 3 input images on 3.1-flash succeeds live | — |

Live checks are recorded in the checklist with cost; they are not part of `npm test`.

## 8. Phases

| Phase | Scope | Exit |
|---|---|---|
| P0 | This spec; `pre-implementation` review; paid probes V2, V3 control, V8 refs, V10, V11 | all [VERIFY] resolved or explicitly deferred; spec → v0.2.0 |
| P1 | Tooling/release: D9, D10 (minus branch rename) | CI file present; `verify` green on SDK 2.24 with no source changes beyond compile fixes |
| P2 | Removals (§3) | V5 = 0; tests green |
| P3 | Image catalog, D2–D6 | V4, V6, V7 unit-green |
| P4 | Veo Lite/4k, D7 | Veo tests repointed; Lite gating tests |
| P5 | CLI, D8; subprocess CLI smoke tests (CLI has 0 tests today) | CLI tests green |
| P6 | README (models table + tier column, Upgrading to 2.0, fix README:456-494 export claims and README:30/901-907 CLI syntax), CHANGELOG `[2.0.0]`, archive MIGRATION-PLAN | public-interface / docs review |
| P7 | Merged-tree verify; Verdaccio; V9; live V3/V8; branch rename; publish; deprecate | npm shows 2.0.0; darkroom lockfile clean |

## 9. Out of scope

- **Gemini Omni Flash** (`gemini-omni-1.1-flash`, `/v1beta/interactions`) — Google's recommended default for video generation. Separate spec (2.1).
- **Lyria 3.5** music — separate spec.
- TTS, Live/bidi models, embeddings.
- axios → native fetch; SDK `files.delete` replacing the manual axios DELETE (`video-api.ts:420-461`).
- Video-understanding model bump (`gemini-2.5-flash` has no announced shutdown).
- Interactions API migration for image generation (docs call `generateContent` "legacy", but the SDK path is fully supported; no deprecation date).

## 10. Open questions

1. D6 `aspectRatio` default — omit (proposed) or send `'1:1'`?
2. `nano-banana-pro-preview` — undocumented alias; excluded from catalog (passes through under D3 if a consumer uses it).
3. Should `GoogleGenAIVeoAPI` warn when a caller uses a preview model? Proposed: no — all current Veo models are preview.

## Revision history

- v0.1.0 (2026-09-22) — initial draft from live probes, vendor snapshots, codebase map, sibling precedent, and the 2026-09-22 baseline audit.
