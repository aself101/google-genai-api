# google-genai-api 2.0 — specification

| | |
|---|---|
| Version | v0.4.2 (architect run #5 PROCEED; its six edits folded in) |
| Date | 2026-09-22 |
| Target repo | `misc/npm-packages/google-genai-api`, branch `release/2.0` |
| From → To | 1.3.0 (`3e52d92`, `master`) → 2.0.0 |
| Decision owner | Alex |
| Settled decisions | Omni Flash + Lyria out of scope (separate releases); drop semantic-release; rename `master` → `main`; **catalog lists current models only — any model with an announced shutdown is dropped from the package** (all Alex, 2026-09-22) |
| Ship target | When the gates pass; **ideally** before 2026-10-02. That date kills the 1.x default model for every 1.x caller whether or not 2.0 exists — 2.0 is their upgrade path, not a fix they receive automatically — so it motivates shipping promptly but does not justify shortcutting a gate (run #3 A14). |
| Consumers | Unknown npm users (28 downloads/week, ~2,100/year, npm API 2026-09-22; control: a nonexistent package returns "not found") — the reason for semver discipline. darkroom is Alex's personal, unreleased app and serves as the live test bed, not a production consumer. |
| Companion | [`google-genai-api-2.0-checklist.md`](./google-genai-api-2.0-checklist.md) |
| Vendor source | `docs/api/*.md` — raw `.md.txt` snapshots of ai.google.dev pages + js-genai `CHANGELOG.md`, fetched 2026-09-22 |
| Live evidence | `docs/specs/probes-2026-09-22.jsonl` (raw), summarized in §1.2 and the checklist |
| Review record | run #1: architect 67 REVISE · docs 56 · assumptions 81 · 44 issues (§13). run #2: architect 83 REVISE (AF-006) · docs 71 · assumptions 81 · 41 issues (§13b). run #3: architect 83 REVISE (AF-006) · docs 73 · assumptions 82 · 38 issues (§13c). run #4 (architect only): 88 REVISE (AF-006, narrow) · 14 issues (§13d). **run #5 (architect, targeted): 88 PROCEED, no gates** · 10 issues, folded in (§13e). Tracker project `google-genai-api`. |
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

### 1.6 Test bed — darkroom (`~/projects/darkroom`)

darkroom is Alex's personal, unreleased app (Alex, 2026-09-22): no CI, no deploy, no users other than Alex. It is the live end-to-end harness for this release, and a preview of what an npm consumer's upgrade looks like — nothing more.

Import surface (all preserved by 2.0): `GoogleGenAIAPI` + `extractGeminiParts` (root), `GoogleGenAIVeoAPI` (`/veo`), `getGoogleGenAIApiKey` (`/config`); ctor `(apiKey, logLevel)`; `generateWithGemini({prompt, model, aspectRatio, inputImages})`; `generateVideo`/`generateFromImage`/`waitForCompletion`/`downloadVideo`, `durationSeconds` as string, `image: {imageBytes, mimeType}`. Depends `^1.3.0`. Never sends Veo `seed` (`providers.js:132-139`).

State as re-read 2026-09-22 after the handoff (run #3 A5 — v0.3.0's citations were already stale): the Pro and fallback remap is done (`providers.js:102-106`); image aspect ratio now defaults to Auto (`''` → omitted, `catalog.js:27-31`), so the `'1:1'` question is settled in darkroom's code. **Remaining:** a user-selectable `google/gemini-2.5-flash-image` entry, now explicitly mapped (`catalog.js:74-82`, `providers.js:105`) — it fails after 2026-10-02. Owned by the darkroom workstream; flagged 2026-09-22. None of this gates 2.0.

## 2. Vendor landscape (in scope)

### 2.1 Image — `generateContent` [DOC + LIVE]

| Model | Status | Aspect ratios | `imageSize` | Max input images | Thought parts |
|---|---|---|---|---|---|
| `gemini-3.1-flash-image` | Stable | STD + `1:4`,`4:1`,`1:8`,`8:1` | `512`, `1K`, `2K`, `4K` [LIVE 512, 2K] | 14 [LIVE 3] | if requested (thinking deferred, D11) |
| `gemini-3.1-flash-lite-image` | Stable | STD + extended [LIVE `1:4`] | `1K` only [LIVE 2K → 400] | 14 [DOC] | same |
| `gemini-3-pro-image` | Stable | STD | `1K`, `2K`, `4K` | 14 | always thinks; interim thought images possible [DOC] |
| *(not cataloged — D2)* `gemini-2.5-flash-image` | shutdown 2026-10-02 | STD | none | 3 recommended | none |
| *(not cataloged — D2)* `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` | past shutdown 2026-06-25, still live | — | | | |

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
| `resolution1080p` constraint struct | `config.ts:599-602` | **kept, `@deprecated`**; `durationRequired` added beside it — expresses 1080p *and* 4k → `'8'` (D5, additive) |
| Constraint types `ModelConstraint`, `VeoModelConstraint`, `VeoFeatures`, `VeoModelInfo` | `types/index.ts` | **kept field-for-field**; `imageSizes` and `durationRequired` added (D5) |
| Veo feature-gate branches (refs/extension unsupported) | `config.ts:805-817, 854-856` | **kept** — now exercised by Lite |
| `hasAudio: ... ?? true` | `veo-api.ts:673` | **kept unchanged**. v0.1.0 listed it for removal on a wrong rationale; the fallback serves unknown/metadata-less models, and every current model has audio. The public `VeoExtractedVideo.hasAudio` field stays. |
| Unknown Veo model throws in validation | `config.ts:722-725` | **changed** to passthrough (D3) |
| `getModelInfo(unknown)` throws | `veo-api.ts:700-702` | **kept**; `isKnownVeoModel` / `isKnownImageModel` added (D3) |
| `new GoogleGenAI({ apiKey })` | `api.ts:56`; `veo-api.ts:88`; `video-api.ts:74` | **pinned** `vertexai: false` (D5) |
| `MODELS.GEMINI` (`gemini-2.5-flash-image`) | `config.ts:58` | **removed** — model has an announced shutdown (D2); not repointed |
| `MODELS.GEMINI_3_PRO` (`gemini-3-pro-image-preview`) | `config.ts:59` | key kept, **value → `gemini-3-pro-image`**; the preview id leaves the catalog (D2), still callable via D3 |
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

**D2 — The catalog lists current models only** (Alex, 2026-09-22: "Any models that will be removed soon, we can drop from the package completely"). A model is in the catalog iff it generates [LIVE] **and** Google's deprecations page shows no shutdown date for it. A model that 404s, or that gains a shutdown date, is removed from the package in the next release — constants, constraints, types, CLI aliases, README. Removal never cuts a caller off early: under D3 the id still passes through with a warning for as long as Google serves it.

Applied at 2.0.0 — removed, beyond the 404'd Imagen/Veo 3.0/2.0 surface (the CLI's `--gemini` is a mode flag, not a model alias, and stays — D8):
- `gemini-2.5-flash-image` (shutdown 2026-10-02) — the 1.x default; `MODELS.GEMINI` pointed at it.
- `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` (shutdown 2026-06-25; still generating 2026-09-22 per V2, and still callable via D3).

Checked against every remaining catalog id (`docs/api/deprecations.md`, 2026-09-22): `gemini-2.5-flash`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, and all three Veo 3.1 previews show "No shutdown date announced"; `gemini-3.1-flash-lite-image` is not listed. Nothing else is removed.

**`MODELS.GEMINI` is removed, not repointed.** Repointing it at `gemini-3.1-flash-image` would keep 1.x code compiling while silently changing which model it calls — the semantics-without-signature change this spec has now caught three times. A removed key fails at compile time (TS) or yields `undefined` → the D4 default (JS), and has a §6 row.

*No deprecated tier in 2.0.* v0.1.0–v0.4.0 carried a `MODEL_DEPRECATIONS` table, a warn-once mechanism and an injectable clock for these three models. With the policy above there is nothing to put in the table, so the machinery is not built (−~60 LOC in P3a; V7 retired). How the rule stays true without it: D16.

*Superseded rationale, recorded:* the openai precedent ("nothing was removed on this package's own initiative") was the reason for a deprecated tier. Alex's call replaces it for this package: announced-dead models are not worth catalog surface, and D3 already provides the grace period a deprecated tier existed to give.

**D3 — Unknown model ids pass through, for image and video.** Types: `GeminiModel` = the known image-id union, `ImageModelId = GeminiModel | (string & {})`; `VeoModel` = the known Veo union, `VeoModelId = VeoModel | (string & {})`. Exported tables keep their 1.x index types (`MODEL_CONSTRAINTS`, `VEO_MODEL_CONSTRAINTS` are string-keyed and stay so, §5); only internal lookups narrow with `isKnown*Model` guards. `GeminiModel` becomes the three current image ids plus `gemini-2.5-flash` (1.x had three ids including it, `types/index.ts:45-48`). Unknown id → one `logger.warn` per id per instance ("not in this package's catalog; sending without capability validation"), then only **shape** checks run and every declared parameter is sent.

*Shape* (always enforced, for every id) vs *capability* (known ids only, downgradable by D5's `'warn'`):

| | Shape | Capability |
|---|---|---|
| Image | prompt present, ≤ `PROMPT_MAX_LENGTH` (10 000); each input image has a `mimeType` matching `/^image\/[a-z0-9.+-]+$/` and non-empty base64 `data`; `aspectRatio` matches `/^\d+:\d+$/`; `imageSize` matches `/^\d+K?$/` (uppercase K; rejects `'2k'`) | ratio ∈ model's list; size ∈ model's list (or param not accepted); input count ≤ `inputImagesMax`; `mimeType` ∈ `SUPPORTED_IMAGE_MIME_TYPES` (the 1.x set, incl. `image/gif`, which `imageToInlineData` produces); `numberOfImages`, if passed, is `1` (the 1.x Gemini rule, `config.ts:337-340`, kept; `ModelValidationParams.numberOfImages` stays in the type) |
| Veo | prompt required except extension/interpolation; every image param (`image`, `firstFrame`, `lastFrame`, reference images) has `imageBytes`+`mimeType`; interpolation requires both `firstFrame` and `lastFrame` (the public names, `types/index.ts:265-272` — the builder maps `firstFrame` → the SDK's `image`); `personGeneration` matches `/^[a-z_]+$/` (membership in the vendor enum is capability — run #3: a closed enum in the always-on tier contradicted the open-shape rule); `durationSeconds` is a numeric string; `resolution` matches `/^\d+(p|k)$/` | aspect ∈ model's list; resolution ∈ model's list; duration ∈ model's list; `durationRequired` per resolution; feature gates (refs, extension, interpolation); reference count; extension 720p-only; `personGeneration` ∈ `VEO_PERSON_GENERATION` |

Shape patterns are deliberately open (run #2 A11): a future `8K` or `3:1` passes shape and reaches the vendor, which is the point of passthrough. Types follow: `AspectRatio` and `ImageSize` are known-value unions `| (string & {})`.

**"Sent as-is" means every *declared* parameter is mapped** — nothing declared is dropped for lack of a constraint entry (dropping would recreate §1.4). The one exception is pre-existing and kept: 1.x's per-mode constants — interpolation forces `durationSeconds: 8` and does not send `resolution`/`personGeneration` (`veo-api.ts:405-411`); extension forces 720p/`numberOfVideos: 1` and does not send `aspectRatio`/`durationSeconds`/`personGeneration` (`veo-api.ts:466-473`). These are vendor mode rules, not dropped caller intent; they are listed as constant rows in D12's table and unchanged from 1.x. The bound, stated rather than hidden: the builders map what `GeminiGenerateParams` / `VeoGenerateParams` declare, and the **SDK serializer is itself an allowlist** (§1.5) — so a vendor field this package does not declare cannot be sent in 2.0. It reaches callers when a release declares it (after an SDK minor has learned it).

*v0.3.0 added an `extraConfig` escape hatch here; v0.4.0 removes it* (run #3 A2, architect #5). A merge-last object could replace the validated `imageConfig` (recreating §1.4), override `responseModalities`, bypass Lite's capability gates, reintroduce `thinkingConfig`/`tools` (voiding D11) and `seed` (voiding D15), and set `httpOptions` retries (voiding D12's one-fetch premise). No consumer asked for it; it was scope added to answer a review finding. Removing it closes every one of those at once. Candidate for 2.1 with a collision rule, if a real consumer needs it.

`getModelInfo(id)` keeps its 1.x contract — returns `VeoModelInfo` for a known id, throws for an unknown one (it is catalog introspection, and "not in the catalog" is the correct answer). New `isKnownImageModel(id)` / `isKnownVeoModel(id)` type guards let callers ask without catching. Known id → full capability validation (D5).

*Why:* darkroom sent `gemini-3.1-flash-image` to a package that didn't know it, and the next Google model would otherwise break every consumer on release day; all Veo models are preview, so video needs this more than image. kling D9 precedent (applies to video there too). v0.1.0's migration row "unknown model → throws" was wrong for the library — `generateWithGemini` never validated; only the CLI (`cli.ts:795`) and Veo (`config.ts:722`) threw.

**D4 — Default image model `gemini-3.1-flash-image`.** Google's named replacement for Imagen and (corrected) for 2.5-flash-image; GA; widest capability set; live-verified. Exported as `DEFAULT_IMAGE_MODEL`. Veo default unchanged (`veo-3.1-generate-preview`). *Consequence:* callers relying on the implicit default get a different model — CHANGELOG `Changed`.

**D5 — Capability validation, in the library, from the constraint table; every 1.x export keeps its shape and contract.**

*Constraint tables — additive only* (run #3 AF-006: v0.3.0 replaced shapes that `./config` exports and `getModelInfo()` returns):
- `ModelConstraint` (image) keeps every 1.x field — `aspectRatios`, `promptMaxLength`, `numberOfImages`, `inputImagesMax`, `supportedModes`, `features`, `responseFormat`, `video` — with the same types and meanings. **Added:** `imageSizes?: ImageSize[] | null` (`null`/absent = parameter not accepted). `inputImagesMax` is the per-model input limit (1 → up to 14); it is not renamed. The `'gemini-2.5-flash'` video-understanding entry stays in `MODEL_CONSTRAINTS` unchanged.
- `VeoModelConstraint` keeps every 1.x field — `aspectRatios`, `resolutions`, `durations`, `features: { textToVideo, imageToVideo, referenceImages, interpolation, extension, nativeAudio }` (all `boolean`, unchanged), `referenceImages: { max } | null`, `extension: {...} | null`, `resolution1080p: {...} | null`, `promptMaxLength`. **Added:** `durationRequired: Partial<Record<VeoResolution, VeoDuration>>` (expresses the 4k rule the 1080p struct cannot). `resolution1080p` stays populated for 3.1/Fast/Lite and is marked `@deprecated` in favor of `durationRequired`. Lite: `features.referenceImages = false`, `features.extension = false`, `referenceImages = null`, `extension = null`, no `4k`.
- `VeoModelInfo` (from `getModelInfo`) is unchanged in shape. `hasAudio` keeps reading `features.nativeAudio` (true for all three models).

*Checking core:* pure `getModelViolations(model, params): Violation[]` and `getVeoViolations(model, params, mode = VEO_MODES.TEXT_TO_VIDEO): Violation[]`, `Violation = { kind: 'shape' | 'capability'; param: string; value: unknown; allowed?: readonly unknown[]; message: string }`. Unknown model → shape violations only. No model-id comparisons anywhere.

*Exported validators keep their 1.x contract* (run #2 AF-006): `validateModelParams(model, params): void` and `validateVeoParams(model, params, mode = TEXT_TO_VIDEO): boolean` (returns `true`) — same parameters, same return, still **throw** on the first violation, now as `ValidationError`. The one contract change — no throw for an unknown model id (D3) — is a §6 row and a CHANGELOG `Changed` entry.

*`ValidationError extends Error`* (`name = 'ValidationError'`, `violations: Violation[]`), defined in `src/errors.ts`, exported from `./config` and the root. `instanceof Error` and `.message` behave as 1.x's plain `Error`, so 1.x `catch` code is unaffected.

*Clients:* `GoogleGenAIAPI` and `GoogleGenAIVeoAPI` call the violation functions before any network call (new for `generateWithGemini` — CHANGELOG `Changed`; Veo already validated in its library path, `veo-api.ts:213, 279, 333, 398, 463`). Shape violations always throw `ValidationError`. Capability violations throw by default, or under constructor `options.capabilityValidation: 'warn'` are logged (one `warn` per violation) and the request is sent — image and Veo alike. Validation runs **before** the `try` that applies production error handling, so a `ValidationError` always reaches the caller intact.

*CLI* (run #3 architect #4): the CLI stops calling the throwing validators with placeholder inputs (`cli.ts:791` passes `{ data: '' }`, which the new shape rule rejects). Pre-flight becomes `get*Violations` on the **real** decoded inputs, honoring `--capability-validation`; the clients then run the same check again, which is idempotent.

*Constructor:* `(apiKey: string, logLevel = 'info', options?: { capabilityValidation?: 'error' | 'warn' })` on both clients — the 1.x signature with an optional third argument; a missing key still throws "API key is required" (`api.ts:51`, `veo-api.ts:84`). Both pin `new GoogleGenAI({ apiKey, vertexai: false })` (run #3 A6): SDK 2.24 honors `GOOGLE_GENAI_USE_VERTEXAI`/`GOOGLE_GENAI_USE_ENTERPRISE` (`index.mjs:27486-27501`) and 1.30 honors the former (`:17354`), which would silently move a consumer onto a different serializer and endpoint. This package is Gemini-API-only; pinning makes that true rather than environmental. (`GOOGLE_GEMINI_BASE_URL` is left honored — it changes the host, not the protocol.)

*Module graph* (run #3 architect #15): `src/errors.ts` is a leaf — it imports nothing from this package. `config.ts`, `api.ts`, `veo-api.ts` import from it.

*Payload size:* validation checks image *count*, not total inline bytes; the inline request ceiling is [VERIFY: not in snapshots]; only 3 inputs were exercised live. README states both. No client check.

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

**D8 — CLI.** `--model <id>` selects the image model (default D4; unknown ids pass with a warning, D3). `--gemini` retained **as the image-mode flag** (the CLI requires one mode flag, `cli.ts:391`; removing it would break every image command) — its 1.x help text "Use Gemini 2.5 Flash Image model" (`cli.ts:327`) becomes "Image generation/editing (model: `--model`, default `gemini-3.1-flash-image`)". This is **not** the `MODELS.GEMINI` case D2 rejects: that key's only content was a model id, so repointing it changes its meaning silently; `--gemini`'s primary function is selecting the image mode, which is unchanged, and the model change is announced in its help, §6 and the CHANGELOG; `--gemini-3-pro` retained as alias for `gemini-3-pro-image`. `--input-image` repeatable, count checked per D5. New `--image-size`, `--capability-validation <error|warn>`. `--aspect-ratio` has no default. Veo `--veo-resolution` accepts `4k`. Removed: `--imagen`, `-n`. `_N` suffix kept and applied **after** thought parts are filtered (Pro's interim thought images never become `_2` files); metadata filename fixed; zero images → non-zero exit naming the `finishReason`.

CLI tests (`test/cli.test.ts`) spawn `node dist/cli.js`, which cannot see a fetch stub in the test process (run #2). Isolation: `node --import ./test/helpers/fetch-replay.mjs dist/cli.js …`, where the preload replaces `globalThis.fetch` with a replayer that serves a canned response named by env `WIRE_FIXTURE` and fails the process on any unexpected request. `GOOGLE_GENAI_API_KEY=test` is set per spawn; `HOME` points at a temp dir so no real `~/.google-genai/.env` is read. Scenarios: validation-exit paths (no network), one image success, one zero-image exit, one Veo submit. `dist/` is rebuilt in vitest `globalSetup` before the CLI suite, so a bare `npm test` can never pass against a stale build.

**D9 — Platform and SDK-drift detection.** `engines.node >=20` (the SDK's floor since 1.0.1); CI matrix 20/22/24. TS ^5.9, vitest ^4, `@types/node` ^24 (sibling parity). axios retained (`utils.ts`, `video-api.ts`) — out of scope.

`@google/genai ^2.24.0`, caret retained. A library ships no lockfile; each consumer resolves its own 2.x minor, and nothing here can prevent a consumer installing one this repo never tested. So: **detection, not prevention**, with its own limits stated.
- `.github/workflows/sdk-drift.yml`, weekly cron + manual dispatch: `npm ci`, then `npm install @google/genai@^2 --no-save` — the newest version a `^2.24.0` consumer can reach, **not** `@latest`, which moves to 3.x at Google's next major and would raise a false alarm while dropping 2.x coverage (run #3 A7) — then the **full** `npm run verify` (typecheck + build + all tests), not wire tests alone (run #3 A9: type breaks and response-parsing drift are drift too).
- On failure the job opens (or comments on) a GitHub issue labeled `sdk-drift` via `GITHUB_TOKEN`, so a red run is visible in the repo, not only in one person's email (run #3 A1).
- Limits, recorded in §9: GitHub disables scheduled workflows in public repos after 60 days without repository activity (this repo is public — `gh repo view`, 2026-09-22), and the schedule runs only from the default branch, renamed in P7. Re-enabling is one click; the README's maintainer notes say so. A keep-alive commit bot is rejected as noise.

**D10 — Release mechanics.**
- Remove semantic-release (`.releaserc.json`, `release.yml`, 6 devDeps, script). Add `.github/workflows/ci.yml` (push/PR, Node 20/22/24, `npm ci && npm run verify`) — verifies, never publishes.
- `verify` = typecheck + build + test. Add openai's `check:release` as `prepublishOnly` guard: refuses if `package.json` version lacks a matching `## [x.y.z] — date` CHANGELOG heading, if `[Unreleased]` is non-empty, if `dist/` is older than `src/`, or if `npm pack --dry-run` lists files outside `package.json`, `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` (answers A13; `package.json` is always packed — run #3).
- Version bump, tag and GitHub release are manual and listed as checklist items (A13).
- Branch rename `master` → `main`: prepared locally; Alex pushes and flips the GitHub default.
- **Pre-publish validation uses the packed tarball, not Verdaccio** (run #3 A10; darkroom is personal and unreleased). The workspace's Verdaccio discipline exists for `@uluops/*` scoped packages; for this unscoped package, `--registry` would route every newly resolved dependency — including darkroom's sibling unscoped packages (`bfl-api`, `openai-image-api`, …) via npm's `replace-registry-host` — through Verdaccio. `npm pack` produces the exact bytes `npm publish` uploads, which is the property Verdaccio validation is for. So: `npm pack` → in darkroom, `npm install ../path/google-genai-api-2.0.0.tgz` → `npm ls google-genai-api @google/genai` shows 2.0.0 and a 2.x SDK → V9. After npm promotion, darkroom runs `npm install google-genai-api@^2.0.0` (from npmjs), and the lockfile check is: no `file:` and no `localhost:4873` entries for `google-genai-api`, and its resolved URL returns 200 (public package — bare `curl`). This deviation from the Verdaccio-first convention is deliberate and recorded here.
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
| Veo `model` | URL `…/models/{model}:predictLongRunning` |
| Veo `prompt` / `image` / `video` (extension) | `instances[0].prompt` / `.image` / `.video` |
| Veo interpolation `firstFrame` | `instances[0].image` |
| Veo `lastFrame` / `referenceImages` | `instances[0].lastFrame` / `.referenceImages` |
| Veo `aspectRatio` / `resolution` / `durationSeconds` / `negativePrompt` / `personGeneration` | `parameters.<same>` (`durationSeconds` numeric) |
| (constant, extension: `numberOfVideos: 1`, 720p; `veo-api.ts:466-473`) | `parameters.sampleCount = 1`, `parameters.resolution = '720p'`; no `aspectRatio`/`durationSeconds`/`personGeneration` |
| (constant, interpolation: `veo-api.ts:405-411`) | `parameters.durationSeconds = 8`; no `resolution`/`personGeneration` |

Also: unknown image and Veo ids produce the same body shape with the id in the URL (D3); canned 400 (JSON), **400 (`text/html` body)**, 403, 429 responses produce the D13 error shape in production and non-production modes; `GOOGLE_GENAI_USE_VERTEXAI=true` in the environment does not change the URL host (D5 `vertexai: false`).

**Mutation controls** (each must turn the suite red, recorded in the checklist): revert `api.ts` to the 1.x flat `{ aspectRatio }`; drop `imageSize` for unknown ids; revert Veo to top-level `prompt`/`image`/`video` — both shapes serialize to the same body, so the observable is the SDK's deprecation warning (2.24 `index.mjs:15469`, `console.warn('The generateVideos method with prompt/image/video arguments is deprecated…')`): the Veo wire tests spy on `console.warn` and assert it never fires (run #3 architect #9).

The existing mocked unit tests remain for logic; wire tests own "does the field reach the network". This is the layer whose absence let §1.4 ship. D9's weekly job runs the full suite, this file included, against `@google/genai@^2`.

**D13 — Error surface.** Production sanitization hides the two failures this release creates on purpose: model-not-found (D3) and post-shutdown rejection (D2). Loosening it has to be exact about what the SDK hands over, because the SDK makes `ApiError.message` = `JSON.stringify` of the **whole** error body, `details[]` included (1.30 `:11714`, 2.24 `:14036`), and wraps a **non-JSON** body (proxy/HTML/plaintext) as `{error: {message: <raw text>, code, status: <HTTP statusText>}}` before stringifying (1.30 `:11705-11711`, 2.24 `:14027-14034`) — so "parse the JSON" alone cannot tell a vendor error from a proxy page (run #3 A3, architect #2).

One shared `toPublicError(err, { surface: 'image' | 'video' })` in `src/errors.ts`, used by both clients:

1. **Extract.** `status` = `err.status` (HTTP). For Veo **operation** errors (thrown during polling from `operation.error`, `veo-api.ts:555-560` — no HTTP status, message is the operation's own `error.message` field from parsed JSON), `code` = `err.operationError.code` (gRPC numeric) and the vendor message is that field directly. For HTTP errors, parse `err.message` as JSON; the vendor message is `error.message` **only if** `error.status` is one of the 17 gRPC canonical status names (`OK` … `UNAUTHENTICATED`) — which the Gemini API always sends, and which the SDK's non-JSON wrapper (it copies HTTP `statusText`) would match only if a proxy's reason phrase were literally one of those names. Matching the enumerated names, not a pattern (run #4: `BAD_REQUEST` would pass `/^[A-Z][A-Z_]+$/`; it is not a gRPC name). `details[]` is never read.
2. **Classify** — status/code first, then text. HTTP: 401/403 → `AUTH`; 408/429/5xx → `TRANSIENT`; 400/404/422 → `USER_ACTIONABLE`. gRPC (operation errors): 4 `DEADLINE_EXCEEDED`, 8 `RESOURCE_EXHAUSTED`, 14 `UNAVAILABLE` → `TRANSIENT`; 3 `INVALID_ARGUMENT`, 5 `NOT_FOUND`, 9 `FAILED_PRECONDITION` → `USER_ACTIONABLE`; 7/16 → `AUTH`. Then, only on the extracted vendor message (never a raw body), safety terms → `SAFETY_BLOCKED` / `AUDIO_BLOCKED`.
3. **Errors with no status or code:** `ValidationError` never reaches here (D5). SDK client-side throws carry SDK text, no vendor data → message kept in all environments, `USER_ACTIONABLE`. Fetch `TypeError` → `NETWORK`; `AbortError` → `TIMEOUT`.
4. **Retry (Veo polling) — by source, not by code** (run #5). Only a failure of the **poll request itself** (`getVideosOperation` throwing: HTTP `TRANSIENT`, `NETWORK`, `TIMEOUT`) is retried — a superset of 1.x's 429/502/503 + network/timeout/ECONNRESET message matches (`veo-api.ts:153-162`), adding 408/500/504. A **finished** operation carrying `operation.error` is terminal whatever its gRPC code: it is thrown immediately, never retried. In 1.x that throw sat inside the polling `try` (`veo-api.ts:555-578`), so a finished job whose message mentioned "network"/"timeout" was re-polled up to `POLL_MAX_ATTEMPTS` (60 × 10 s ≈ 10 min) before surfacing; v0.4.1's gRPC 4/8/14 → `TRANSIENT` mapping would have extended that to quota failures. CHANGELOG `Fixed` (terminal errors surface at once) and `Changed` (poll-request retry set). gRPC codes still drive *classification* (step 2), not retry.
   - The **polling-timeout** error (`veo-api.ts:583-589`, thrown outside the `try`, with `isTimeout` and `operationName`) is **not** routed through `toPublicError` — unchanged from 1.x in every environment.
5. **What is thrown.**
   - **Non-production: the original error object**, with `status`, `code`, `classification`, `surface` **added as properties** — via `Object.defineProperty` (configurable, enumerable: false), never plain assignment: `DOMException.prototype.code` (Node's `AbortError`) is a getter with no setter, so `err.code = …` throws in ESM strict mode and would replace the caller's error (run #5). A property that already exists and cannot be redefined is left as-is (the SDK's `ApiError.status` already carries the same value); a non-extensible object is rethrown untouched. No wrapper, no `cause`. `instanceof ApiError`, `name`, `message` and Veo's `operationError` are exactly as 1.x rethrew them (`api.ts:199`, `veo-api.ts:193`) (run #4 AF-006: v0.4.0 wrapped it and lost that identity).
   - **Production: a new `Error`**, as 1.x production did (`api.ts:193-197`, `veo-api.ts` `_sanitizeError`), with message = a category sentence for the right surface ("Image generation…" / "Video generation…") plus the extracted vendor message (≤300 chars) for `USER_ACTIONABLE` and `SAFETY_*`, plus SDK client-side text; `AUTH` and `TRANSIENT` include the HTTP status and never vendor text. Properties: `status`, `code`, `classification`, `surface`. **No `cause`** — Node's `util.inspect` prints the cause chain, which would re-expose the full body.

This is a **Security**-category CHANGELOG entry: it changes what production errors disclose, in both directions (more for 400/404/422, never `details`/non-JSON/auth/quota).

*Note:* darkroom never sets `NODE_ENV=production`, so it receives the original SDK errors (step 5), now with four extra properties; D13's production path is for production consumers.

**D14 — Catalog stays in `config.ts`.** The architect suggested extracting to `models.ts` (kling). Declined for 2.0: `./config` is a public subpath that exports these constants; the removals shrink `config.ts` (878 LOC) by roughly a quarter; extraction is churn without a consumer benefit. The same reasoning covers `cli.ts` (931), `veo-api.ts` (712) and `types/index.ts` (955): P2's removals shrink all three, none gains a new responsibility, and splitting them is independent of anything 2.0 ships. Recorded, revisit in 2.1.

**D15 — Remove Veo `seed`.** Both SDKs reject `seed` in Gemini API mode before any request, with different wording: 1.30 "seed parameter is not supported in Gemini API." (`index.mjs:9166, 9424`), 2.24 "seed parameter is only supported in Gemini Enterprise Agent Platform mode, not in Gemini Developer API mode." (`:11059-11060`). Proven locally 2026-09-22 (§D12). `VeoGenerateParams.seed` (`types/index.ts:243`, forwarded `veo-api.ts:225`) has therefore failed every call that used it. With D5 pinning `vertexai: false`, it cannot work in this package. Removed from the type; and because a JS caller spreading `{ seed }` would otherwise go from a loud SDK throw to silent ignore (run #3 A13), a present `seed` key is a **shape** violation: `ValidationError` "seed was removed in 2.0: the Gemini Developer API does not support it". Tests assert on the `ValidationError`, never on SDK message text. darkroom never sends it (`providers.js:132-139`); other consumers [UNSEARCHED — not searchable]. CHANGELOG: `Removed`, with the reason.

**D16 — Lifecycle check** (Alex, 2026-09-22). D2's rule — catalog lists only models with no announced shutdown — stays true only if someone notices when Google announces one. `scripts/check-lifecycle.mjs` (~40 LOC, bfl `check:spec` precedent): fetch `https://ai.google.dev/gemini-api/docs/deprecations.md.txt`, parse the deprecation tables (model id, release date, shutdown date), and **fail** if any id in `MODELS`/`VEO_MODELS` has a shutdown date other than "No shutdown date announced", printing the id, date and listed replacement. It also fails if the page cannot be fetched or yields zero parsed rows (a check that parses nothing must not pass).
- `npm run check:lifecycle`; `--control` runs it against the committed snapshot `docs/api/deprecations.md` with the **1.x** catalog and must fail on `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `imagen-4.0-generate-001`, `veo-3.0-*`, `veo-2.0-*`.
- Runs in the weekly `sdk-drift.yml` job (same issue-on-failure path, label `model-lifecycle`) and in `check:release`, so a publish can't ship a model Google has put on notice.
- **Missing ids fail too** (run #5): any catalog id **not found** on the page fails the check, except an explicit allowlist in the script — currently `['gemini-3.1-flash-lite-image']` (not listed by Google, 2026-09-22). Otherwise a partial page restructure (one table losing its backticks) would parse rows elsewhere, pass the zero-row guard, and silently pass every id in the broken table. Duplicate rows (`gemini-3.8-live` appears twice) are tolerated; a catalog id with conflicting dates fails.
- **Sources:** normal runs import the catalog from `src/config.ts` via `tsx` (no build needed; the script is dev-only). `--control` reads the 1.x catalog from `git show 3e52d92:src/config.ts` and the page from `docs/api/deprecations.md`, both offline.
- **Network dependency:** `check:release` fetches the live page, so publishing needs network access and a Google docs outage blocks a publish. Accepted — publishing is manual and retryable; `check:release --offline` falls back to the committed snapshot with a printed warning, for use only when the page is down.
- A failure is a to-do (drop the model per D2 in the next release), not an outage: D3 keeps the id callable meanwhile.

## 5. Target catalog (constants)

```ts
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
MODELS = {
  GEMINI_3_1_FLASH: 'gemini-3.1-flash-image',
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite-image',
  GEMINI_3_PRO: 'gemini-3-pro-image',            // value changed from the preview id
  GEMINI_VIDEO: 'gemini-2.5-flash',              // video understanding, unchanged
}                                                // GEMINI and IMAGEN keys removed (D2, §6)
MODEL_CONSTRAINTS keys: all four MODELS values (the three image models + 'gemini-2.5-flash')
ASPECT_RATIOS (all known) = STD + '1:4','4:1','1:8','8:1'; per-model subsets in constraints
IMAGE_SIZES = ['512','1K','2K','4K']
SUPPORTED_IMAGE_MIME_TYPES = ['image/png','image/jpeg','image/webp','image/gif']   // the 1.x set, utils.ts:258
VEO_MODELS = { VEO_3_1, VEO_3_1_FAST, VEO_3_1_LITE }
VEO_RESOLUTIONS = ['720p','1080p','4k']
VEO_DURATIONS = ['4','6','8'] for all three
VeoModelConstraint.durationRequired = { '1080p': '8', '4k': '8' } (Lite: { '1080p': '8' })
```
`MODELS.GEMINI_3_PRO` and `MODELS.GEMINI_VIDEO` keep their key names. `MODEL_CONSTRAINTS` and `VEO_MODEL_CONSTRAINTS` keep their 1.x **string-keyed** index types (`types/index.ts:590-592, 659-661`) — re-keying them to a closed union would break consumers who index with a `string` (run #4).

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
| `VeoGenerateParams.seed` (always rejected by the SDK) | removed from the type; passing it throws `ValidationError` naming the removal |
| unknown model: library accepted silently; CLI and Veo threw | all paths: one warning, request sent as-is |
| `inputImagesMax: 1` for every image model; `detectGeminiMode` threw on >1 image | `inputImagesMax` per model (up to 14; same field name); `detectGeminiMode` never throws on count — it returns the mode only |
| `ModelConstraint` fields | all 1.x fields kept with the same types; `imageSizes` added |
| `MODEL_CONSTRAINTS['imagen-4.0-generate-001']`, `['gemini-2.5-flash-image']`, `['gemini-3-pro-image-preview']` | removed. The table is string-keyed, so these lookups still compile and return `undefined` at runtime — check with `isKnownImageModel` first |
| CLI `--gemini` = "Use Gemini 2.5 Flash Image model" | `--gemini` = image mode; model from `--model`, default `gemini-3.1-flash-image` |
| `AspectRatio` = 5 values; `ASPECT_RATIOS` 5 values | 14 values; per-model subsets |
| `GeminiModel` union: `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-2.5-flash` | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`, `gemini-2.5-flash`; model params accept any string (`ImageModelId`) |
| `MODELS.GEMINI` (`gemini-2.5-flash-image`) | removed (announced shutdown 2026-10-02); use `DEFAULT_IMAGE_MODEL`. The id itself still passes through (D3) until Google turns it off |
| `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` in the catalog | removed (past announced shutdown); still pass through (D3) |
| exported validators accepted empty image `data` and any ratio/size string shape | always reject empty image `data`, a malformed `mimeType`, and a ratio/size not matching the shape patterns (D3) — even for unknown models and under `'warn'` |
| `extractGeminiParts` returned thought parts as images/text | skips `thought: true` parts; `{ includeThoughts: true }` to keep |
| `GeminiResponse.parts` / fallback | removed (never an SDK field) |
| non-production errors: the SDK error rethrown | the same SDK error object, now with `status`, `code`, `classification`, `surface` properties |
| production errors: image all → one generic sentence; Veo → category sentence | both: per-surface category sentence + vendor `error.message` for 400/404/422 and Veo operation errors; `status`/`code`/`classification`/`surface` properties; never `details`, non-JSON bodies, 401/403/429 vendor text, or `cause` |
| Veo polling retried 429/502/503 + network message matches | retries 408/429/5xx, gRPC 4/8/14, network and timeout errors |
| `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2` | `VEO_3_1`, `VEO_3_1_FAST`, `VEO_3_1_LITE` |
| `VeoResolution` = `720p \| 1080p` | + `4k` (3.1, Fast) |
| `durationSeconds: '5'` | `'4' \| '6' \| '8'` |
| `VeoModelConstraint` / `VeoFeatures` / `VeoModelInfo` fields | all 1.x fields kept with the same types; `durationRequired` added; `resolution1080p` `@deprecated` (still populated) |
| `getModelInfo(unknown)` threw | unchanged (still throws); new `isKnownVeoModel(id)` / `isKnownImageModel(id)` |
| `new GoogleGenAI` could be moved to Vertex/Enterprise by env vars | pinned to the Gemini Developer API (`vertexai: false`) |
| CLI flags | added `--model`, `--image-size`, `--capability-validation`, repeatable `--input-image`, Veo `4k`; removed `--imagen`, `-n` |
| CLI `--imagen`, `-n 4` | `--model <id>`; one image per call |
| CLI `--aspect-ratio` default `1:1` | no default |
| Node ≥18 | Node ≥20 |

## 7. Verification

Every check states how it fails. Live checks (L) are recorded in the checklist with outcome; they are not part of `npm test`.

| # | Check | Fails when / control |
|---|---|---|
| V1 | `npm run verify` green on Node 20, 22, 24 (CI). Test count recorded (baseline 358). | any typecheck/test failure |
| V2 (L) | Past-shutdown previews generate ≥1 `inlineData` image part | **done**: both OK (informed v0.2–v0.4's deprecated tier; superseded by D2's current-only rule) |
| V3 (L) | Neutral prompt, `9:16` via 2.0 → height > width | **done**: control 1.x flat → 1408×768; fix → 768×1376 |
| V4 | Mocked unit: `generateContent` receives `config.imageConfig.aspectRatio` | mutation: flat shape → fails |
| V5 | Dead-literal census `grep -rniE "imagen\|veo-3\.0\|veo-2\.0\|VEO_3[^_]\|VEO_3_FAST\|VEO_2[^_0-9]" src test package.json README.md` → **only** lines inside README's "Upgrading to 2.0" section | control: run before P2 and record the count (must be >0; v0.1.0's case-sensitive form matched 79 lines and missed 98) |
| V6 | Unknown id: one warn per id, request sent with every caller param; known id + unsupported param → throws; `'warn'` mode → warns and sends | mutations: restore unknown-model throw; drop `imageSize` for unknown ids → tests fail |
| V7 | *(retired in v0.4.1 — no deprecation machinery; see D2)* | — |
| V8 (L) | Lite refs rejected; Lite 720p/4s completes | **done**: server 400 on refs; T2V OK. Client-side: Lite refs/extension/4k rejected before any call (unit) |
| V9 (L) | darkroom (test bed): installs the `npm pack` tarball; `npm ls google-genai-api @google/genai` shows 2.0.0 and a 2.x SDK; darkroom tests pass; one job per darkroom Google model (`gemini-3-pro-image`, `gemini-3.1-flash-image`, `veo-3.1`, `veo-3.1-fast`) succeeds | `npm ls` shows 1.3.0 → run void |
| V10 (L) | `imageSize` `'512'` → 512 px, `'2K'` → 2048 px on 3.1-flash; Lite `'2K'` rejected | **done**; client-side lowercase `'2k'` → shape error (unit) |
| V11 (L) | 3 input images on 3.1-flash → ≥1 image part | **done**: OK |
| V12 (L) | Against the built 2.0 package: `veo-3.1-fast-generate-preview` 720p/4s T2V; `veo-3.1-generate-preview` with 1 reference image; `veo-3.1-generate-preview` 4k/8s — each downloads a video | any failure blocks release; 4k/refs failing live → constraint corrected before publish |
| V13 | Wire tests (D12): every row of D12's table, exactly one fetch per call | the three D12 mutations each turn it red (recorded); canned 400/403/429 → D13 shape in both modes |
| V14 | `check:release` refuses a publish with a stale `dist/`, a missing CHANGELOG heading, a non-empty `[Unreleased]`, or extra tarball files | each condition induced once → refuses |
| V15 | README census, three greps, each → 0 after P6: `default: '?1:1` · the 1.x ratio list `1:1, 3:4, 4:3, 9:16, 16:9` · hardcoded test stats `358\|88\.47` | controls before P6 (2026-09-22): 8 · 9 · 7 |
| V16 (L) | **Through the built 2.0 package on SDK 2.24** (not raw SDK calls): neutral prompt, `9:16` on `gemini-3.1-flash-image` → height > width; `imageSize: '2K'` → 2048 px long edge | a square or landscape result blocks release — the headline Fixed entry is verified on the shipped artifact, not on 1.30 (run #2 A9) |
| V17 | `test/readme.test.ts`: (a) every identifier in README export blocks and in `import … from 'google-genai-api…'` examples resolves for its subpath against the **union** of runtime exports (`Object.keys(await import(subpath))`) and exported symbols of the subpath's `.d.ts` (parsed with the TypeScript compiler API) — interfaces and type aliases exist only in the latter (run #3 docs); (b) every `<!-- generated:… -->` block equals a fresh render from the catalog; (c) every TOC link targets an existing heading anchor | controls: 1.x README + 1.x dist fails (a) at `:456-494, :532-552`; hand-edit one generated cell fails (b); rename one heading fails (c) |
| V18 | SDK-drift job (D9) runs green on `@google/genai@^2` at P7, and a failure opens an `sdk-drift` issue | control: dispatch once with a deliberately broken assertion → job fails **and** the issue appears |
| V19 | `check:lifecycle` (D16) passes on the 2.0 catalog against the live deprecations page | control `--control`: 1.x catalog against the committed snapshot → fails, naming `gemini-2.5-flash-image` and the Imagen/Veo 3.0/2.0 ids; a fetch that parses zero rows → fails |

**Every check is classified** (run #3: v0.3.0 classified 6 of 18 and its V12 row contradicted the paragraph).
- **Blocking** — the release does not ship while red: V1, V4, V5, V6, V13, V14, V15, V16, V17, V18, V19.
- **Done (P0)** — recorded, not re-run: V2, V3, V8, V10, V11.
- **Degradable** — V12, per capability:
  - *Veo 4k or reference images fail live* → that capability's constraint becomes unsupported for that model (clients reject it with a clear `ValidationError`, overridable by `'warn'`); CHANGELOG notes it; ship.
  - *A whole model fails live (e.g. Fast)* → a capability flag cannot express that. The id is **removed from the catalog** (it becomes an unknown id: passthrough with a warning, D3), the CHANGELOG says why, ship.
  - **One failure is not evidence** (run #3 A4): a V12 failure is retried twice more, minutes apart; it degrades only on three consecutive failures with the same vendor error. A 429 or 5xx never degrades anything — it retries later.
- **Advisory** — V9 (darkroom test bed). A darkroom failure is investigated; it blocks only if it reproduces against the packed tarball outside darkroom.

## 8. Phases

LOC = added + changed lines, per phase split into source and test (round 2 asked for test budgets explicitly). Total ≈ 800 src + 710 test ≈ 1,510 (v0.4.1: −60 src/−20 test for the dropped deprecation machinery, +40 for `check:lifecycle`) (v0.4.0: +60 script/+40 test for generated tables, −30 for removing `extraConfig`; P3a unchanged at 440 — the additive constraint shapes touch fewer lines than v0.3.0's replacement, which offsets the new type guards) — higher than v0.2.0's 1,190, which folded test rewrites in implicitly. No phase exceeds 440. Removals are not counted.

| Phase | Scope | Files | Est. LOC | Exit |
|---|---|---|---|---|
| P0 | Spec, review ×2, probes | docs/ | — | review PROCEED; all [VERIFY] settled or assigned to a V-check |
| P1 | Tooling/release: D9, D10 (not rename), D16 — SDK bump, CI, weekly SDK-drift workflow, `check:lifecycle`, `verify`, `check:release` | package.json, lock, ci.yml, sdk-drift.yml, scripts/check-release.mjs, scripts/check-lifecycle.mjs | 180 | `verify` green on SDK 2.24 with compile fixes only; V14 |
| P2 | Removals (§3) | api.ts, config.ts, types, cli.ts, 3 tests, package.json | 60 (net −~900) | V5 = 0 with recorded control |
| P3a | Catalog (current models only, D2), constraints (additive), D3 passthrough + shape/capability split, D5 violation functions + `ValidationError` + `capabilityValidation` + type guards; rewrite of the 17 throw-style `validateModelParams` sites in `test/config.test.ts` | config.ts, errors.ts (new), api.ts, types; test/config.test.ts, test/api.test.ts | 200 src + 160 test | V6 unit-green |
| P3b | D6 request shape, `extractGeminiParts` thoughts, zero-image path, D13 `toPublicError` (both clients), D12 wire tests (image) | api.ts, errors.ts, veo-api.ts (errors only), types, test/wire.test.ts, test/api.test.ts | 200 src + 150 test | V4, V13 (image) green |
| P4 | Veo: Lite, 4k, `durationRequired`, D3 + D5 for Veo, D7 `source`, D15 `seed` removal, wire tests (video); legacy negative tests repointed at Lite | config.ts, veo-api.ts, types; test/config.test.ts, test/veo-api.test.ts, test/wire.test.ts | 150 src + 150 test | V13 (video); Lite gating unit tests |
| P5 | CLI: D8; subprocess tests with the fetch-replay preload (CLI has 0 tests today) | cli.ts, test/cli.test.ts, test/helpers/fetch-replay.mjs | 110 src + 150 test | CLI tests green |
| P6 | Docs (full scope below), generated tables, README test, CHANGELOG, archive MIGRATION-PLAN | README, CHANGELOG, scripts/render-readme-tables.mjs, test/readme.test.ts | 60 src + 100 test | V15, V17; V5 README clause |
| P7 | Merged-tree verify; V16, V18; `npm pack` → darkroom V9; V12; branch rename; publish; darkroom pin bump; deprecate | — | — | npm 2.0.0; darkroom on 2.0.0 from npmjs |

**P6 README scope — method, not a line list.** Two review rounds each found ~10 README locations the previous round's enumeration missed, because each enumeration was built from the prior round's findings (run #2 docs). v0.3.0 stops enumerating. P6 **rewrites the README section by section, top to bottom**, holding every section against §3 and §6; the gate is mechanical, not a list:
- V5 (dead literals) — only inside "Upgrading to 2.0";
- V15 (three greps: `default: 1:1`, the 1.x five-ratio list, hardcoded test stats) — 0;
- V17 (every export and import the README claims resolves against the built package);
- plus a reviewer read of the rendered README by `public-interface-validator` before P7.

Known-affected locations, recorded as a **floor** so none is forgotten, not as the scope: intro `:10`; Quick Start `:26-30`; Overview `:78-82, :94`; Public API export blocks `:100-180` (drop `extractImagenImages`; add `DEFAULT_IMAGE_MODEL`, `IMAGE_SIZES`, `SUPPORTED_IMAGE_MIME_TYPES`, `isKnownImageModel`, `isKnownVeoModel`, `ValidationError`, `getModelViolations`, `getVeoViolations`; `4k` in `VEO_RESOLUTIONS`); method summary `:186-187`; Models `:195-287`; type-export claims `:456-494, :532-552`; Type-Safe Parameters `:504-530`; CLI Usage `:585-628`; method docs `:682-703, :727-741`; Examples `:798-839, :901-907`; data tree `:984`; Security/validation bullets `:1073-1075`; error examples `:1108-1110` (its `'5:4'` "invalid" example is **valid** in 2.0); Troubleshooting `:1162-1189`; dev scripts `:1245`; test stats `:7-8, :94, :1259-1274, :1329`; Imagen link `:1305`; TOC `:58-72` gains "Upgrading to 2.0" and "Model lifecycle".

New sections: "Upgrading to 2.0" (§6), "Model lifecycle" (D2 current-only rule, D16 `check:lifecycle`, D3 passthrough for removed ids, `capabilityValidation`), "Known limitations" (§9), "Maintainer notes" (re-enabling the scheduled drift job).

**Value-level drift** (run #3 docs: retired versions in bare form — `(3.1, 3.0, 2.0)` at `:116` — missing enum members — `4k` at `:172`, `:528` — and stale type-comments escape V5/V15/V17). Closed the kling way: every model/value table in the README is **generated** from the catalog constants between `<!-- generated:… -->` markers by `scripts/render-readme-tables.mjs`, and `test/readme.test.ts` fails if a marked block differs from a fresh render (kling `render-model-tables.mjs` + `readme.test.ts` precedent). Hand-written prose and code comments do not repeat value lists; they link to the generated tables. The per-file coverage block (`:1265-1271`) is deleted, not regenerated.

**CHANGELOG plan** (Keep a Changelog). Written by walking **every row of §3 and §6** — each row maps to a CHANGELOG line or is marked internal in the P6 checklist (run #3 docs). The table below is the expected result of that walk, not a substitute for it. Fix the file structure first: move the `# Changelog` header and attribution (`:92-97`, a semantic-release prepend artifact) to the top; add a note that entries before 2.0.0 were generated by semantic-release in conventional-commit style (openai/bfl wording); keep an empty `## [Unreleased]` above the release heading (D10's `check:release` requires it). Then `## [2.0.0] — <date>`, sections in canonical order:

| Category | Source |
|---|---|
| Added | 3.1 Flash / Lite / 3 Pro GA; Veo Lite; Veo 4k; `imageSize`; extended aspect ratios (14 values; `1:4`, `4:1`, `1:8`, `8:1` on 3.1); multi-image input (up to 14); `DEFAULT_IMAGE_MODEL`; `SUPPORTED_IMAGE_MIME_TYPES`; `capabilityValidation`; `ValidationError`; `getModelViolations` / `getVeoViolations`; `isKnownImageModel` / `isKnownVeoModel`; `durationRequired`; error `status`/`code`/`classification`/`surface`; CLI `--model`, `--image-size`, `--capability-validation`, repeatable `--input-image`; weekly SDK-drift and model-lifecycle checks (`check:lifecycle`) |
| Changed | default model (D4); library validation for image (D5); `detectGeminiMode` no longer throws on image count; SDK client pinned to the Gemini Developer API (`vertexai: false`); `VeoDuration` no longer includes `'5'` (Veo 2 only); Veo polling retries 408/5xx and gRPC 4/8/14 in addition to 1.x's set; non-production errors gain `status`/`code`/`classification`/`surface` properties; unknown-id passthrough, incl. `validateModelParams`/`validateVeoParams` no longer throwing on unknown ids (D3); `extractGeminiParts` skips thoughts (D6); `MODELS.GEMINI_3_PRO` value; Veo `source` (D7); constraint shapes; **CLI `--aspect-ratio` no longer defaults to `1:1`**; Node ≥20; SDK 2.x |
| Deprecated | `VeoModelConstraint.resolution1080p` in favor of `durationRequired` |
| Removed | `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` from the catalog and `MODELS.GEMINI` (announced shutdowns, D2 — ids still pass through); Imagen surface; Veo 3.0/2.0; Veo `seed` (always rejected by the SDK on this API, D15); `GeminiResponse.parts`; CLI `--imagen`/`-n`; semantic-release |
| Fixed | **`aspectRatio` was never sent — now honored; output framing changes for every caller that passed it** (the semantics-without-signature case, stated explicitly); CLI metadata filename; `detectGeminiMode` mode bypass; Pro thought images no longer returned as output |
| Security | production errors now include the vendor's `error.message` field for 400/404/422 and Veo operation errors; `details[]`, non-JSON bodies, and 401/403/429 vendor text are never included (D13) |

**darkroom (test bed).** Remap done on 1.3.0 (§1.6); the 2.5 catalog entry is darkroom's to retire before 2026-10-02. At P7: V9 against the packed tarball, then `^2.0.0` from npmjs after publish. The aspect-ratio question is already settled in darkroom's code (Auto default).

## 9. Known limitations (shipped, documented)

- Capability table is derived from vendor docs + the probes in §1.2; `capabilityValidation: 'warn'` exists because docs have been wrong (§1.3, §2.1).
- Single key, single region, single date for every [LIVE] result. Regional `personGeneration` limits and tier-dependent availability are not modeled.
- No client-side inline payload-size check; `inputImagesMax` 14 is the documented count, 3 exercised live (D5).
- A vendor field this package does not declare cannot be sent; there is no escape hatch in 2.0 (D3).
- SDK drift is detected weekly, not prevented; a consumer can install an untested 2.x minor in between. The weekly job stops after 60 days without repository activity until re-enabled (D9).
- The catalog tracks Google's announced shutdowns weekly (D16), not in real time; a model announced mid-week stays cataloged until the next release, and remains callable via D3 after it leaves.
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

None. (darkroom's aspect-ratio question is settled in its code; its 2.5 catalog entry is its own item, not a gate here.)

## 12. Residual [VERIFY]

*(unchanged from v0.4.0 except: `check:lifecycle`'s parser is validated against the committed snapshot by its control — V19)*


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

## 13c. Review findings → disposition (run #3, 38 issues)

Superseded earlier dispositions: §13b's `extraConfig` (row "As-is vs allowlist") and "V9 in a throwaway worktree" are replaced below; §13's "`getModelInfo` returns `known: false`" (via D3) is reversed.

| Finding (agent) | Disposition |
|---|---|
| AF-006: constraint shapes drop exported 1.x fields (arch, C) | D5: `ModelConstraint`, `VeoModelConstraint`, `VeoFeatures`, `VeoModelInfo` kept field-for-field; `imageSizes`, `durationRequired` added; `resolution1080p` deprecated not removed; `'gemini-2.5-flash'` entry kept; `hasAudio` unchanged; §6 rows |
| `toPublicError` can't tell vendor JSON from wrapped non-JSON (arch H, assumptions H) | D13: vendor message only when `error.status` is gRPC-canonical; `text/html` 400 wire test |
| `cause` leaks full body in production (arch, H) | D13: no `cause` in production |
| `extraConfig` undoes validation, D11, D15, one-fetch (assumptions C, arch M) | **removed** from 2.0 (D3) |
| Drift cron liveness; `@latest`; wire-only scope (assumptions C/H/M, arch M) | D9: `@^2`, full `verify`, issue on failure, 60-day limit + re-enable note in §9 and README |
| Blocking/degradable incomplete; whole-model failure; single-sample (arch M, assumptions H) | §7: every check classified; whole-model degrade = remove from catalog; three consecutive same-error failures, never on 429/5xx |
| darkroom state stale (assumptions, H) | §1.6 re-read and rewritten; darkroom is a personal test bed (Alex); V9 advisory |
| CLI validator path; placeholder `data: ''` (arch, M) | D5 *CLI*: `get*Violations` on real inputs, honors `--capability-validation` |
| `validateVeoParams` mode/return; `getModelInfo` type (arch, M) | D5: 1.x signatures preserved; `getModelInfo` unchanged; type guards added |
| SDK env can flip to Vertex/Enterprise (assumptions, H) | D5: `vertexai: false` pinned; wire test with the env var set |
| Veo classifier on stringified bodies; video sentences on image (assumptions, H) | D13: status-first classification on the extracted message only; per-surface sentences |
| Status-less errors (assumptions, M) | D13 step 3 |
| `errors.ts` import graph (arch, M) | D5: leaf module |
| Worktree Verdaccio not isolated (assumptions, M) | D10: `npm pack` tarball install; Verdaccio deviation recorded with reason |
| `seed` spread goes silent (assumptions M, arch L) | D15: present `seed` → `ValidationError`; both SDK wordings quoted; tests assert on `ValidationError` |
| V17 needs `.d.ts` (docs, H) | V17 (a): runtime ∪ `.d.ts` exports via TS compiler API |
| Value-level drift escapes gates; coverage block (docs, M) | §8: generated README tables + V17 (b); coverage block deleted |
| TOC anchors (docs, L) | V17 (c) |
| CHANGELOG misses four §6 rows; no walk instruction (docs, M/L) | §8 CHANGELOG plan: walk every §3/§6 row; four rows added |
| `source` mutation not a control (arch, L) | D12: assert the SDK deprecation `console.warn` never fires |
| `numberOfVideos` row (arch, L) | D12 row relabeled internal |
| `check:release` omits `package.json` (arch, L) | D10 allowlist below |
| `personGeneration` closed enum in shape tier (arch, L) | D3: pattern in shape, enum in capability |
| CLI tests against stale `dist/` (arch, L) | D8: build in vitest `globalSetup` |
| P3a at 440/500 (arch, M) | accepted; §8 note — additive shapes offset the new guards |
| Ship target without driver (assumptions, L) | header: "ideally", with the reason |
| Loop convergence (assumptions, L) | accepted: remaining debt is runtime; one architect-only check, then P1 (recommendation to Alex) |

## 13d. Review findings → disposition (run #4, architect only, 14 issues) and Alex's catalog policy

| Finding / input | Disposition |
|---|---|
| Alex: "stick with current … any models that will be removed soon, we can drop from the package completely" | D2 rewritten: current-only catalog; `gemini-2.5-flash-image` + both previews removed; `MODELS.GEMINI` removed (not repointed); deprecation machinery not built; V7 retired |
| Alex: add the lifecycle check | D16 `check:lifecycle`; V19; runs weekly and in `check:release` |
| AF-006: non-production error identity (arch, C) | D13 step 5: original SDK error augmented in place, no wrapper, no `cause`; §6 rows |
| §6 said `cause` on every error (arch, H) | §6 production row: never `cause` |
| Veo operation-error path (arch, M) | D13 steps 1–2: operation `error.message` + gRPC `code` classification |
| `numberOfImages` rule (arch, M) | D3 capability: kept as 1.x; field stays in `ModelValidationParams` |
| MIME set undefined/closed in shape tier (arch, M) | D3: open pattern in shape; `SUPPORTED_IMAGE_MIME_TYPES` (1.x set incl. gif) in capability; §6 row for new always-on shape checks |
| `firstFrame` naming; per-mode constants (arch, M) | D3 public names; D3 exception paragraph; D12 constant rows |
| Table key types; model counts (arch, M) | §5: string-keyed index types kept; `GEMINI_VIDEO` in `MODEL_CONSTRAINTS`; §6 `GeminiModel` row corrected |
| Polling retry change undocumented (arch, L) | D13 step 4; §6 row; CHANGELOG `Changed` |
| Discriminator overstated (arch, L) | D13 step 1: 17 enumerated gRPC names |
| V9 still Verdaccio (arch, L) | V9 row rewritten |
| Constructor `apiKey?` (arch, L) | D5: 1.x signature + optional `options`; throw kept |
| P3a headroom (arch, M) | P3a now 200 src + 160 test (deprecation machinery removed) |
| Files >500 LOC (arch, L) | D14 unchanged |

## 13e. Review findings → disposition (run #5, architect targeted, PROCEED, 10 issues)

| Finding | Disposition |
|---|---|
| Polling retries terminal operation errors ~10 min (H) | D13 step 4: retry by source — poll-request failures only; finished-job errors thrown at once; CHANGELOG `Fixed` |
| `--gemini` repointed vs D2 alias removal (H) | D8: kept as the image-mode flag, help rewritten; D2 carve-out sentence; §6 row |
| In-place augmentation throws on getter-only props (M) | D13 step 5: `Object.defineProperty`; existing/non-extensible left as-is |
| Removed `MODEL_CONSTRAINTS` keys unnamed (M) | §6 row naming all three keys + `isKnownImageModel` guidance |
| `check:lifecycle` passes on unfound ids; sources unnamed (M) | D16: fail on unfound ids with allowlist; `tsx` from `src` / `git show 3e52d92` for control |
| Poll-timeout error routing (L) | D13 step 4: not routed through `toPublicError`, unchanged |
| Stale refs `@latest`, `MODEL_DEPRECATIONS`, "tiers" (L) | fixed (D12, P6 floor, P6 new sections) |
| `check:release` network dependency (L) | D16: documented; `--offline` snapshot fallback with warning |
| P3b/P4 contingency; files >500 LOC (L) | accepted; unchanged |

## Revision history

- v0.4.2 (2026-09-22) — architect run #5 PROCEED; six edits folded in (§13e): retry by source (terminal Veo errors no longer re-polled), `defineProperty` augmentation, `--gemini` as mode flag, removed constraint keys named, `check:lifecycle` fails on unfound ids with named sources, stale references. **Spec frozen for implementation.**
- v0.4.1 (2026-09-22) — Alex's catalog policy (current models only; announced-shutdown models dropped; D16 lifecycle check) and architect run #4 fixes (§13d): non-production errors are the original SDK error augmented in place; operation-error classification; public interpolation names; kept 1.x `numberOfImages` rule, MIME set, index types and constructor. Net scope down (deprecation machinery removed).
- v0.4.0 (2026-09-22) — addresses pre-implementation run #3 (38 findings, §13c). All 1.x constraint shapes kept (AF-006); `extraConfig` removed; D13 rebuilt around a gRPC-status discriminator, per-surface messages, no production `cause`; SDK pinned to the Developer API; drift job targets `^2`, runs full verify, opens issues; every V-check classified; generated README tables; `npm pack` replaces Verdaccio for this unscoped package; darkroom re-framed as Alex's personal test bed; consumer data from npm. Scope net-reduced.
- v0.3.0 (2026-09-22) — addresses pre-implementation run #2 (41 findings, §13b). Exported validators keep their throwing contract (AF-006); darkroom deadline decoupled; weekly SDK-drift job; D13 narrowed to the vendor message field; D3 shape/capability table + `extraConfig` + SDK-allowlist bound; fetch seam and retry behavior verified on SDK 2.24; D15 removes Veo `seed` (SDK rejects it on this API); V16–V18; ship-blocking vs degradable; P6 switches from line lists to a gated full rewrite; LOC re-estimated with explicit test budgets (~1,510).
- v0.2.0 (2026-09-22) — addresses pre-implementation run #1 (44 findings, §13). Adds D11–D14, ship target, generation evidence for every kept image model, P0 probe results (V2/V3/V8/V10/V11 done), expanded migration table, per-phase LOC, enumerated P6 scope, CHANGELOG plan, darkroom follow-through. Withdraws v0.1.0's SDK "any minor" claim and `hasAudio` removal.
- v0.1.0 (2026-09-22) — initial draft (commit `523aedd`).
