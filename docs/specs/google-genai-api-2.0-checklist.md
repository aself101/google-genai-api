# google-genai-api 2.0 — checklist

Companion to [`google-genai-api-2.0-spec-v0_4_2.md`](./google-genai-api-2.0-spec-v0_4_2.md). `[x]` done · `[-]` deliberately skipped (reason inline) · actuals recorded inline. **Ship target: when gates pass; ideally before 2026-10-02.**

## P0 — spec, review, probes
- [x] Vendor snapshots in `docs/api/` (2026-09-22)
- [x] Spec v0.1.0 (`523aedd`)
- [x] `pre-implementation` run #1 — architect 67 REVISE · docs 56 · assumptions 81 · 44 issues (tracker `google-genai-api` run 1)
- [x] Spec v0.2.0 (`c3df6d0`) — all 44 findings dispositioned (spec §13)
- [x] `pre-implementation` run #2 — architect 83 REVISE (AF-006: validateModelParams contract) · docs 71 · assumptions 81 · 41 issues (tracker run 2)
- [x] Spec v0.3.0 — all 41 findings dispositioned (spec §13b)
- [x] SDK 2.24 inspected (scratchpad install): fetch seam late-bound, no default retries, `imageConfig` maps aspectRatio/imageSize, Veo `seed` throws on Gemini API (also on 1.30 — proven locally, control `negativePrompt` reached fetch)
- [x] darkroom deadline remap handed to darkroom workstream (on 1.3.0, decoupled) — done in darkroom (`providers.js:102-106`); 2.5 catalog entry still open there
- [x] `pre-implementation` run #3 — architect 83 REVISE (AF-006: constraint shapes) · docs 73 · assumptions 82 · 38 issues (tracker run 3)
- [x] Spec v0.4.0 — all 38 findings dispositioned (spec §13c); `extraConfig` removed; darkroom re-framed as personal test bed
- [x] npm consumers: 28/week, ~2,100/year (npm API; control returns not-found)
- [x] Repo visibility: PUBLIC (60-day schedule disable applies)
- [x] Architect-only confirmation on v0.4.0 — 88 REVISE (AF-006: non-production error identity) · 14 issues (tracker run 4)
- [x] Alex: catalog = current models only; announced-shutdown models dropped; add lifecycle check
- [x] Spec v0.4.1 — §13d
- [x] Targeted architect re-check — **88 PROCEED, no gates** (tracker run 5); six edits folded into v0.4.2 (§13e). Spec frozen.
- [x] V2 — `gemini-3-pro-image-preview` **OK** 1024×1024 ; `gemini-3.1-flash-image-preview` **OK** 1024×1024 → D2 deprecated tier
- [x] V3 — first run confounded (prompt "wide establishing shot": flat 16:9 and imageConfig 16:9 both 1376×768). Rerun, neutral prompt: flat `9:16` → **1408×768 (ignored)**; `imageConfig` `9:16` → **768×1376**. SDK 1.30 `generateContentConfigToMldev` copies `imageConfig` only. Unset ratio ⇒ model-chosen framing, not 1:1.
- [x] V10 — `'512'` → 512×512 ; `'2K'` → 2048×2048 ; Lite `'2K'` → server 400 "Image size 2K is not supported for this model"
- [x] V11 — 3 input images on 3.1-flash → OK 1376×768
- [x] Lite `1:4` → OK 512×2064 (Lite accepts extended ratios)
- [x] V8 — Lite refs → server 400 "`referenceImages` isn't supported by this model" ; Lite 720p/4s T2V → OK, 32 s
- [x] A4 — `gemini-3-pro-image` (GA) `4:5`/`1K` → OK, finish STOP, 1 image, 0 thought parts
- [x] Probe spend: 11 image generations OK + 1 rejected pre-generation; 1 Veo Lite 4 s job OK + 1 refs call rejected pre-generation. Not metered per call. (v0.2.0's "15/14" was a miscount — corrected from the jsonl.) Raw: `docs/specs/probes-2026-09-22.jsonl`
- [x] V5 control (pre-removal, `-i`, src+test+package.json+README): **220**
- [x] V15 controls: `default: 1:1` **8** · 1.x ratio list **9** · hardcoded test stats **7**

## P1 — tooling / release (~140 LOC)
- [x] Remove `.releaserc.json`, `.github/workflows/release.yml`, semantic-release (7 devDeps) + script
- [x] `.github/workflows/ci.yml` (push + PR to main/master; Node 20/22/24; `npm ci`, `verify`, `npm audit --omit=dev`, `npm pack --dry-run`)
- [x] `.github/workflows/sdk-drift.yml`: two jobs — `sdk-drift` (`@google/genai@^2 --no-save`, full `verify`, `sdk-drift` issue on failure) and `model-lifecycle` (`--control` then live, `model-lifecycle` issue on failure); weekly Mon 06:17 UTC + dispatch; 60-day note in the file. First real run needs the push (V18, P7)
- [x] `scripts/check-lifecycle.mjs` + `check:lifecycle`. Verified 2026-09-22 (exit codes captured without pipes): `--control` → 6 expected failures (2.5-flash-image, 3-pro-image-preview, imagen-4.0, veo-3.0 ×2, veo-2.0); 2.0 target catalog vs snapshot → exit 0; + an unknown id → exit 1; empty page → exit 1. Live run on the current tree fails on the same 6 — correct until P2/P3a remove them (V19 is a P7 gate)
- [x] `verify` = typecheck (src) + build + test; `check:release` as `prepublishOnly` (runs `check:lifecycle`, `--offline` passthrough). `--control` → fails on missing heading, missing `[Unreleased]`, planted tarball file. Real run fails today on the 1.x CHANGELOG format and lifecycle — correct until P6/P3a. Heading format is Keep a Changelog `## [x.y.z] - YYYY-MM-DD` (hyphen, as openai), not the em dash spec D10 wrote. `dist/` is gitignored here, so the gate builds fresh instead of diffing a committed `dist/` as `prepublishOnly` incl. non-empty `[Unreleased]` (V14, each condition induced once)
- [x] `engines.node >=20.0.0`; `@google/genai ^2.24.0` (2.24.0); TS ^5.9.3; vitest ^4.1.11 (+ coverage/ui); `@types/node` ^24.13.6. Newer majors exist (TS 7, vitest 5) — spec D9 chose sibling parity
- [x] **Found in P1, not in spec:** vitest 4 refuses `new` on arrow-function mock implementations — 146 tests failed until the three `GoogleGenAI` mocks became `function` implementations (`test/api.test.ts`, `veo-api.test.ts`, `video-api.test.ts`). SDK 2.24 needed **zero** source changes, as its changelog said
- [x] **Found in P1:** `npm audit --omit=dev` (a CI step) failed — axios 1.13.2 (≈30 advisories incl. SSRF), `file-type` 19.6.0, transitive `jws`/`ws`/`minimatch`/`brace-expansion`. Fixed: axios ^1.20.0 (+ `String()` coercion at `utils.ts:259` for its widened header type — missing header still fails the check), `file-type` ^21.3.4 (22.x needs Node ≥22; 21.3.4 is patched and supports ≥20), `npm audit fix` for transitives. Audit: 0 vulnerabilities
- [x] **Deferred:** test files have 37 pre-existing type errors (`tsconfig.test.json`, baseline 2026-09-22, unchanged by P1). P2–P5 rewrite most of those tests; `tsc -p tsconfig.test.json` joins `verify` at P5 exit, target 0
- [x] Test count on SDK 2.24: **358/358** on Node 24 and Node 20 (1.3.0 baseline: 358/358; SDK 1.30 typecheck clean). Tests mock the SDK — serialization on 2.24 is proven only by P3b wire tests and V16

## P2 — removals (~60 LOC, net −~900)
- [x] Imagen surface removed: `generateWithImagen`, `extractImagenImages`, `MODELS.IMAGEN`, its constraint + validation branch, `ImagenModel`/`ImagenGenerateParams`/`ImagenResponse`/`ImagenGeneratedImage`, CLI `--imagen`/`-n` + Imagen branch/docs/examples (examples renumbered 1–18), `google:imagen` script, `imagen` keyword
- [x] Veo 3.0/2.0 surface removed: `VEO_MODELS.VEO_3/VEO_3_FAST/VEO_2`, their durations and constraints, `VeoModel` members, `VeoDuration '5'`, the 1080p aspect-ratio branch (only Veo 3.0 set it). `hasAudio` and the feature-gate branches kept
- [x] V5 = **0** in src/test/package.json (control at P2 start, same scope: **180**). README (40 remaining hits) is P6
- [x] Tests **358 → 326** (−32 legacy-model tests); `verify` green; test-typecheck backlog 37 → 33 (errors in deleted tests)
- [x] **Owed to P4 (Lite):** these negative tests had only Veo 2/3 as targets and were deleted, leaving the feature-gate branches unexercised until Lite exists — recreate against Lite: `validateVeoParams` rejects reference-images mode, extension mode, an unsupported resolution (was 1080p on Veo 2; becomes 4k on Lite); `api.generateWithReferences` rejects; `api.extendVideo` rejects. Interpolation *is* supported on Lite, so the old "interpolation not supported" tests have no successor. The 1080p 16:9 test is gone with its branch
- [x] **Found in P2:** `src/`, `test/` and `package.json` use CRLF; a Python text-mode rewrite silently converts to LF (whole-file diffs). P1's `package.json` rewrite had done exactly that — restored here. All edits now read/write with `newline=''`. `package-lock.json` is LF because npm 11 writes it so; not fought

## P3a — catalog, validation (~200 src + 160 test)
- [x] Catalog current-only: `MODELS` = 3.1 Flash, 3.1 Flash Lite, 3 Pro, video; `DEFAULT_IMAGE_MODEL`; `MODEL_CONSTRAINTS` keys = exactly `Object.values(MODELS)` (tested); `ASPECT_RATIOS` 14; `IMAGE_SIZES`; `SUPPORTED_IMAGE_MIME_TYPES`
- [x] D3 passthrough, all params sent — V6 tests + mutation controls, each turned the suite red then restored (2026-09-22): M1 restore 1.x unknown-model throw → 4 failed; M2 drop images for unknown ids → 1 failed; M3 skip validation when `mode` supplied (1.x bypass) → 1 failed
- [x] `src/errors.ts` (leaf, imports nothing): `ValidationError`, `Violation`; `getModelViolations` (shape/capability; malformed values reported once, as shape); `validateModelParams` still throws; `isKnownImageModel`, `isKnownVeoModel` (own-property check — `'toString'` is not a model)
- [x] Constraint types kept field-for-field; `imageSizes` added; `'gemini-2.5-flash'` entry kept (tested)
- [x] All three clients (image, Veo, video): `new GoogleGenAI({ apiKey, vertexai: false })` — asserted on the image client's constructor call
- [x] Violations checked in `generateWithGemini` before the sanitizing try (test: ValidationError text survives `NODE_ENV=production`); `capabilityValidation` 3rd ctor arg; `detectGeminiMode` no count throw; mode bypass closed. `imageSize` is validated but **not yet** a `generateWithGemini` param — it arrives with its wire mapping in P3b (a validated-then-dropped param would be §1.4 again)
- [x] Validation tests rewritten; 15 test references to the removed `MODELS.GEMINI` found by the test typecheck (they still *passed*, silently testing the unknown-id path) and replaced. Tests 326 → **352**; test-typecheck backlog 33 → 31
- [x] CLI (pulled forward from P5 because P3a would otherwise break it): `--gemini` → `DEFAULT_IMAGE_MODEL`, help text per D8; pre-flight validates the real decoded input image, not 1.x's `{ data: '' }` placeholder
- [x] **V19 now passes live**: `check:lifecycle` → 6 catalog ids, all "No shutdown date announced" (exit 0)

## P3b — request shape, errors, wire tests (~200 src + 150 test)
- [x] `imageConfig` / `responseModalities`, typed `GenerateContentConfig`, no casts on the request, no aspect default; `imageSize` added to `generateWithGemini` together with its wire mapping (V4 mocked expectations updated)
- [x] `extractGeminiParts(response, { includeThoughts })`; `response.parts` fallback and `GeminiResponse.parts` removed (test: a legacy-shaped response now extracts nothing); zero-image warn names `finishReason`; a thought-only image is not counted as output
- [x] D13 `toPublicError` in `errors.ts` (still a leaf): 17 gRPC names; status/code-first classification; operation-error path (`operationError.code`/`.message`, exercised by Veo in P4); non-production = original error + 4 properties via `defineProperty`; production = new Error, no `cause`. Wired into the image client; the Veo client moves in P4 with retry-by-source (entangled in `veo-api.ts`), per the P4 item below
- [x] `test/wire.test.ts`: 16 tests — every image row of the D12 table on the real SDK 2.24 serializer, exactly one fetch each, unknown id, rejected param never sent, Vertex env vars, D13 400-JSON / 400-HTML (`BAD_REQUEST` reason phrase) / 403 / 429 in production and the original ApiError outside it. **Mutation controls** (each applied, suite red, restored byte-identical, 2026-09-22): W1 1.x flat `aspectRatio` → 3 failed; W2 drop `vertexai: false` → 1; W3 pattern discriminator `/^[A-Z_]+$/` → 1; W4 `cause` in production → 1; W5 raw body instead of vendor message → 1. (A first W1 attempt silently did not apply — CRLF mismatch — and reported "survived"; rerun CRLF-aware)
- [x] **V16 live, through the built package on SDK 2.24** (pulled forward from P7; 4 image calls): 3.1 Flash `9:16` → **768×1376** ✓; `'2K'` → 2816×1536; 3 Pro `4:5` → 928×1152, 0 thought parts returned; 3.1 Lite default → 1408×768. `responseModalities` accepted by all three. **Spec V16 correction:** "'2K' → 2048 px long edge" was wrong — `imageSize` is a resolution tier, not an edge (2048×2048 at 1:1 in P0; 2816×1536 at default framing). V16's blocking clause is the aspect check, which passes
- [x] Test typecheck **joined `verify` now** (planned P5), scoped to clean files: `api`, `config`, `utils`, `wire` tests (11 errors fixed — a `Mocked… extends GoogleGenAIAPI` that redeclared private members). `veo-api`/`video-api` tests excluded until P4/P5 (20 errors). Control: a planted `MODELS.GEMINI` makes `npm run typecheck` exit 2. Tests 352 → **373**

## P4 — Veo (~150 src + 150 test)
- [x] Lite (720p/1080p, T2V/I2V/interpolation; no refs/extension/4k); 4k on 3.1 + Fast; `durationRequired` added, `resolution1080p` kept + `@deprecated` + still populated (tested); `getVeoViolations(model, params, mode)` shape/capability, violations in 1.x throw order; `validateVeoParams` 1.x signature, returns `true`; `capabilityValidation` 3rd ctor arg; unknown Veo id warns once and is sent; `getModelInfo` unchanged (throws on unknown; Lite info carries `durationRequired`). `VeoModelInfo` gains `durationRequired` (additive). Veo param `aspectRatio`/`resolution` widened `| (string & {})`, `durationSeconds` `| number` — found by the test typecheck: D3's passthrough was not expressible in TS for unknown models
- [x] D15: `seed` removed from `VeoGenerateParams` and the builder; a present `seed` is a shape violation (throws even under `'warn'`, never reaches the network — wire test)
- [x] `source:` call shape via one `_submit` helper; typed `GenerateVideosConfig` for every mode; the only value cast is `referenceType` (SDK enum 'ASSET'/'STYLE'; sent as given, 'asset', as 1.x and Google's docs do — V12 settles it live). Private `_classifyError`/`_sanitizeError` removed; D13 `toPublicError` on submit, poll and download. `video-api.ts` (understanding) untouched
- [x] Poll retry by source: only `getVideosOperation` failures classified TRANSIENT/NETWORK/TIMEOUT retry; a finished job's `operation.error` goes through `toPublicError` and is thrown at once (test: code 8 RESOURCE_EXHAUSTED + "network timeout" message → exactly one poll). Polling-timeout error unchanged, not routed through `toPublicError`
- [x] Veo wire tests (9): every mode's body on SDK 2.24 (URL `:predictLongRunning`, `instances[0].prompt/image/lastFrame/video/referenceImages`, `parameters.*` with numeric `durationSeconds`, extension `sampleCount: 1`), unknown id, `seed` never sent, Vertex env; an `afterEach` asserts the SDK never logs its deprecation warning. Captured bodies 2026-09-22 showed 0 SDK warnings with `source`
- [x] **Owed from P2, recreated against Lite:** `validateVeoParams` rejects reference-images mode, extension mode, 4k (the old "1080p on Veo 2"); `api.generateWithReferences` and `api.extendVideo` reject before any call; interpolation accepted on Lite
- [x] New `test/errors.test.ts` (16): classification by HTTP/gRPC/kind, safety from vendor message only, non-production identity + `operationError`, `DOMException`, frozen, non-writable `status`, production sentences, 17-name discriminator vs `BAD_REQUEST`, truncation, no `cause`
- [x] **Mutation controls** (each asserted to apply, suite red, restored byte-identical): M1 re-poll a finished job's TRANSIENT error → 1 failed; M3 top-level prompt/image/video instead of `source` → 8 failed; M4 Lite claims refs + extension → 5 failed; M2 plain assignment instead of `defineProperty` → **survived at first**: the AbortError test never reached the `code` write (a plain AbortError has no gRPC code). Added a test with a `DOMException` carrying an operation code; M2 → 1 failed
- [x] Veo tests joined the test typecheck (17 pre-existing errors fixed: `Mocked… extends` with privates, operations missing `name`). Only `video-api.test.ts` still excluded (P5). Tests 373 → **404**
- [x] **Noted for P6 README:** the clients log the full SDK error message (incl. `details[]`) at `error` level, in production too — as 1.x did. It reaches the operator's logs, not the caller; document it rather than silence it
- [x] `check:lifecycle` live: 7 ids incl. Lite, all "No shutdown date announced"

## P5 — CLI (~110 src + 150 test)
- [x] `tsc -p tsconfig.test.json` = **0 errors**, every test file included (baseline 37 at P1; joined `verify` in P3b, Veo in P4, video-api here)
- [x] `--gemini` kept as mode flag with new help text; `--model` (implies image mode; conflicts with a different `--gemini-3-pro`), `--gemini-3-pro` alias, repeatable `--input-image` (commander collector), `--image-size`, `--capability-validation` (value checked), no aspect default, Veo `4k` + Lite in help/examples; `--imagen`/`-n` gone (unknown-option test). Examples rewritten + renumbered (1–20)
- [x] **Deviation from D5's wording, recorded:** the CLI no longer pre-validates at all — the clients validate every request before any network call, so a CLI pre-flight would double every `'warn'` message and, being throwing, would defeat `--capability-validation warn`. Single source of validation. `_N` naming applies after the thought filter (test); metadata `outputs` = files actually written, plus `finishReason` and text parts; zero images → exit 1 naming `finishReason`, metadata still written
- [x] `test/cli.test.ts` (14): `--import test/helpers/fetch-replay.mjs` (serves fixtures in order, logs every request, exits 97 on an unexpected one), temp `HOME` + cwd, fake key; `dist/` built in vitest `globalSetup`. Covers validation exits with zero requests, image flags on the wire, `_1`/`_2` + metadata, no-image exit, `warn`, unknown `--model`, vendor 400, and a full Veo run (submit → already-done op → download via `files/{name}:download`) with no polling
- [x] **CLI mutation controls** (each asserted to apply, suite red, restored): C1 1.x metadata filenames → 1 failed; C2 exit 0 on no image → 1; C3 drop `--image-size` pass-through → 3; C4 client skips validation → 2; C5 `--input-image` not repeatable → 1. **Two false "survivals" on the first pass:** C1 and C4 as first written did not compile, so `globalSetup`'s build failed and vitest printed no count, which the runner read as "all passed". The runner now distinguishes failed / passed / broken run; both reruns compile and fail. Also: C1 would have survived against a single-image test (1.x's regenerated name matches when saved in the same second) — the multi-image test now asserts metadata filenames
- [x] Tests 404 → **418**; `verify` green

## P6 — docs
- [x] README rewritten top to bottom (1,329 → 547 lines): Upgrading to 2.0 (25-row table), Models (generated), Model lifecycle, Validation, Veo (polling/retry, mode constants), Video understanding, Errors (D13 incl. unsanitized logs), Public API per subpath (from the built package), CLI, Output files, Security, Known limitations (§9), Troubleshooting, Development/Releasing, Maintainer notes (60-day schedule disable). Test/coverage badges and stats removed; TOC updated
- [x] `scripts/readme-tables.mjs` (pure `renderTables`/`readBlocks`/`applyTables`, shared with the test) + `npm run readme:tables [-- --check]`; 3 generated blocks (image models, Veo models, video model). Empty-block regex bug found and fixed on first render
- [x] `test/readme.test.ts` (12): (a) imports resolve against runtime ∪ `.d.ts` exports via the TS compiler API — 74 names checked, asserted > 60 so a parser that stops matching cannot pass empty; control: the 1.x README fails on `extractImagenImages` and root `GoogleGenAIVeoAPI`; (b) generated blocks = fresh render; control: hand-edited cell detected; (c) every `#anchor` resolves; control: renamed heading detected; V15 and V5 as tests
- [x] `public-interface-validator` read of the rendered README: **76**, 2 HIGH / 3 MEDIUM / 1 LOW, all fixed. Both HIGH were prose true-in-spirit but false against the code — the class the import/anchor tests cannot see:
  - HIGH: Security said downloads are checked "by content type and by magic bytes"; the URL branch of `imageToInlineData` checked the header only (1.x behaviour, untested — the URL branch had zero tests). **Made the claim true** rather than weakening it: `fileTypeFromBuffer` sniff, reject non-image bytes, send the detected MIME. `test/utils-download.test.ts` (4). Mutation (sniff disabled, applied count 1): 2 fail. CHANGELOG Security entry
  - HIGH: Errors implied every client uses D13; `GoogleGenAIVideoAPI` still used 1.x `_classifyError`/`_sanitizeError` (message-text matching). **Migrated (Alex, 2026-09-22):** new surface `video-understanding` (`PublicErrorSurface`), upload/generate errors via `toPublicError`, upload polling retries by source (429 keeps its 60 s wait; FAILED never retried), poll timeout thrown as is (as Veo), 1.x 404 "expires after 48 hours" hint kept with D13 fields. Never-public `ErrorClassification` type deleted. 12 helper tests → 11 behaviour tests; 5 mutations (text-retry, timeout passthrough, raw error in prod, wrong surface, no 404 hint), each asserted applied, all killed
  - MEDIUM: CHANGELOG retry wording "adds 408, 500, 504" → 408 + the rest of 5xx (TRANSIENT is `status >= 500`, `errors.ts:121`); "four properties" → up to four (`status`/`code` only when present); Upgrading table gained the Veo polling-retry row
  - LOW: CLI table now states Veo flag defaults (`cli.ts:338-345`)
  - CHANGELOG §3/§6 walk: complete, section order correct
- [x] V15 three greps = 0; V5: retired names only inside "Upgrading to 2.0" (+ the one-line banner pointing there) — both enforced by `test/readme.test.ts`, not just run once
- [x] CHANGELOG restructured: `# Changelog` header moved from the bottom (semantic-release artifact) to the top; pre-2.0 note; 2.0 content under `[Unreleased]` in canonical order incl. a new Deprecated section (`resolution1080p`); old level-1 release headings normalized to level 2. P7 inserts the dated `## [2.0.0]` heading (check:release currently fails only on that + non-empty `[Unreleased]` — lifecycle passes). §3/§6 walk: delegated to the public-interface review below
- [x] `MIGRATION-PLAN.md` → `docs/archive/MIGRATION-PLAN-1.3.0-typescript.md`
- [x] **Found in P6 — D5 gap:** `ValidationError` was not exported from the root (D5 says root and `./config`). Fixed, plus `export type *` from `./types` on the root: 1.x's README claimed types were importable from the root and no subpath exported them. Consumer compile check passes; control (nonexistent type) fails TS2305
- [x] **Found in P6 — false README claims carried by 1.x**, corrected rather than copied: "30-second timeout for all API calls" (none exists; only download 60 s, file delete 30 s); "DNS rebinding prevention … prevents TOCTOU" (resolves once, first address only, fetch re-resolves) — now a Known limitation. Same SSRF gap as the one recorded for bfl-api; not fixed in 2.0 (out of scope), flagged to Alex
- [x] Tests 418 → **433** (+4 download tests, video errors 12 → 11)

## P7 — release
- [x] `git fetch`: `origin/master` (3e52d92) is an ancestor of the branch — merge is a fast-forward, merged tree = branch head. `npm run verify` 433 pass
- [x] Version 2.0.0; CHANGELOG `## [2.0.0] - 2026-09-22` (re-date if publish slips); npm `time` map ends at 1.3.0. `check:release` passes. **Found:** the tarball omitted CHANGELOG.md, which the README's upgrade guide links to (bfl/kling ship it) — added to `files`, and `check:release` now requires README/LICENSE/CHANGELOG/dist entry points; `--control` shows the new failure
- [x] V16 live through `dist/` on SDK 2.24: 9:16 → 768×1376; 16:9 + 2K → 2752×1536
- [ ] V18: sdk-drift green on `@^2`; control dispatch with a broken assertion fails and opens the issue — **needs the branch on GitHub** (after Alex's push)
- [x] `npm pack` (36 files); darkroom (git worktree at 9424bd7, its checkout untouched) installs the tarball; `npm ls` → google-genai-api 2.0.0 → @google/genai 2.24.0
- [x] V12 live through `dist/`, first attempt each: Fast T2V 720p/4 s → 1280×720, 4.0 s; 3.1 + reference image (`referenceType: 'asset'`, settles the open question) → 1280×720, 8.0 s; 3.1 4k/8 s → 3840×2160, 8.0 s (353 s render). Dimensions read from the mp4 `tkhd`/`mvhd` boxes (no ffprobe); three jobs, three distinct expected values
- [x] V9 in darkroom against the tarball: `npm test` 345 pass / 0 fail / 1 skip (MySQL contract, needs a DB); live through darkroom's own `ADAPTERS.google`: 3.1 Flash 4:5, 3 Pro with `aspectRatio: ''` (darkroom's default → `undefined`), Flash edit with an input image, Veo 3.1 Fast 720p/4 s — all ok. Veo 3.1 (non-fast) covered by V12
- [ ] Branch rename `master` → `main` (Alex: push + GitHub default)
- [ ] `npm publish` (Alex); tag `v2.0.0`; GitHub release
- [ ] darkroom: `google-genai-api@^2.0.0` from npmjs; no `file:`/`localhost:4873` for it in the lockfile; resolved URL 200
- [ ] `npm deprecate google-genai-api@"<2.0.0"` (after darkroom is on 2.0.0)

## Cross-phase invariants
- Subpath exports, class names, constructors (third arg optional), Veo method signatures unchanged (darkroom surface).
- No `as Record<string, unknown>` / `as unknown as` on SDK request objects.
- Every *declared* parameter reaches the wire for unknown models (D3).
- Every 1.x exported type keeps its fields (additive only, D5).
