# google-genai-api 2.0 — specification

| | |
|---|---|
| Version | v0.3.0 (revised after pre-implementation run #2) |
| Date | 2026-09-22 |
| Target repo | `misc/npm-packages/google-genai-api`, branch `release/2.0` |
| From → To | 1.3.0 (`3e52d92`, `master`) → 2.0.0 |
| Decision owner | Alex |
| Settled decisions | Omni Flash + Lyria out of scope (separate releases); drop semantic-release; rename `master` → `main` (both 2026-09-22) |
| Ship target | **before 2026-10-02** — the shutdown date of `gemini-2.5-flash-image`, the 1.x default model. darkroom's own deadline exposure is **decoupled** from this release (§1.6) |
| Companion | [`google-genai-api-2.0-checklist.md`](./google-genai-api-2.0-checklist.md) |
| Vendor source | `docs/api/*.md` — raw `.md.txt` snapshots of ai.google.dev pages + js-genai `CHANGELOG.md`, fetched 2026-09-22 |
| Live evidence | `docs/specs/probes-2026-09-22.jsonl` (raw), summarized in §1.2 and the checklist |
| Review record | run #1: architect 67 REVISE · docs 56 · assumptions 81 · 44 issues (§13). run #2: architect 83 REVISE (AF-006) · docs 71 · assumptions 81 · 41 issues (§13b). Tracker project `google-genai-api`. |
| Tags | **[LIVE]** observed against the real API on this date · **[DOC]** vendor docs snapshot · **[VERIFY]** unresolved; the named check settles it |

## 0. Summary

Imagen and three of the five Veo models this package ships are shut down. The default image model shuts down 2026-10-02. And the package has silently dropped `aspectRatio` on every Gemini image call since it was written — proven live (§1.4). 2.0 removes the dead surface, adds the current Gemini image family and Veo 3.1 Lite/4k, validates known models against a per-model capability table while passing unknown ones through, fixes the request shape, adds a test layer that exercises the real SDK serializer, and moves to `@google/genai` 2.x on Node ≥20.

It is a semver major because exported symbols are removed. It is deliberately **not** a rewrite: the HTTP layer, class structure, subpath exports and constructors are preserved. It is also deliberately **narrow on new capability**: `imageSize` ships (needed to reach 512/2K/4K); thinking level and search grounding are deferred to 2.1 (D11).

## 1. Evidence

### 1.1 Trigger
Alex, 2026-09-22: "The entire imagen model family no longer works."

### 1.2 Live probes [LIVE]

**Metadata** — `GET /v1beta/models/<id>`, control `does-not-exist-control` → 404:

| Result | Models |
|---|---|
| 404 | `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`, `imagen-3.0-generate-002`, `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` |
| 200 | `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3-pro-image-preview`, `nano-banana-pro-preview`, `gemini-3.1-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image`, `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`, `lyria-3.5` |

A metadata 200 is sufficient to delete on 404 and **insufficient to keep**. Every model the catalog keeps is therefore also generation-checked (below or in P7 V12). *Probe note:* a first attempt returned 403 "API key was reported as leaked" for every id including the control — inert, discarded; `models.list` succeeded on the same key, so listing is not a key-health check.

**Generation** — SDK 1.30, `generateContent`/`generateVideos`, key `GOOGLE_GENAI_API_KEY` as set in `~/.zshrc` after the 2026-09-22 rotation (the key darkroom also reads). Totals: 11 image generations OK + 1 rejected pre-generation; 1 Veo job OK + 1 rejected pre-generation. "OK" = at least one `inlineData` image part (or a downloaded video), not merely HTTP 200:

| Probe | Result |
|---|---|
| `gemini-3-pro-image-preview` (past paper shutdown 2026-06-25) | OK, 1024×1024 |
| `gemini-3.1-flash-image-preview` (past paper shutdown 2026-06-25) | OK, 1024×1024 |
| `gemini-3-pro-image` (GA), `4:5`, `1K` | OK, finish `STOP`, 1 image part, 0 thought parts |
| `gemini-3.1-flash-image`, `imageSize: '512'` / `'2K'` | 512×512 / 2048×2048 |
| `gemini-3.1-flash-lite-image`, `imageSize: '2K'` | server 400 "Image size 2K is not supported for this model" |
| `gemini-3.1-flash-lite-image`, `aspectRatio: '1:4'` | OK, 512×2064 — Lite accepts extended ratios |
| `gemini-3.1-flash-image`, 3 input images, `16:9` | OK, 1376×768 |
| `veo-3.1-lite-generate-preview` + `referenceImages` | server 400 "`referenceImages` isn't supported by this model" |
| `veo-3.1-lite-generate-preview`, 720p/4s T2V | OK, 32 s wall |
| `gemini-2.5-flash-image`, `veo-3.1-generate-preview` | in production use by darkroom today (Alex, live) |
| `veo-3.1-fast-generate-preview` | **not generation-checked** → P7 V12 |

### 1.3 Vendor statements [DOC] — `docs/api/deprecations.md`

| Model | Shutdown | Vendor replacement |
|---|---|---|
| `imagen-4.0-{,ultra-,fast-}generate-001` | 2026-08-17 | `gemini-3.1-flash-image` |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` | 2026-06-30 | `veo-3.1-{,fast-}generate-preview` |
| `gemini-3-pro-image-preview` | 2026-06-25 | `gemini-3-pro-image` |
| `gemini-3.1-flash-image-preview` | 2026-06-25 | `gemini-3.1-flash-image` |
| `gemini-2.5-flash-image` | **2026-10-02** | table says `gemini-3.1-flash-image-preview` — itself past shutdown; a vendor-table error. Treated as `gemini-3.1-flash-image` (Imagen's stated replacement; GA). |

The two previews are past shutdown on paper and still generate (§1.2). The live API is the authority (D2).

### 1.4 Correctness defect — `aspectRatio` never sent [LIVE, source]

`src/api.ts:181` sends `config: { aspectRatio } as Record<string, unknown>`. SDK 1.30's `generateContentConfigToMldev` copies an explicit field list; it reads `imageConfig` and has no top-level `aspectRatio`, so the value is dropped before the request leaves. The cast suppressed the compiler error that would have caught it.

Live control, neutral prompt ("A red apple on a wooden table"), `gemini-3.1-flash-image`:
- 1.x shape `{ aspectRatio: '9:16' }` → **1408×768** (ignored; landscape)
- `{ imageConfig: { aspectRatio: '9:16' } }` → **768×1376**

A first run used a prompt with framing cues ("wide establishing shot") and both shapes returned 16:9 — confounded, recorded, discarded. **The unset ratio is model-chosen framing, not 1:1.** That is what every 1.x caller has actually received.

This class — a request field silently dropped by SDK serialization — is invisible to the existing tests, which `vi.mock('@google/genai')` entirely (`test/api.test.ts:12`) and so assert what the package hands a fake, not what goes on the wire. D12 closes it.

### 1.5 SDK [DOC] — `docs/api/js-genai-CHANGELOG.md`

Pinned `^1.30.0` (lock 1.30.0); latest 2.24.0, released 2026-09-22 (the day of this spec). 2.0.0 (2026-05-07) is "BREAKING CHANGES — Interactions only … GenerateContent usage is unaffected." Material here:
- `engines.node >=20` — dropped Node 18 in **1.0.1** (changelog:988), so 1.3.0's `>=18` was already wrong.
- `generateImages` deprecated (2.14) — moot after Imagen removal.
- `generateVideos` top-level `prompt`/`image`/`video` deprecated in favor of `source` (2.14); the snapshot says removal "in the next major version" (changelog:153). So `^2.24.0` is safe with either shape; D7 adopts `source` to stop the deprecation warnings, not for urgency. (v0.1.0 claimed "may go in any minor" — unsourced, withdrawn.)
- `ImageConfig.imageSize`, `GenerateVideosSource`, `Part.thought`, `thinkingLevel` are all already present in 1.30's types; none of D6/D7 depends on the bump.
- `ResponseFormat` is annotated "not supported in Gemini API" despite the REST docs' `responseFormat.image` examples; the SDK's `imageConfig` is used (and proven live, §1.4).
- Transport, **verified on both versions**: 1.30 `apiCall` calls bare `fetch` (`dist/node/index.mjs:11548-11549`); 2.24 resolves `fetchFn ?? fetch` per call (`:13815-13817`), where `fetchFn` is the documented `httpOptions.fetch`. Both late-bind the global, so D12's stub works on either. 2.24 retries only when `retryOptions` is configured (`:13831, :13854`); this package configures none, so each request is exactly one fetch.
- 2.24 `imageConfigToMldev` maps `aspectRatio` and `imageSize`, and **throws client-side** on `personGeneration`, `outputMimeType`, `outputCompressionQuality`, `imageOutputOptions`, `prominentPeople` (Vertex-only). **The SDK serializer is itself an allowlist:** a config field the SDK does not know is dropped before the wire, whatever this package does. D3's passthrough promise is bounded by that (D3).

### 1.6 Consumer — darkroom (`~/projects/darkroom`)

Depends `^1.3.0` (will not auto-take 2.0.0). Import surface: `GoogleGenAIAPI` + `extractGeminiParts` (root), `GoogleGenAIVeoAPI` (`/veo`), `getGoogleGenAIApiKey` (`/config`); ctor `(apiKey, logLevel)`; `generateWithGemini({prompt, model, aspectRatio, inputImages})`; `generateVideo`/`generateFromImage`/`waitForCompletion`/`downloadVideo` with `durationSeconds` string and `image: {imageBytes, mimeType}`. All preserved.

Runtime surface — model ids are **string literals in darkroom**, not `MODELS.*` references, so constant changes here do not reach it:
- `lib/providers.js:97` — `'google/gemini-3-pro-image'` → `gemini-3-pro-image-preview`; `gemini-3.1-flash-image`; **everything else falls back to `gemini-2.5-flash-image`**, which dies 2026-10-02 regardless of this package.
- `lib/catalog.js:64-83` — `aspectRatio` defaults to `'1:1'` and is always sent (`providers.js:102`). After 2.0 that value reaches the model for the first time: darkroom image jobs, including edits of non-square inputs, become square. That is correct behavior for what darkroom asks for, and a visible change for its users.
- Imagen already removed (`6d91be8`).

- `lib/catalog.js:70` — a **user-selectable "2.5 Flash Image" entry** that reaches Google only via the fallback. Remapping the fallback alone would make it generate with 3.1-flash under a 2.5 label.

**Decoupled from this release (run #2 A1).** The model ids are literals and 1.3.0 never validates the image model (`api.ts:148-200`), so darkroom's deadline fix — Pro → `gemini-3-pro-image`, fallback → `gemini-3.1-flash-image`, remove or relabel the 2.5 catalog entry — ships **now, on 1.3.0**, owned by the darkroom workstream (handed off 2026-09-22). Only two things wait for 2.0: the pin bump, and the `'1:1'` decision, which must be made **before** that bump because the bump enacts it (P7 gate).

## 2. Vendor landscape (in scope)

### 2.1 Image — `generateContent` [DOC + LIVE]

| Model | Status | Aspect ratios | `imageSize` | Max input images | Thought parts |
|---|---|---|---|---|---|
| `gemini-3.1-flash-image` | Stable | STD + `1:4`,`4:1`,`1:8`,`8:1` | `512`, `1K`, `2K`, `4K` [LIVE 512, 2K] | 14 [LIVE 3] | if requested (thinking deferred, D11) |
| `gemini-3.1-flash-lite-image` | Stable | STD + extended [LIVE `1:4`] | `1K` only [LIVE 2K → 400] | 14 [DOC] | same |
| `gemini-3-pro-image` | Stable | STD | `1K`, `2K`, `4K` | 14 | always thinks; interim thought images possible [DOC] |
| `gemini-2.5-flash-image` | shutdown 2026-10-02 | STD | none (fixed ~1024px) | 3 recommended | none |
| `gemini-3-pro-image-preview` | past shutdown, live | as `gemini-3-pro-image` | | | |
| `gemini-3.1-flash-image-preview` | past shutdown, live | as `gemini-3.1-flash-image` | | | |

STD = `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. `imageSize` values are uppercase-K strings plus `'512'` [LIVE]. Output count is not a parameter ("the model won't always follow the exact number"). Responses: `candidates[0].content.parts`; images in `inlineData`; thought parts carry `thought: true`; `finishReason` other than `STOP` (e.g. `IMAGE_SAFETY`) can leave zero image parts.

### 2.2 Video — Veo 3.1 [DOC + LIVE]

| | 3.1 / 3.1 Fast | 3.1 Lite |
|---|---|---|
| Resolution | `720p` (default), `1080p` (8s), `4k` (8s); extension 720p only | `720p`, `1080p` (8s); **no 4k** [DOC] |
| Duration | `4`,`6`,`8`; `8` with extension / refs / 1080p / 4k | `4`,`6`,`8`; `8` with 1080p |
| Aspect | `16:9`, `9:16` | same |
| Reference images | ≤3 | **no** [LIVE 400] |
| Interpolation (`image` + `lastFrame`) | yes | yes |
| Extension | yes | **no** [DOC: model page + §Extending] |
| Audio | always on | always on |

No shutdown announced for any 3.1 preview. All three are preview-class; Google now recommends Omni Flash for new video work (out of scope, §10).

## 3. Current surface and disposition

| 1.x element | Location | 2.0 |
|---|---|---|
| `generateWithImagen`, `extractImagenImages` | `api.ts:224-261, 328-340` | **removed** |
| `MODELS.IMAGEN`, Imagen constraint, `ImagenModel`/`ImagenGenerateParams`/`ImagenResponse`/`ImagenGeneratedImage` | `config.ts:60, 166-182`; `types/index.ts` | **removed** |
| `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2`, their durations/constraints, `VeoDuration '5'` | `config.ts:506-508, 529-532, 623-679`; types | **removed** |
| Veo 1080p aspect-ratio branch | `config.ts:787-793` | **removed** (only Veo 3.0 had a 1080p aspect restriction) |
| `resolution1080p` constraint struct | `config.ts:599-602` | **replaced** by `durationRequired: Partial<Record<VeoResolution, VeoDuration>>` — expresses 1080p *and* 4k → `'8'` |
| Veo feature-gate branches (refs/extension unsupported) | `config.ts:805-817, 854-856` | **kept** — now exercised by Lite |
| `hasAudio: ... ?? true` | `veo-api.ts:673` | **kept unchanged**. v0.1.0 listed it for removal on a wrong rationale; the fallback serves unknown/metadata-less models, and every current model has audio. The public `VeoExtractedVideo.hasAudio` field stays. |
| Unknown Veo model throws | `config.ts:722-725`; `veo-api.ts:700-702` (`getModelInfo`) | **changed** to passthrough (D3) |
| `MODELS.GEMINI` (`gemini-2.5-flash-image`) | `config.ts:58` | kept; deprecated tier |
| `MODELS.GEMINI_3_PRO` (`gemini-3-pro-image-preview`) | `config.ts:59` | key kept, **value → `gemini-3-pro-image`**; preview id kept in catalog, deprecated tier (D2) |
| Model-identity check `model === MODELS.GEMINI \|\| …` | `config.ts:330` | **replaced** by constraint lookup (D5) |
| `detectGeminiMode` hard >1-image throw | `config.ts:357-366` | **replaced**: returns mode only; count checked in validation, which now runs regardless of a caller-supplied `mode` (`api.ts:160` bypass closed) |
| `generateWithGemini` never validates | `api.ts:148-200` | **changed**: calls `getModelViolations` before the request (D5) |
| `config: { aspectRatio } as Record` | `api.ts:181` | **fixed** → `imageConfig` (D6) |
| `response.parts` non-SDK fallback | `api.ts:185, 294`; `GeminiResponse.parts` | **removed** |
| Production error sanitization | `api.ts:193-197`; `veo-api.ts` `_sanitizeError` | **replaced** by shared `toPublicError` in new `src/errors.ts` (D13) |
| `validateModelParams` / `validateVeoParams` | `config.ts:284-345, 714-878` | **kept, still throw** — now `ValidationError`, and no longer on unknown ids (D3/D5); new `getModelViolations` / `getVeoViolations` beside them |
| `VeoGenerateParams.seed` | `types/index.ts:243`; `veo-api.ts:225` | **removed** — SDK rejects it on the Gemini API (D15) |
| `generateVideos({model, prompt, image, video, config})` | `veo-api.ts:228, 293, 353, 415, 477` | → `source: {prompt, image, video}` (D7) |
| CLI `--imagen`, `-n/--number-of-images` | `cli.ts:329, 341, 800-823` | **removed** |
| CLI `--aspect-ratio` default `'1:1'` | `cli.ts:340` | **removed** (D6) |
| CLI multi-image `_N` filename suffix | `cli.ts:871-883` | **kept** — `generateFilename` has 1-second resolution (`utils.ts:349`) and output count is not controllable, so two image parts would otherwise collide. |
| CLI metadata filename ignores `_N` | `cli.ts:912` | **fixed** |
| `.releaserc.json`, `release.yml`, semantic-release devDeps | repo root, `.github/` | **removed** |
| `MIGRATION-PLAN.md` (completed 1.3.0 TS migration) | root | → `docs/archive/` |

Preserved verbatim: class names, `(apiKey, logLevel)` constructors (a third optional `options` argument is added, D5), subpath exports (`.`, `./api`, `./video`, `./veo`, `./utils`, `./config`), `getGoogleGenAIApiKey`, Veo method names and parameter shapes, `GoogleGenAIVideoAPI` (video understanding) entirely. `extractGeminiParts` keeps its signature and **changes behavior** (skips thought parts, D6) — listed in §6.

## 4. Decisions

**D1 — Semver major 2.0.0.** Removing exported methods, constants and union members breaks compilation for any consumer referencing them, regardless of the endpoints already 404ing. npm registry `time` map checked 2026-09-22: versions 1.0.0–1.3.0, no tombstones; `2.0.0` is free. *Breaks if:* anything is published as 2.0.0 first — recheck immediately before publish.

*Alternative rejected — non-breaking 1.4.0 first (fix + catalog), 2.0 for removals only.* It would let `^1.3.0` consumers pick up the aspect-ratio fix automatically. Rejected: (a) that pickup is a *silent* framing change for every caret consumer, which is exactly the kind of change a major exists to announce; (b) darkroom's exposure is in its own model-id literals (§1.6), which no 1.x release reaches, so darkroom gains nothing from it; (c) two releases inside the 10-day window before 2026-10-02 doubles the release overhead that D10 makes manual.

**D2 — Two-tier retirement.** Confirmed dead (404 [LIVE]) → delete. Announced shutdown but generating [LIVE] → keep in the catalog with full capability validation, listed in `MODEL_DEPRECATIONS: Record<string, { shutdown: string; replacement: string }>`, emit one `logger.warn` per model per client instance, request still sent. Wording is tense-aware: before the date "shuts down on 2026-10-02; use gemini-3.1-flash-image", on/after "was scheduled to shut down on 2026-06-25 and may stop working at any time; use gemini-3-pro-image". Date comparison is in UTC against a `YYYY-MM-DD` string; the clock is an injectable `now: () => Date` (internal, default `() => new Date()`) so tests can pin both tenses.

Entries at 2.0.0: `gemini-2.5-flash-image` (2026-10-02 → `gemini-3.1-flash-image`), `gemini-3-pro-image-preview` (2026-06-25 → `gemini-3-pro-image`), `gemini-3.1-flash-image-preview` (2026-06-25 → `gemini-3.1-flash-image`) — the previews route here, not to deletion, per V2 [LIVE].

*Why not delete everything past its paper date:* openai precedent — "nothing was removed on this package's own initiative"; darkroom's Pro path sends `gemini-3-pro-image-preview` today (§1.6) and it still works. *After a shutdown:* the id stays a known, validated model whose request the API rejects; the vendor error reaches the caller intact (D13) and the warning says why. It is removed in the next release after Google 404s it. *Breaks if:* nobody reads warnings. The warning fires once per model per client instance, and a long-running server that memoizes its client (darkroom, `providers.js:59-60`) emits it once per process — easy to scroll past (run #2 A15). Accepted: the durable signal is the vendor's rejection surfaced per D13 and the README's lifecycle table; the warning is a courtesy, not the mechanism.

**D3 — Unknown model ids pass through, for image and video.** Types: `GeminiModel` = the known image-id union, `ImageModelId = GeminiModel | (string & {})`; `VeoModel` = the known Veo union, `VeoModelId = VeoModel | (string & {})`. Tables keyed by known ids stay `Record<GeminiModel | VeoModel, …>` (so `VEO_DURATIONS` etc. do not widen). Unknown id → one `logger.warn` per id per instance ("not in this package's catalog; sending without capability validation"), then only **shape** checks run and every declared parameter is sent.

*Shape* (always enforced, for every id) vs *capability* (known ids only, downgradable by D5's `'warn'`):

| | Shape | Capability |
|---|---|---|
| Image | prompt present, ≤ `PROMPT_MAX_LENGTH` (10 000); each input image has `mimeType` in the supported set and non-empty base64 `data`; `aspectRatio` matches `/^\d+:\d+$/`; `imageSize` matches `/^\d+K?$/` (uppercase K; rejects `'2k'`) | ratio ∈ model's list; size ∈ model's list (or param not accepted); input count ≤ `maxInputImages` |
| Veo | prompt required except extension/interpolation; `image`/`lastFrame`/reference images have `imageBytes`+`mimeType`; `lastFrame` requires `image`; `personGeneration` ∈ vendor enum; `durationSeconds` is a numeric string; `resolution` matches `/^\d+(p|k)$/` | aspect ∈ model's list; resolution ∈ model's list; duration ∈ model's list; `durationRequired` per resolution; feature gates (refs, extension, interpolation); reference count; extension 720p-only |

Shape patterns are deliberately open (run #2 A11): a future `8K` or `3:1` passes shape and reaches the vendor, which is the point of passthrough. Types follow: `AspectRatio` and `ImageSize` are known-value unions `| (string & {})`.

**"Sent as-is" means every *declared* parameter is mapped** — nothing declared is dropped for lack of a constraint entry (dropping would recreate §1.4). Two bounds, stated rather than hidden (run #2 A4):
1. The request builders map the fields `GeminiGenerateParams` / `VeoGenerateParams` declare. For fields this package does not declare, both builders accept `extraConfig?: Record<string, unknown>`, shallow-merged last into the SDK config object (kling `extraSettings` precedent). Its keys are not validated.
2. The **SDK serializer is an allowlist** (§1.5): an `extraConfig` key the installed SDK does not know is dropped by the SDK, and a Vertex-only key makes the SDK throw. A new vendor field therefore reaches the wire when an SDK minor learns it — the caret range picks that up, and D9's scheduled run tests it.

`getModelInfo(unknown)` returns `{ model, known: false }` instead of throwing. Known id → full capability validation (D5).

*Why:* darkroom sent `gemini-3.1-flash-image` to a package that didn't know it, and the next Google model would otherwise break every consumer on release day; all Veo models are preview, so video needs this more than image. kling D9 precedent (applies to video there too). v0.1.0's migration row "unknown model → throws" was wrong for the library — `generateWithGemini` never validated; only the CLI (`cli.ts:795`) and Veo (`config.ts:722`) threw.

**D4 — Default image model `gemini-3.1-flash-image`.** Google's named replacement for Imagen and (corrected) for 2.5-flash-image; GA; widest capability set; live-verified. Exported as `DEFAULT_IMAGE_MODEL`. Veo default unchanged (`veo-3.1-generate-preview`). *Consequence:* callers relying on the implicit default get a different model — CHANGELOG `Changed`.

**D5 — Capability validation, in the library, from the constraint table; exported validators keep their throwing contract.**
- `MODEL_CONSTRAINTS[model]`: `{ aspectRatios: AspectRatio[]; imageSizes: ImageSize[] | null; maxInputImages: number; promptMaxLength: number }` (`null` imageSizes = parameter not accepted). `VEO_MODEL_CONSTRAINTS[model]`: `{ aspectRatios; resolutions; durations; durationRequired: Partial<Record<VeoResolution, VeoDuration>>; features: { referenceImages: number | null; extension: boolean; interpolation: boolean } }`.
- **New pure functions** (the checking core): `getModelViolations(model, params): Violation[]` and `getVeoViolations(model, params): Violation[]`, where `Violation = { kind: 'shape' | 'capability'; param: string; value: unknown; allowed?: readonly unknown[]; message: string }`. Unknown model → only shape violations. No model-id comparisons anywhere.
- **Existing exports keep their contract (run #2 AF-006):** `validateModelParams(model, params)` and `validateVeoParams(model, params)` still **throw** on the first violation, exactly as in 1.x, now as `ValidationError` (below). The one contract change — both **no longer throw for an unknown model id** (D3) — is a §6 row and a CHANGELOG `Changed` entry. The CLI keeps calling `validateModelParams` at `cli.ts:795` unchanged.
- `ValidationError extends Error` — defined in `src/errors.ts`, exported from `./config` and the root; `name = 'ValidationError'`, carries `violations: Violation[]`. `instanceof Error` and `.message` behave as 1.x's plain `Error` did, so 1.x `catch` code is unaffected.
- **Both clients call the violation functions** before any network call (new for `generateWithGemini` — CHANGELOG `Changed`; Veo already validated in its library path, `veo-api.ts:213, 279, 333, 398, 463`). Shape violations always throw `ValidationError`. Capability violations throw by default, or with constructor `options.capabilityValidation: 'warn'` are logged (`warn`, one line per violation) and the request is sent. **Applies to image and Veo alike** (run #2: Veo limits are doc-derived too — Lite 4k/extension are [DOC]).
- Validation runs **before** the `try` that applies production sanitization, so a `ValidationError` always reaches the caller with its named parameter (run #2 A6).
- State (warn-once sets, clock) lives on the client instance; the violation functions are stateless.
- Constructor signature: `(apiKey?, logLevel?, options?: { capabilityValidation?: 'error' | 'warn' })` on `GoogleGenAIAPI` and `GoogleGenAIVeoAPI`. Existing two-argument calls are unchanged.
- Payload size: validation checks image *count*, not total inline bytes. The Gemini API has an inline request-size ceiling [VERIFY: value not in snapshots]; oversize requests fail at the vendor and surface per D13. Only 3 inputs were exercised live; README states both facts. No client check.

**D6 — Request shape.** `generateWithGemini` builds a typed SDK `GenerateContentConfig` — no casts:
```ts
{
  responseModalities: ['TEXT', 'IMAGE'],
  imageConfig: { aspectRatio?, imageSize? },   // each key present only if the caller set it
}
```
- `aspectRatio` has **no default**: omitted unless passed. This reproduces exactly what 1.x callers received (model-chosen framing, §1.4); sending `'1:1'` by default would change every default call. The README's eight "(default: 1:1)" claims are wrong today and are rewritten (P6). The CLI's commander default `'1:1'` (`cli.ts:340`) is removed for the same reason.
- `imageSize` is new on `GeminiGenerateParams`.
- `extractGeminiParts(response, { includeThoughts = false } = {})` skips `thought: true` parts by default. In 1.x, Pro's interim thought images would have been returned as extra output images; skipping them is a fix, and a behavior change (§6).
- Response with zero image parts (e.g. `finishReason: 'IMAGE_SAFETY'`): `generateWithGemini` returns the response unchanged (as 1.x) and logs `warn` with the finish reason; `extractGeminiParts` returns `[]`. Throwing would break darkroom, which inspects parts itself. The CLI treats zero images as an error exit.
- `thinkingConfig` and `tools` are **not** built in 2.0 (D11).

**D7 — Veo `source` shape.** `generateVideos({ model, source: { prompt, image?, video? }, config })`; `lastFrame`, `referenceImages`, `resolution`, `durationSeconds` etc. stay in `config`. Public method signatures unchanged. Serialization of every Veo field under the new shape is asserted by D12's wire tests; live Veo 3.1 (refs, 4k) and Fast in V12.

**D8 — CLI.** `--model <id>` selects the image model (default D4; unknown ids pass with a warning, D3). `--gemini` retained = image mode with default model; `--gemini-3-pro` retained as alias for `gemini-3-pro-image`. `--input-image` repeatable, count checked per D5. New `--image-size`, `--capability-validation <error|warn>`. `--aspect-ratio` has no default. Veo `--veo-resolution` accepts `4k`. Removed: `--imagen`, `-n`. `_N` suffix kept and applied **after** thought parts are filtered (Pro's interim thought images never become `_2` files); metadata filename fixed; zero images → non-zero exit naming the `finishReason`.

CLI tests (`test/cli.test.ts`) spawn `node dist/cli.js`, which cannot see a fetch stub in the test process (run #2). Isolation: `node --import ./test/helpers/fetch-replay.mjs dist/cli.js …`, where the preload replaces `globalThis.fetch` with a replayer that serves a canned response named by env `WIRE_FIXTURE` and fails the process on any unexpected request. `GOOGLE_GENAI_API_KEY=test` is set per spawn; `HOME` points at a temp dir so no real `~/.google-genai/.env` is read. Scenarios: validation-exit paths (no network), one image success, one zero-image exit, one Veo submit.

**D9 — Platform and SDK-drift detection.** `engines.node >=20` (the SDK's floor since 1.0.1); CI matrix 20/22/24 (24: `engines` permits it). TS ^5.9, vitest ^4, `@types/node` ^24 (sibling parity). axios retained (`utils.ts`, `video-api.ts`) — out of scope.

`@google/genai ^2.24.0`, caret retained. What that does and does not protect, stated plainly (run #2 A2 — v0.2.0 overclaimed):
- A library ships no lockfile; each consumer resolves its own 2.x minor at install time. Nothing in this repo can prevent a consumer from installing a minor this repo never tested.
- **Detection, not prevention:** `.github/workflows/sdk-drift.yml` runs weekly (cron) and on manual dispatch: `npm ci`, then `npm install @google/genai@latest --no-save`, then the D12 wire tests only. Regular CI runs on the lockfile and would never see a new minor; this job exists to. A failure opens the question "pin down or fix forward" within a week of the minor's release, instead of on a consumer's bug report.
- The residual window (a bad minor, installed by a consumer, before the next weekly run) is a stated limitation (§9), not closed.

**D10 — Release mechanics.**
- Remove semantic-release (`.releaserc.json`, `release.yml`, 6 devDeps, script). Add `.github/workflows/ci.yml` (push/PR, Node 20/22/24, `npm ci && npm run verify`) — verifies, never publishes.
- `verify` = typecheck + build + test. Add openai's `check:release` as `prepublishOnly` guard: refuses if `package.json` version lacks a matching `## [x.y.z] — date` CHANGELOG heading, if `[Unreleased]` is non-empty, if `dist/` is older than `src/`, or if `npm pack --dry-run` lists files outside `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` (answers A13).
- Version bump, tag and GitHub release are manual and listed as checklist items (A13).
- Branch rename `master` → `main`: prepared locally; Alex pushes and flips the GitHub default.
- **Verdaccio for an unscoped package, without touching darkroom's lockfile** (run #1 A7, run #2 A7): the workspace's scope rule does not route `google-genai-api`, and `--registry` routes *every* newly resolved package — including `@google/genai` 2.x and its transitives — through Verdaccio, which a single-package reinstall does not clean up. So pre-publish validation never runs in darkroom's real checkout: it runs in a **throwaway `git worktree` of darkroom** (`_worktrees/darkroom-v9`), `npm install google-genai-api@2.0.0 --registry http://localhost:4873/`, confirm `npm ls google-genai-api` → 2.0.0 (a 1.3.0 result voids the run), run V9 there, delete the worktree. darkroom's real checkout moves to 2.0.0 only **after** npm promotion, from npmjs with no `--registry` override; then the jq scan must print nothing and the resolved URL must return 200 (public package — bare `curl`).
- `npm deprecate google-genai-api@"<2.0.0"` runs **after** darkroom has moved to 2.0.0 (A13: it would otherwise flag darkroom's own pin).

**D11 — Thinking level and search grounding deferred to 2.1.** No consumer uses them; the vendor's examples for `thinking_level` and `search_types` are Interactions-API (`image-generation.md:874-899, 1511-1536`), the generateContent snapshot shows only `tools: [{googleSearch: {}}]`, and SDK 1.30's `ThinkingLevel` enum has no `MINIMAL` (`genai.d.ts:7419-7432`). Shipping them would add two unevidenced request mappings to a release with a deadline. Under D3/D5 they are simply absent params; a caller cannot pass them in 2.0. 2.1 (with Omni Flash) adds them behind live probes.

**D12 — Wire tests: exercise the real SDK serializer.** New `test/wire.test.ts`: construct the real `GoogleGenAIAPI` / `GoogleGenAIVeoAPI` (real `@google/genai`, **not** mocked), replace `globalThis.fetch` with a recorder that captures `(url, init)` and returns a canned vendor response, and assert on the parsed request body. The seam is verified on 1.30 and 2.24 (§1.5); each test also asserts **exactly one** fetch call (2.24 does not retry without `retryOptions`), so a retry wrapper can never let an assertion pass on the wrong request. Proven feasible 2026-09-22: under 1.30, `negativePrompt` reached a stubbed fetch while `seed` was rejected pre-network.

Every assertion names its wire path — the list is closed; adding a declared param means adding a row:

| Declared param | Wire path |
|---|---|
| image `model` | URL `…/models/{model}:generateContent` |
| `prompt` | `contents[0].parts[0].text` (or string content) |
| `inputImages[i]` | `contents[0].parts[i+1].inlineData.{mimeType,data}`, order preserved |
| `aspectRatio` | `generationConfig.imageConfig.aspectRatio` — present iff passed |
| `imageSize` | `generationConfig.imageConfig.imageSize` — present iff passed |
| (always) | `generationConfig.responseModalities = ['TEXT','IMAGE']` |
| `extraConfig.<k>` (SDK-known key) | its SDK wire path — one representative key asserted |
| Veo `model` | URL `…/models/{model}:predictLongRunning` |
| Veo `prompt` / `image` / `video` (extension) | `instances[0].prompt` / `.image` / `.video` |
| Veo `lastFrame` / `referenceImages` | `instances[0].lastFrame` / `.referenceImages` |
| Veo `aspectRatio` / `resolution` / `durationSeconds` / `negativePrompt` / `personGeneration` | `parameters.<same>` (`durationSeconds` numeric) |
| Veo `numberOfVideos` | `parameters.sampleCount` |

Also: unknown image and Veo ids produce the same body shape with the id in the URL (D3); a canned 400/403/429 response produces the D13 error shape in production and non-production modes.

**Mutation controls** (each must turn the suite red, recorded in the checklist): revert `api.ts` to the 1.x flat `{ aspectRatio }`; drop `imageSize` for unknown ids; revert Veo to top-level `prompt` (asserts `source` shape is what's sent — both shapes currently serialize identically, so this mutation instead removes `lastFrame` from the builder).

The existing mocked unit tests remain for logic; wire tests own "does the field reach the network". This is the layer whose absence let §1.4 ship. D9's weekly job runs this file against `@google/genai@latest`.

**D13 — Error surface.** Production sanitization hides the two failures this release creates on purpose: model-not-found (D3 passthrough) and post-shutdown rejection (D2). But "4xx bodies are safe" was wrong (run #2 A3): the SDK builds `ApiError.message` as `JSON.stringify` of the **whole** error body (`index.mjs:11714`), including `details[]` (ErrorInfo metadata, consumer project, quota ids on 429), and wraps non-JSON bodies verbatim (`:11706-11711`). So:

One shared `toPublicError(err, context)` in `src/errors.ts`, used by both clients:
- **Every environment:** the thrown error carries `status` (HTTP), `code` (gRPC, for Veo operation errors), and `classification` (the existing Veo classes, now shared: `USER_ACTIONABLE`, `PERMANENT`, `TRANSIENT`, `SAFETY_BLOCKED`, `AUDIO_BLOCKED`) as properties. The original error is kept as `cause`.
- **Non-production:** message unchanged (as 1.x).
- **Production:** message = the category sentence (the existing Veo sentences, reused for image) **plus**, only for 400/404/422 and Veo operation errors, the vendor's `error.message` **field** — parsed from the JSON body, never `details`, never a non-JSON body, truncated to 300 chars. 401/403 → "Authentication or permission failure (HTTP 403)" with no vendor text. 429 → the TRANSIENT sentence with status; no quota metadata.
- **Veo operation errors** (the `operation.error` thrown during polling, `veo-api.ts:560-565`): gRPC `code` + `message` field are the generation outcome (safety block, unsupported parameter), not account data — surfaced under the same rule.
- The Veo classifier keeps deciding retry (`TRANSIENT` → retry while polling, `veo-api.ts:572-575`) exactly as today; D13 changes what the final message says, not the retry behavior.

This is a **Security**-category CHANGELOG entry: it changes what production errors disclose.

*Note (run #2 A13):* darkroom never sets `NODE_ENV=production`, so it already sees raw errors; D13 is for production consumers. darkroom's deadline protection is the decoupled remap (§1.6), not this.

**D14 — Catalog stays in `config.ts`.** The architect suggested extracting to `models.ts` (kling). Declined for 2.0: `./config` is a public subpath that exports these constants; the removals shrink `config.ts` (878 LOC) by roughly a quarter; extraction is churn without a consumer benefit. The same reasoning covers `cli.ts` (931), `veo-api.ts` (712) and `types/index.ts` (955): P2's removals shrink all three, none gains a new responsibility, and splitting them is independent of anything 2.0 ships. Recorded, revisit in 2.1.

**D15 — Remove Veo `seed`.** Both SDK 1.30 and 2.24 throw "seed parameter is not supported in Gemini API" before any request (`generateVideosConfigToMldev`; proven locally 2026-09-22, §D12). `VeoGenerateParams.seed` (`types/index.ts:243`), forwarded at `veo-api.ts:225`, has therefore failed every call that used it since it was added. Removed rather than shape-rejected: a parameter that cannot work on this transport is not surface area worth keeping. CHANGELOG: `Removed` (with the reason), and `Fixed` is not claimed — there is nothing to fix on this API.

## 5. Target catalog (constants)

```ts
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
MODELS = {
  GEMINI_3_1_FLASH: 'gemini-3.1-flash-image',
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite-image',
  GEMINI_3_PRO: 'gemini-3-pro-image',            // value changed from the preview id
  GEMINI: 'gemini-2.5-flash-image',              // deprecated 2026-10-02
  GEMINI_VIDEO: 'gemini-2.5-flash',              // video understanding, unchanged
}
MODEL_CONSTRAINTS keys: the four above + 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'
MODEL_DEPRECATIONS: three entries (D2)
ASPECT_RATIOS (all known) = STD + '1:4','4:1','1:8','8:1'; per-model subsets in constraints
IMAGE_SIZES = ['512','1K','2K','4K']
VEO_MODELS = { VEO_3_1, VEO_3_1_FAST, VEO_3_1_LITE }
VEO_RESOLUTIONS = ['720p','1080p','4k']
VEO_DURATIONS = ['4','6','8'] for all three
VeoModelConstraint.durationRequired = { '1080p': '8', '4k': '8' } (Lite: { '1080p': '8' })
```
Key names `GEMINI`, `GEMINI_3_PRO` preserved so `MODELS.X` references keep compiling.

## 6. Migration table (1.x → 2.0), source for README "Upgrading to 2.0"

| 1.x | 2.0 |
|---|---|
| `generateWithImagen({prompt, numberOfImages, aspectRatio})` | `generateWithGemini({prompt, aspectRatio})` — one image per call; loop for more |
| `extractImagenImages(res)` | `extractGeminiParts(res)` |
| `MODELS.IMAGEN` | `DEFAULT_IMAGE_MODEL` / `MODELS.GEMINI_3_1_FLASH` |
| `MODELS.GEMINI_3_PRO` = preview id | same key, GA id `gemini-3-pro-image` |
| implicit default `gemini-2.5-flash-image` | `gemini-3.1-flash-image` |
| `aspectRatio` accepted, **never sent** (model-chosen framing) | sent via `imageConfig` — output framing now follows the value |
| README "aspectRatio (default: 1:1)" | no default; omitted = model-chosen framing (as 1.x actually behaved) |
| — | `imageSize: '512' \| '1K' \| '2K' \| '4K'` (per model) |
| `generateWithGemini` never validated params | validates known models (throws `ValidationError`; `capabilityValidation: 'warn'` to downgrade) — image and Veo |
| `validateModelParams` / `validateVeoParams` threw `Error` on any violation, including an unknown model | still throw on violations, now `ValidationError extends Error`; **do not throw for an unknown model id** |
| — | `getModelViolations` / `getVeoViolations` return `Violation[]` without throwing |
| — | `extraConfig` on image and Veo params (unvalidated, merged last; SDK-unknown keys dropped by the SDK) |
| `VeoGenerateParams.seed` (always rejected by the SDK) | removed |
| unknown model: library accepted silently; CLI and Veo threw | all paths: one warning, request sent as-is |
| `inputImagesMax: 1`; `detectGeminiMode` threw on >1 image | per-model `maxInputImages` (up to 14); `detectGeminiMode` never throws on count |
| `MODEL_CONSTRAINTS[m].inputImagesMax`, `.numberOfImages`, `.responseFormat` | `.maxInputImages`, `.aspectRatios`, `.imageSizes`, `.promptMaxLength` |
| `AspectRatio` = 5 values; `ASPECT_RATIOS` 5 values | 14 values; per-model subsets |
| `GeminiModel` union = 2 ids | 6 known ids + `(string & {})` |
| `extractGeminiParts` returned thought parts as images/text | skips `thought: true` parts; `{ includeThoughts: true }` to keep |
| `GeminiResponse.parts` / fallback | removed (never an SDK field) |
| production errors: image all → one generic sentence; Veo → category sentence | both: category sentence + vendor `error.message` field for 400/404/422 and Veo operation errors; `status` / `code` / `classification` / `cause` on every error; 401/403/429 never include vendor text |
| `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2` | `VEO_3_1`, `VEO_3_1_FAST`, `VEO_3_1_LITE` |
| `VeoResolution` = `720p \| 1080p` | + `4k` (3.1, Fast) |
| `durationSeconds: '5'` | `'4' \| '6' \| '8'` |
| `VeoModelConstraint.resolution1080p` | `.durationRequired` |
| `getModelInfo(unknown)` threw | returns `{ model, known: false }` |
| CLI `--imagen`, `-n 4` | `--model <id>`; one image per call |
| CLI `--aspect-ratio` default `1:1` | no default |
| Node ≥18 | Node ≥20 |

## 7. Verification

Every check states how it fails. Live checks (L) are recorded in the checklist with outcome; they are not part of `npm test`.

| # | Check | Fails when / control |
|---|---|---|
| V1 | `npm run verify` green on Node 20, 22, 24 (CI). Test count recorded (baseline 358). | any typecheck/test failure |
| V2 (L) | Past-shutdown previews generate ≥1 `inlineData` image part | **done**: both OK → D2 deprecated tier |
| V3 (L) | Neutral prompt, `9:16` via 2.0 → height > width | **done**: control 1.x flat → 1408×768; fix → 768×1376 |
| V4 | Mocked unit: `generateContent` receives `config.imageConfig.aspectRatio` | mutation: flat shape → fails |
| V5 | Dead-literal census `grep -rniE "imagen\|veo-3\.0\|veo-2\.0\|VEO_3[^_]\|VEO_3_FAST\|VEO_2[^_0-9]" src test package.json README.md` → **only** lines inside README's "Upgrading to 2.0" section | control: run before P2 and record the count (must be >0; v0.1.0's case-sensitive form matched 79 lines and missed 98) |
| V6 | Unknown id: one warn per id, request sent with every caller param; known id + unsupported param → throws; `'warn'` mode → warns and sends | mutations: restore unknown-model throw; drop `imageSize` for unknown ids → tests fail |
| V7 | Deprecation warn: once per model per instance; future-tense before the date, past-tense on/after (injected clock) | two calls → one warn; clock at 2026-10-02T00:00Z → past tense |
| V8 (L) | Lite refs rejected; Lite 720p/4s completes | **done**: server 400 on refs; T2V OK. Client-side: Lite refs/extension/4k rejected before any call (unit) |
| V9 (L) | darkroom: `npm ls google-genai-api` shows 2.0.0 (from Verdaccio); darkroom tests pass; **one job per darkroom Google model** (`gemini-3-pro-image(-preview)`, `gemini-3.1-flash-image`, fallback, `veo-3.1`, `veo-3.1-fast`) succeeds | `npm ls` shows 1.3.0 → run void; after promotion, jq scan for `localhost:4873` must be empty and resolved URL must 200 |
| V10 (L) | `imageSize` `'512'` → 512 px, `'2K'` → 2048 px on 3.1-flash; Lite `'2K'` rejected | **done**; client-side lowercase `'2k'` → shape error (unit) |
| V11 (L) | 3 input images on 3.1-flash → ≥1 image part | **done**: OK |
| V12 (L) | Against the built 2.0 package: `veo-3.1-fast-generate-preview` 720p/4s T2V; `veo-3.1-generate-preview` with 1 reference image; `veo-3.1-generate-preview` 4k/8s — each downloads a video | any failure blocks release; 4k/refs failing live → constraint corrected before publish |
| V13 | Wire tests (D12): every row of D12's table, exactly one fetch per call | the three D12 mutations each turn it red (recorded); canned 400/403/429 → D13 shape in both modes |
| V14 | `check:release` refuses a publish with a stale `dist/`, a missing CHANGELOG heading, a non-empty `[Unreleased]`, or extra tarball files | each condition induced once → refuses |
| V15 | README census, three greps, each → 0 after P6: `default: '?1:1` · the 1.x ratio list `1:1, 3:4, 4:3, 9:16, 16:9` · hardcoded test stats `358\|88\.47` | controls before P6 (2026-09-22): 8 · 9 · 7 |
| V16 (L) | **Through the built 2.0 package on SDK 2.24** (not raw SDK calls): neutral prompt, `9:16` on `gemini-3.1-flash-image` → height > width; `imageSize: '2K'` → 2048 px long edge | a square or landscape result blocks release — the headline Fixed entry is verified on the shipped artifact, not on 1.30 (run #2 A9) |
| V17 | README export census: `test/readme.test.ts` parses every identifier listed in README's export code blocks and asserts it is a real export of the named subpath of the built package; and every identifier in an `import … from 'google-genai-api…'` example resolves | control: run against the 1.x README + 1.x dist → fails on the type-export claims at `:456-494`, `:532-552` (the class two review rounds found by hand) |
| V18 | SDK-drift job (D9) runs green on `@google/genai@latest` at P7 | control: dispatch it once with a deliberately broken wire assertion → job fails |

**Ship-blocking vs degradable** (run #2 A16 — what happens if a late live check fails): V1, V13, V14, V16, V17 block. A V12 failure on a Veo capability (4k, reference images, Fast) is **degradable**: the constraint for that capability is set to unsupported (clients reject it with a clear error, overridable by `'warn'`), the finding goes in the CHANGELOG, and 2.0.0 ships. darkroom's deadline no longer depends on any of this (§1.6).

## 8. Phases

LOC = added + changed lines, per phase split into source and test (round 2 asked for test budgets explicitly). Total ≈ 820 src + 690 test ≈ 1,510 — higher than v0.2.0's 1,190, which folded test rewrites in implicitly. No phase exceeds 440. Removals are not counted.

| Phase | Scope | Files | Est. LOC | Exit |
|---|---|---|---|---|
| P0 | Spec, review ×2, probes | docs/ | — | review PROCEED; all [VERIFY] settled or assigned to a V-check |
| P1 | Tooling/release: D9, D10 (not rename) — SDK bump, CI, weekly SDK-drift workflow, `verify`, `check:release` | package.json, lock, ci.yml, sdk-drift.yml, scripts/check-release.mjs | 140 | `verify` green on SDK 2.24 with compile fixes only; V14 |
| P2 | Removals (§3) | api.ts, config.ts, types, cli.ts, 3 tests, package.json | 60 (net −~900) | V5 = 0 with recorded control |
| P3a | Catalog, constraints, `MODEL_DEPRECATIONS`, D2 warn-once + clock, D3 passthrough + shape/capability split, D5 violation functions + `ValidationError` + `capabilityValidation`; rewrite of the 17 throw-style `validateModelParams` sites in `test/config.test.ts` against the new constraint shape | config.ts, errors.ts (new), api.ts, types; test/config.test.ts, test/api.test.ts | 260 src + 180 test | V6, V7 unit-green |
| P3b | D6 request shape, `extraConfig`, `extractGeminiParts` thoughts, zero-image path, D13 `toPublicError` (both clients), D12 wire tests (image) | api.ts, errors.ts, veo-api.ts (errors only), types, test/wire.test.ts, test/api.test.ts | 200 src + 150 test | V4, V13 (image) green |
| P4 | Veo: Lite, 4k, `durationRequired`, D3 + D5 for Veo, D7 `source`, D15 `seed` removal, `extraConfig`, wire tests (video); legacy negative tests repointed at Lite | config.ts, veo-api.ts, types; test/config.test.ts, test/veo-api.test.ts, test/wire.test.ts | 150 src + 150 test | V13 (video); Lite gating unit tests |
| P5 | CLI: D8; subprocess tests with the fetch-replay preload (CLI has 0 tests today) | cli.ts, test/cli.test.ts, test/helpers/fetch-replay.mjs | 110 src + 150 test | CLI tests green |
| P6 | Docs (full scope below), README export test, CHANGELOG, archive MIGRATION-PLAN | README, CHANGELOG, test/readme.test.ts | 60 test | V15, V17; V5 README clause |
| P7 | Merged-tree verify; V16, V18; Verdaccio + darkroom worktree V9; V12; branch rename; publish; darkroom pin bump; deprecate | — | — | npm 2.0.0; darkroom on 2.0.0 with clean lockfile |

**P6 README scope — method, not a line list.** Two review rounds each found ~10 README locations the previous round's enumeration missed, because each enumeration was built from the prior round's findings (run #2 docs). v0.3.0 stops enumerating. P6 **rewrites the README section by section, top to bottom**, holding every section against §3 and §6; the gate is mechanical, not a list:
- V5 (dead literals) — only inside "Upgrading to 2.0";
- V15 (three greps: `default: 1:1`, the 1.x five-ratio list, hardcoded test stats) — 0;
- V17 (every export and import the README claims resolves against the built package);
- plus a reviewer read of the rendered README by `public-interface-validator` before P7.

Known-affected locations, recorded as a **floor** so none is forgotten, not as the scope: intro `:10`; Quick Start `:26-30`; Overview `:78-82, :94`; Public API export blocks `:100-180` (drop `extractImagenImages`; add `DEFAULT_IMAGE_MODEL`, `MODEL_DEPRECATIONS`, `IMAGE_SIZES`, `ValidationError`, `getModelViolations`, `getVeoViolations`; `4k` in `VEO_RESOLUTIONS`); method summary `:186-187`; Models `:195-287`; type-export claims `:456-494, :532-552`; Type-Safe Parameters `:504-530`; CLI Usage `:585-628`; method docs `:682-703, :727-741`; Examples `:798-839, :901-907`; data tree `:984`; Security/validation bullets `:1073-1075`; error examples `:1108-1110` (its `'5:4'` "invalid" example is **valid** in 2.0); Troubleshooting `:1162-1189`; dev scripts `:1245`; test stats `:7-8, :94, :1259-1274, :1329`; Imagen link `:1305`; TOC `:58-72` gains "Upgrading to 2.0" and "Model lifecycle".

New sections: "Upgrading to 2.0" (§6), "Model lifecycle" (D2 tiers and dates, D3 passthrough, `capabilityValidation`, the `extraConfig` bound), "Known limitations" (§9).

**CHANGELOG plan** (Keep a Changelog). Fix the file structure first: move the `# Changelog` header and attribution (`:92-97`, a semantic-release prepend artifact) to the top; add a note that entries before 2.0.0 were generated by semantic-release in conventional-commit style (openai/bfl wording); keep an empty `## [Unreleased]` above the release heading (D10's `check:release` requires it). Then `## [2.0.0] — <date>`, sections in canonical order:

| Category | Source |
|---|---|
| Added | 3.1 Flash / Lite / 3 Pro GA; Veo Lite; Veo 4k; `imageSize`; multi-image input; `extraConfig`; `MODEL_DEPRECATIONS`; `DEFAULT_IMAGE_MODEL`; `capabilityValidation`; `ValidationError`; `getModelViolations` / `getVeoViolations`; `getModelInfo` `known`; error `status`/`code`/`classification`; weekly SDK-drift CI |
| Changed | default model (D4); library validation for image (D5); unknown-id passthrough, incl. `validateModelParams`/`validateVeoParams` no longer throwing on unknown ids (D3); `extractGeminiParts` skips thoughts (D6); `MODELS.GEMINI_3_PRO` value; Veo `source` (D7); constraint shapes; **CLI `--aspect-ratio` no longer defaults to `1:1`**; Node ≥20; SDK 2.x |
| Deprecated | `gemini-2.5-flash-image`, both previews (D2) |
| Removed | Imagen surface; Veo 3.0/2.0; Veo `seed` (always rejected by the SDK on this API, D15); `GeminiResponse.parts`; CLI `--imagen`/`-n`; semantic-release |
| Fixed | **`aspectRatio` was never sent — now honored; output framing changes for every caller that passed it** (the semantics-without-signature case, stated explicitly); CLI metadata filename; `detectGeminiMode` mode bypass; Pro thought images no longer returned as output |
| Security | production errors now include the vendor's `error.message` field for 400/404/422 and Veo operation errors; `details[]`, non-JSON bodies, and 401/403/429 vendor text are never included (D13) |

**Consumer follow-through (darkroom).** *Now, on 1.3.0, darkroom workstream:* Pro → `gemini-3-pro-image`; fallback → `gemini-3.1-flash-image`; remove or relabel the 2.5 catalog entry (§1.6). *At P7, gate before the pin bump:* the `'1:1'` edit decision is recorded in darkroom (keep, or send no ratio for edits); then `google-genai-api@^2.0.0`; then V9.

## 9. Known limitations (shipped, documented)

- Capability table is derived from vendor docs + the probes in §1.2; `capabilityValidation: 'warn'` exists because docs have been wrong (§1.3, §2.1).
- Single key, single region, single date for every [LIVE] result. Regional `personGeneration` limits and tier-dependent availability are not modeled.
- No client-side inline payload-size check; `maxInputImages` 14 is the documented count, 3 exercised live (D5).
- The SDK serializer drops config keys it does not know; `extraConfig` cannot reach the wire ahead of the SDK (D3).
- SDK drift is detected weekly, not prevented; a consumer can install an untested 2.x minor in between (D9).
- Deprecation warnings fire once per model per client instance (D2).
- Every Veo model is preview-class; a Veo retirement is handled by D2/D3 on the next release, and D3 keeps unknown/new Veo ids usable meanwhile.

## 10. Out of scope

- **Gemini Omni Flash** (`gemini-omni-1.1-flash`, `/v1beta/interactions`) — 2.1, with D11's thinking/grounding.
- **Lyria 3.5** music — separate spec.
- TTS, Live/bidi models, embeddings.
- axios → native fetch; SDK `files.delete` replacing the manual axios DELETE (`video-api.ts:420-461`).
- Video-understanding model bump (`gemini-2.5-flash` has no announced shutdown).
- Interactions API for image generation (docs call `generateContent` "legacy"; SDK path fully supported; no deprecation date).
- `nano-banana-pro-preview` — undocumented alias; not cataloged; passes through under D3.

## 11. Open questions

None blocking this package. One decision is darkroom's, gated in P7: whether edit jobs keep sending `'1:1'` once 2.0 honors it.

## 12. Residual [VERIFY]

| Item | Settled by |
|---|---|
| Inline request-size ceiling value | documentation only (D5); not gating |
| Veo 3.1 refs / 4k / Fast live behavior | V12, before publish — degradable (§7) |
| Aspect fix on the shipped artifact (SDK 2.24) | V16, before publish — blocking |

## 13. Review findings → disposition (run #1, 44 issues)

| Finding (agent) | Disposition |
|---|---|
| Library validation call site unspecified; migration row wrong (arch, H) | D5 (api.ts calls it; state on instance); §6 rows corrected |
| Unknown id + capability params silently dropped (arch, H) | D3: every param sent as-is; V6 mutation |
| V5 census case-sensitive, narrow scope (arch, H) | V5 `-i`, + package.json + README, recorded control |
| No LOC estimate (arch, H) | §8 per-phase LOC; P3 split into P3a/P3b |
| D3 image-only (arch, M) | D3 extended to Veo + `getModelInfo` |
| Migration table incomplete (arch M, docs M) | §6 expanded (11 → 25 rows) |
| D6 omit vs V6 throw (arch, M) | D5: known + unsupported → throw (or warn by option); D6 no longer silently omits |
| CLI `1:1` default (arch, M) | D6/D8: removed |
| Thinking/grounding unevidenced; image search no consumer (arch, M×2) | D11: deferred to 2.1 |
| `_N` removal collides filenames (arch, M) | kept (§3) |
| darkroom preview id + fallback (arch M, assumptions C) | §1.6; D2 keeps preview; P7 consumer follow-through; V9 one job per model |
| Error paths unspecified (arch, M) | D13; D6 zero-image path |
| V2/V8/V11 no failure condition; V3 confound (arch, M) | §1.2 "OK" definition; all re-run/recorded; V3 confound documented |
| `hasAudio` rationale wrong (arch, L) | §3: kept, rationale corrected |
| Warn-once state / clock (arch, L) | D2, D5 |
| Files >500 LOC / `models.ts` (arch, L) | D14: declined with reason |
| SDK "any minor" claim (arch L, assumptions M) | §1.5 corrected; D9 caret rationale |
| 4k constraint shape (arch, L) | `durationRequired` (§3, §5) |
| No narrower alternative (arch, L) | D1 rejected-alternative paragraph |
| README scope gaps ×9, aspect claims ×8, Utility Types, badges, troubleshooting, link (docs) | §8 P6 README scope, enumerated; V15 |
| CHANGELOG header position; category mapping (docs, M×2) | §8 CHANGELOG plan |
| `extractGeminiParts` behavior row (docs M, assumptions M) | §6 row; §3 note |
| Mocked SDK blind to serialization (assumptions, C) | D12 wire tests; V13 |
| darkroom always sends `1:1` (assumptions, C) | §1.6; P7 follow-through decision |
| GA pro-image / Veo Fast kept on metadata only (assumptions, H) | pro-image generated [LIVE]; Fast → V12 |
| Doc-derived hard rejects, no override (assumptions, H) | D5 `capabilityValidation: 'warn'` |
| Veo `source` serialization (assumptions, H) | D12 video wire tests; V12 |
| Verdaccio unscoped routing (assumptions, H) | D10 explicit `--registry` flow + `npm ls` gate |
| Ship date vs 2026-10-02 (assumptions, M) | header ship target; post-shutdown behavior in D2 |
| Precedent / single-key generalization (assumptions, M) | §9 known limitations |
| Warn-once noticed (assumptions, M) | D13 makes the vendor error carry the signal; warning is secondary |
| Hand publish (assumptions, M) | D10 `check:release`, manual tag/release items, deprecate ordering |
| Payload size (assumptions, M) | D5 note; §9 |
| Node 24 (assumptions, L) | D9 CI matrix adds 24 |

## 13b. Review findings → disposition (run #2, 41 issues)

| Finding (agent) | Disposition |
|---|---|
| AF-006: `validateModelParams` silently flips throw → return (arch, C) | D5: both exported validators keep throwing (`ValidationError extends Error`); new `getModelViolations`/`getVeoViolations`; the single contract change (no throw on unknown id) has a §6 row and a CHANGELOG entry |
| darkroom deadline fix sequenced behind 2.0 (assumptions, C) | §1.6 + §8: decoupled — darkroom remaps on 1.3.0 now (handed off 2026-09-22) |
| Caret + push-only CI overclaims (assumptions C, arch M) | D9 rewritten: weekly `sdk-drift.yml` against `@latest`; residual window stated in §9; V18 |
| 4xx bodies not safe to surface (assumptions, H) | D13 rewritten: only the vendor `error.message` field, only 400/404/422 + Veo op errors; never `details`, non-JSON, 401/403/429 |
| "As-is" vs allowlist builders (assumptions, H) | D3: "every *declared* param"; `extraConfig`; SDK-allowlist bound stated; D12 table closed |
| fetch seam verified on 1.30 only; retries (arch L, assumptions H) | §1.5: verified on 2.24 (late-bound `fetchFn ?? fetch`, no default retries); D12 asserts exactly one fetch |
| `'warn'` image-only; sanitization order (arch M, assumptions H) | D5: applies to Veo; validation runs before the sanitizing `try` |
| Unknown Veo id: shape vs capability (arch, M) | D3 shape/capability table for image and Veo |
| Veo polling errors outside D13; classifier collision (arch M, assumptions M) | D13: shared `toPublicError`; op errors carry gRPC `code`; classifier still drives retry |
| Verdaccio writes many localhost URLs (assumptions, H) | D10: V9 runs in a throwaway darkroom worktree; real checkout installs only from npmjs |
| darkroom 2.5 catalog entry (assumptions, H) | §1.6 + follow-through: remove or relabel |
| Aspect fix verified on 1.30 raw calls only (assumptions, H) | V16 through the built package on 2.24, blocking |
| Closed shape vocabulary (assumptions, M) | D3: open patterns; `AspectRatio`/`ImageSize` known unions `\| (string & {})` |
| darkroom `'1:1'` enacted by default (assumptions, M) | P7 gate: decision recorded before the pin bump |
| D13 presumes production (assumptions, M) | D13 note; D2 no longer claims D13 as the mitigation |
| Dispositioned ≠ resolved; late V12 (assumptions, M) | §7 ship-blocking vs degradable |
| Warn-once easily missed (assumptions, L) | D2: accepted with reason; §9 |
| Key provenance (assumptions, L) | §1.2 records the key source |
| P3a omits tests; test-rewrite budget (arch, M) | §8: per-phase src + test LOC; P3a lists test files and the 17-site rewrite |
| CLI subprocess isolation (arch, L) | D8: `--import` fetch-replay preload, temp `HOME`, fail on unexpected request |
| `ValidationError` location/export (arch, L) | D5: `src/errors.ts`, exported from `./config` and root |
| Type naming; `VEO_DURATIONS` widening (arch, L) | D3: `GeminiModel`/`ImageModelId`, `VeoModel`/`VeoModelId`; tables keyed by known unions |
| Large files beyond D14 (arch, L) | D14 extended with reasons for cli/veo-api/types |
| Probe records incomplete; count wrong (arch, L) | jsonl rows completed (model, prompt, config, ok); totals corrected to 11 + 1 image, 1 + 1 Veo |
| README: export blocks, Type-Safe Parameters, false `'5:4'` example, Imagen mentions, test stats, line 79, TOC (docs, H/M/L) | §8 P6: method changed to full top-to-bottom rewrite gated by V5/V15/V17; all named locations kept as a floor |
| V15 ratio-list blind spot (docs, M) | V15 widened to three greps with controls |
| CHANGELOG order, Security bucket, `[Unreleased]`, CLI default item (docs, L) | §8 CHANGELOG plan |
| (found while resolving A4) Veo `seed` always rejected by the SDK | D15: removed |

## Revision history

- v0.3.0 (2026-09-22) — addresses pre-implementation run #2 (41 findings, §13b). Exported validators keep their throwing contract (AF-006); darkroom deadline decoupled; weekly SDK-drift job; D13 narrowed to the vendor message field; D3 shape/capability table + `extraConfig` + SDK-allowlist bound; fetch seam and retry behavior verified on SDK 2.24; D15 removes Veo `seed` (SDK rejects it on this API); V16–V18; ship-blocking vs degradable; P6 switches from line lists to a gated full rewrite; LOC re-estimated with explicit test budgets (~1,510).
- v0.2.0 (2026-09-22) — addresses pre-implementation run #1 (44 findings, §13). Adds D11–D14, ship target, generation evidence for every kept image model, P0 probe results (V2/V3/V8/V10/V11 done), expanded migration table, per-phase LOC, enumerated P6 scope, CHANGELOG plan, darkroom follow-through. Withdraws v0.1.0's SDK "any minor" claim and `hasAudio` removal.
- v0.1.0 (2026-09-22) — initial draft (commit `523aedd`).
