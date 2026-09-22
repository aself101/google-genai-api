# google-genai-api 2.0 — specification

| | |
|---|---|
| Version | v0.2.0 (revised after pre-implementation run #1) |
| Date | 2026-09-22 |
| Target repo | `misc/npm-packages/google-genai-api`, branch `release/2.0` |
| From → To | 1.3.0 (`3e52d92`, `master`) → 2.0.0 |
| Decision owner | Alex |
| Settled decisions | Omni Flash + Lyria out of scope (separate releases); drop semantic-release; rename `master` → `main` (both 2026-09-22) |
| Ship target | **before 2026-10-02** — the shutdown date of `gemini-2.5-flash-image`, the 1.x default model |
| Companion | [`google-genai-api-2.0-checklist.md`](./google-genai-api-2.0-checklist.md) |
| Vendor source | `docs/api/*.md` — raw `.md.txt` snapshots of ai.google.dev pages + js-genai `CHANGELOG.md`, fetched 2026-09-22 |
| Live evidence | `docs/specs/probes-2026-09-22.jsonl` (raw), summarized in §1.2 and the checklist |
| Review record | pre-implementation run #1 (tracker `google-genai-api` run 1, 2026-09-22): architect 67 REVISE · docs 56 UNDERDOCUMENTED · assumptions 81 EXAMINED · 44 issues. Disposition of every finding: §13 |
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

**Generation** — SDK 1.30, `generateContent`/`generateVideos`. "OK" = at least one `inlineData` image part (or a downloaded video), not merely HTTP 200:

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
- Transport: every SDK request goes through global `fetch` (`apiCall`, `dist/node/index.mjs:11548-11549`) — the seam D12's wire tests stub.

### 1.6 Consumer — darkroom (`~/projects/darkroom`)

Depends `^1.3.0` (will not auto-take 2.0.0). Import surface: `GoogleGenAIAPI` + `extractGeminiParts` (root), `GoogleGenAIVeoAPI` (`/veo`), `getGoogleGenAIApiKey` (`/config`); ctor `(apiKey, logLevel)`; `generateWithGemini({prompt, model, aspectRatio, inputImages})`; `generateVideo`/`generateFromImage`/`waitForCompletion`/`downloadVideo` with `durationSeconds` string and `image: {imageBytes, mimeType}`. All preserved.

Runtime surface — model ids are **string literals in darkroom**, not `MODELS.*` references, so constant changes here do not reach it:
- `lib/providers.js:97` — `'google/gemini-3-pro-image'` → `gemini-3-pro-image-preview`; `gemini-3.1-flash-image`; **everything else falls back to `gemini-2.5-flash-image`**, which dies 2026-10-02 regardless of this package.
- `lib/catalog.js:64-83` — `aspectRatio` defaults to `'1:1'` and is always sent (`providers.js:102`). After 2.0 that value reaches the model for the first time: darkroom image jobs, including edits of non-square inputs, become square. That is correct behavior for what darkroom asks for, and a visible change for its users.
- Imagen already removed (`6d91be8`).

These are darkroom changes, owned there, sequenced in P7 (§8, "Consumer follow-through"). This package does not paper over them.

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
| `generateWithGemini` never validates | `api.ts:148-200` | **changed**: calls `validateModelParams` (D5) |
| `config: { aspectRatio } as Record` | `api.ts:181` | **fixed** → `imageConfig` (D6) |
| `response.parts` non-SDK fallback | `api.ts:185, 294`; `GeminiResponse.parts` | **removed** |
| Production error sanitization | `api.ts:193-197` | **narrowed** (D13) |
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

*Why not delete everything past its paper date:* openai precedent — "nothing was removed on this package's own initiative"; darkroom's Pro path sends `gemini-3-pro-image-preview` today (§1.6) and it still works. *After a shutdown:* the id stays a known, validated model whose request the API rejects; the vendor error reaches the caller intact (D13) and the warning says why. It is removed in the next release after Google 404s it. *Breaks if:* nobody reads warnings — mitigated by D13, not by the warning.

**D3 — Unknown model ids pass through, for image and video.** `model: KnownImageModel | (string & {})`; `veo model: KnownVeoModel | (string & {})`. Unknown id → one `logger.warn` per id per instance ("not in this package's catalog; sending without capability validation"), then:
- **shape checks still run** (prompt present and within length, input images well-formed, `imageSize` matches `/^(512|[124]K)$/` — shape, not capability);
- **every caller-supplied parameter is sent as-is** — `aspectRatio`, `imageSize`, input images, Veo config. Nothing is dropped for lack of a constraint entry; the vendor decides. (Dropping would recreate §1.4.)
- `getModelInfo(unknown)` returns `{ model, known: false }` instead of throwing.

Known id → full capability validation (D5). *Why:* darkroom sent `gemini-3.1-flash-image` to a package that didn't know it, and the next Google model would otherwise break every consumer on release day; all Veo models are preview, so video needs this more than image. kling D9 precedent (applies to video there too). v0.1.0's migration row "unknown model → throws" was wrong for the library — `generateWithGemini` never validated; only the CLI (`cli.ts:795`) and Veo (`config.ts:722`) threw.

**D4 — Default image model `gemini-3.1-flash-image`.** Google's named replacement for Imagen and (corrected) for 2.5-flash-image; GA; widest capability set; live-verified. Exported as `DEFAULT_IMAGE_MODEL`. Veo default unchanged (`veo-3.1-generate-preview`). *Consequence:* callers relying on the implicit default get a different model — CHANGELOG `Changed`.

**D5 — Capability validation, in the library, from the constraint table.**
- `MODEL_CONSTRAINTS[model]` shape: `{ aspectRatios: AspectRatio[]; imageSizes: ImageSize[] | null; maxInputImages: number; promptMaxLength: number }`. `null` imageSizes = parameter not accepted.
- `validateModelParams(model, params)` reads only the constraint; no model-id comparisons remain.
- **`generateWithGemini` calls it** before building the request (new library behavior — CHANGELOG `Changed`). The CLI keeps calling it too. `validateVeoParams` is already called in the Veo library path (`veo-api.ts:213, 279, 333, 398, 463`); unchanged except D3.
- Violations for a known model **throw** (`ValidationError`, message names the model, the parameter and the allowed set).
- **Escape hatch** (answers review A5 — the table is doc-derived and docs contain known errors): constructor `options.capabilityValidation: 'error' | 'warn'`, default `'error'`. `'warn'` logs the violation and sends the request anyway. Shape checks always throw. kling `[shape]`/`[capability]` precedent.
- State (warn-once sets, clock) lives on the client instance. `validateModelParams` stays a stateless export; it returns violations, and the instance decides throw vs warn.
- Payload size: validation checks image *count*, not total inline bytes. The Gemini API has an inline request-size ceiling [VERIFY: value not in snapshots]; oversize requests fail at the vendor with its error intact (D13). Documented in README; no client check.

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

**D8 — CLI.** `--model <id>` selects the image model (default D4; unknown ids pass with a warning, D3). `--gemini` retained = image mode with default model; `--gemini-3-pro` retained as alias for `gemini-3-pro-image`. `--input-image` repeatable, count checked per D5. New `--image-size`. `--aspect-ratio` has no default. Veo `--veo-resolution` accepts `4k`. Removed: `--imagen`, `-n`. `_N` suffix kept; metadata filename fixed.

**D9 — Platform.** `engines.node >=20` (the SDK's floor since 1.0.1); CI matrix 20/22/24 (24 added — answers A16: `engines` permits it). `@google/genai ^2.24.0` — caret retained deliberately: D12 wire tests run on every CI build against whatever 2.x minor resolves, so serialization drift in a future minor turns CI red instead of shipping silently (answers A8). TS ^5.9, vitest ^4, `@types/node` ^24 (sibling parity). axios retained (`utils.ts`, `video-api.ts`) — out of scope.

**D10 — Release mechanics.**
- Remove semantic-release (`.releaserc.json`, `release.yml`, 6 devDeps, script). Add `.github/workflows/ci.yml` (push/PR, Node 20/22/24, `npm ci && npm run verify`) — verifies, never publishes.
- `verify` = typecheck + build + test. Add openai's `check:release` as `prepublishOnly` guard: refuses if `package.json` version lacks a matching `## [x.y.z] — date` CHANGELOG heading, if `[Unreleased]` is non-empty, if `dist/` is older than `src/`, or if `npm pack --dry-run` lists files outside `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` (answers A13).
- Version bump, tag and GitHub release are manual and listed as checklist items (A13).
- Branch rename `master` → `main`: prepared locally; Alex pushes and flips the GitHub default.
- **Verdaccio for an unscoped package** (answers A7): the workspace's scope rule (`@uluops:registry=`) does not route `google-genai-api`. Validation uses an explicit one-off install in darkroom, no `.npmrc`: `npm install google-genai-api@2.0.0 --registry http://localhost:4873/`. That writes exactly one `localhost:4873` URL into darkroom's lockfile. After npm promotion: `npm install google-genai-api@2.0.0 --registry https://registry.npmjs.org/`, then the jq scan must print nothing, then the resolved tarball URL must return 200 (public package — bare `curl` works). Confirm with `npm ls google-genai-api` that 2.0.0, not 1.3.0, is what darkroom resolved before trusting any V9 result.
- `npm deprecate google-genai-api@"<2.0.0"` runs **after** darkroom has moved to 2.0.0 (A13: it would otherwise flag darkroom's own pin).

**D11 — Thinking level and search grounding deferred to 2.1.** No consumer uses them; the vendor's examples for `thinking_level` and `search_types` are Interactions-API (`image-generation.md:874-899, 1511-1536`), the generateContent snapshot shows only `tools: [{googleSearch: {}}]`, and SDK 1.30's `ThinkingLevel` enum has no `MINIMAL` (`genai.d.ts:7419-7432`). Shipping them would add two unevidenced request mappings to a release with a deadline. Under D3/D5 they are simply absent params; a caller cannot pass them in 2.0. 2.1 (with Omni Flash) adds them behind live probes.

**D12 — Wire tests: exercise the real SDK serializer.** New `test/wire.test.ts`: construct the real `GoogleGenAIAPI` / `GoogleGenAIVeoAPI` (real `@google/genai`, **not** mocked), stub `globalThis.fetch` to capture `(url, init)` and return a canned vendor response, then assert on the parsed request **body**:
- `generationConfig.imageConfig.aspectRatio` and `.imageSize` present when passed; absent when not;
- `generationConfig.responseModalities`;
- `contents[].parts[].inlineData` for input images (count and order);
- unknown model id → same body shape, model in URL;
- Veo: `instances[0].prompt/image/lastFrame/video/referenceImages` and `parameters.resolution/durationSeconds/aspectRatio/...` under the `source` shape.

Control: a mutation that reverts `api.ts` to the 1.x flat `{ aspectRatio }` must fail the aspect test. The existing mocked unit tests remain for logic; wire tests own "does the field reach the network". This is the test layer whose absence let §1.4 ship.

**D13 — Error surface.** Production sanitization (`api.ts:193-197` replaces every error with "Image generation failed. Please try again.") hides model-not-found (the D3 passthrough failure) and post-shutdown rejections (the D2 failure). Narrowed: errors carrying an HTTP status in 400–499 are rethrown with status and vendor message intact in all environments (vendor 4xx bodies describe the request, not secrets); 5xx and non-HTTP errors keep the sanitized message in production. Applied identically in `veo-api.ts`.

**D14 — Catalog stays in `config.ts`.** The architect suggested extracting to `models.ts` (kling). Declined for 2.0: `./config` is a public subpath that exports these constants; the removals shrink `config.ts` (878 LOC) by roughly a quarter; extraction is churn without a consumer benefit. Recorded, revisit in 2.1.

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
| `generateWithGemini` never validated params | validates known models (throws; `capabilityValidation: 'warn'` to downgrade) |
| unknown model: library accepted silently; CLI and Veo threw | all paths: one warning, request sent as-is |
| `inputImagesMax: 1`; `detectGeminiMode` threw on >1 image | per-model `maxInputImages` (up to 14); `detectGeminiMode` never throws on count |
| `MODEL_CONSTRAINTS[m].inputImagesMax`, `.numberOfImages`, `.responseFormat` | `.maxInputImages`, `.aspectRatios`, `.imageSizes`, `.promptMaxLength` |
| `AspectRatio` = 5 values; `ASPECT_RATIOS` 5 values | 14 values; per-model subsets |
| `GeminiModel` union = 2 ids | 6 known ids + `(string & {})` |
| `extractGeminiParts` returned thought parts as images/text | skips `thought: true` parts; `{ includeThoughts: true }` to keep |
| `GeminiResponse.parts` / fallback | removed (never an SDK field) |
| production errors all sanitized | 4xx vendor errors pass through with status + message |
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
| V13 | Wire tests (D12): every field in D12's list present on the captured body | mutation: revert to 1.x flat shape → fails; stub returns 4xx → error carries status (D13) |
| V14 | `check:release` refuses a publish with a stale `dist/`, a missing CHANGELOG heading, or extra tarball files | each condition induced once → refuses |
| V15 | README census: `grep -niE "default: 1:1\|default: '1:1'" README.md` → 0 | control before P6 → 8 |

## 8. Phases

LOC = added + changed lines, estimated from the file map (architect estimate ~1,000–1,300 total incl. tests; this breakdown ~1,190). Removals are not counted.

| Phase | Scope | Files | Est. LOC | Exit |
|---|---|---|---|---|
| P0 | Spec, review ×2, probes | docs/ | — | review PROCEED; all [VERIFY] settled or assigned to a V-check |
| P1 | Tooling/release: D9, D10 (not rename) — SDK bump, CI, `verify`, `check:release` | package.json, lock, ci.yml, scripts/check-release.mjs, tsconfig if needed | 120 | `verify` green on SDK 2.24 with compile fixes only; V14 |
| P2 | Removals (§3) | api.ts, config.ts, types, cli.ts, 3 tests, package.json | 60 (net −~900) | V5 = 0 with recorded control |
| P3a | Catalog, constraints, `MODEL_DEPRECATIONS`, D2 warn-once + clock, D3 passthrough, D5 validation + `capabilityValidation` | config.ts, api.ts, types | 260 | V6, V7 unit-green |
| P3b | D6 request shape, `extractGeminiParts` thoughts, zero-image path, D13 errors, D12 wire tests (image) | api.ts, types, test/wire.test.ts, test/api.test.ts | 280 | V4, V13 (image) green |
| P4 | Veo: Lite, 4k, `durationRequired`, D3 for Veo, D7 `source`, wire tests (video) | config.ts, veo-api.ts, types, tests | 220 | V13 (video); Lite gating unit tests |
| P5 | CLI: D8; subprocess smoke tests against `dist/cli.js` (CLI has 0 tests today) | cli.ts, test/cli.test.ts | 250 | CLI tests green |
| P6 | Docs (full scope below), CHANGELOG, archive MIGRATION-PLAN | README, CHANGELOG | — | V15; V5 README clause |
| P7 | Merged-tree verify; Verdaccio; V9, V12; branch rename; publish; consumer follow-through; deprecate | — | — | npm 2.0.0; darkroom on 2.0.0 with clean lockfile |

**P6 README scope** (from docs review; every location is currently true for 1.x and becomes false or was already false):
- Intro and Quick Start: `:10`, `:26-27` (`--imagen --number-of-images 4`).
- Overview bullets `:78, :82`; API Method Summary row `:186-187`.
- Models section `:195-287` → table with Tier / Shutdown column (openai pattern).
- `aspectRatio` default claims `:212, :246, :282, :599, :611, :618, :677, :701` (V15).
- Type-export claims `:456-494` **and** `:532-552` (Utility Types) — root exports no types; either document `import type … from 'google-genai-api/…'` paths that actually resolve, or state types are not exported.
- CLI Usage `:585-628` rewritten for D8 (remove Imagen options `:614-621`; add `--model`, `--image-size`, repeatable `--input-image`, `4k`); CLI syntax errors `:30, :901-907`.
- Method docs `:682-703`, `:727-741`; Examples 4/5/8 `:798-813, :833-839`; Imagen troubleshooting `:1175-1189`; Imagen link `:1305`.
- Veo models list `:111-119`, durations `:527`.
- Badges `:7-8`: remove hardcoded test count and coverage (they drift; CI is the source).
- New sections: "Upgrading to 2.0" (§6), "Model lifecycle" (D2 tiers, D3 passthrough, `capabilityValidation`), known limitation (inline payload size, D5).

**CHANGELOG plan** (Keep a Changelog). Fix the file structure first: move the `# Changelog` header and attribution (`:92-97`, a semantic-release prepend artifact) to the top; add a note that entries before 2.0.0 were generated by semantic-release in conventional-commit style (openai/bfl wording). Then `## [2.0.0] — <date>`:

| Category | Source |
|---|---|
| Removed | §3 "removed" rows: Imagen surface, Veo 3.0/2.0, `GeminiResponse.parts`, CLI `--imagen`/`-n`, semantic-release |
| Added | 3.1 Flash / Lite / 3 Pro GA; Veo Lite; Veo 4k; `imageSize`; multi-image input; `MODEL_DEPRECATIONS`; `DEFAULT_IMAGE_MODEL`; `capabilityValidation`; `getModelInfo` `known` |
| Changed | default model (D4); library validation (D5); unknown-id passthrough (D3); `extractGeminiParts` thoughts (D6); `MODELS.GEMINI_3_PRO` value; Veo `source` (D7); constraint shapes; 4xx error surface (D13); Node ≥20; SDK 2.x |
| Deprecated | `gemini-2.5-flash-image`, both previews (D2) |
| Fixed | **`aspectRatio` was never sent — now honored; output framing changes for every caller that passed it** (the semantics-without-signature case — stated explicitly); CLI metadata filename; `detectGeminiMode` mode bypass |

**Consumer follow-through (darkroom, P7, owned in the darkroom repo):** before 2026-10-02 — map Pro to `gemini-3-pro-image`, change the fallback from `gemini-2.5-flash-image` to `gemini-3.1-flash-image`, decide whether edit jobs should keep sending `'1:1'` (§1.6), bump to `google-genai-api@^2.0.0`. V9 runs against that change.

## 9. Known limitations (shipped, documented)

- Capability table is derived from vendor docs + the probes in §1.2; `capabilityValidation: 'warn'` exists because docs have been wrong (§1.3, §2.1).
- Single key, single region, single date for every [LIVE] result. Regional `personGeneration` limits and tier-dependent availability are not modeled.
- No client-side inline payload-size check (D5).
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

None blocking. Resolved in this revision: aspect default (omit, D6); preview disposition (deprecated tier, D2/V2); Lite references (unsupported, V8).

## 12. Residual [VERIFY]

| Item | Settled by |
|---|---|
| Inline request-size ceiling value | documentation only (D5); not gating |
| Veo 3.1 refs / 4k / Fast live behavior under `source` | V12, before publish |

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

## Revision history

- v0.2.0 (2026-09-22) — addresses pre-implementation run #1 (44 findings, §13). Adds D11–D14, ship target, generation evidence for every kept image model, P0 probe results (V2/V3/V8/V10/V11 done), expanded migration table, per-phase LOC, enumerated P6 scope, CHANGELOG plan, darkroom follow-through. Withdraws v0.1.0's SDK "any minor" claim and `hasAudio` removal.
- v0.1.0 (2026-09-22) — initial draft (commit `523aedd`).
