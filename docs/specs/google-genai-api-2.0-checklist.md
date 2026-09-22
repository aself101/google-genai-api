# google-genai-api 2.0 — checklist

Companion to [`google-genai-api-2.0-spec-v0_4_0.md`](./google-genai-api-2.0-spec-v0_4_0.md). `[x]` done · `[-]` deliberately skipped (reason inline) · actuals recorded inline. **Ship target: when gates pass; ideally before 2026-10-02.**

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
- [ ] Architect-only confirmation on v0.4.0 → PROCEED
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
- [ ] Remove `.releaserc.json`, `.github/workflows/release.yml`, semantic-release devDeps + script
- [ ] `.github/workflows/ci.yml` (Node 20/22/24, `npm ci && npm run verify`)
- [ ] `.github/workflows/sdk-drift.yml` (weekly + dispatch; `@google/genai@^2 --no-save`; full `verify`; opens `sdk-drift` issue on failure)
- [ ] `verify` script; `check:release` as `prepublishOnly` incl. non-empty `[Unreleased]` (V14, each condition induced once)
- [ ] `engines.node >=20`; `@google/genai ^2.24.0`; TS ^5.9; vitest ^4; `@types/node` ^24
- [ ] Test count on SDK 2.24 with compile fixes only: ___ (1.3.0: 358)

## P2 — removals (~60 LOC, net −~900)
- [ ] Imagen surface removed
- [ ] Veo 3.0/2.0 surface removed (keep `hasAudio`; keep feature-gate branches)
- [ ] V5 = 0 in src/test/package.json (README handled in P6)

## P3a — catalog, lifecycle, validation (~260 src + 180 test)
- [ ] `MODELS`, `DEFAULT_IMAGE_MODEL`, `MODEL_CONSTRAINTS` (new shape), `ASPECT_RATIOS`, `IMAGE_SIZES`
- [ ] `MODEL_DEPRECATIONS` (3 entries) + warn-once + tense + injectable clock (V7)
- [ ] D3 passthrough, all params sent (V6 + both mutations)
- [ ] `src/errors.ts` (leaf): `ValidationError`, `Violation`; `getModelViolations` (shape/capability); `validateModelParams` still throws; `isKnownImageModel`
- [ ] Constraint types kept field-for-field; `imageSizes` added; `'gemini-2.5-flash'` entry kept
- [ ] Both clients: `new GoogleGenAI({ apiKey, vertexai: false })`
- [ ] Violations checked in `generateWithGemini` before the sanitizing try; `capabilityValidation: 'error' | 'warn'`; `detectGeminiMode` + mode-bypass fixed
- [ ] 17 `validateModelParams` test sites rewritten for the new constraint shape

## P3b — request shape, errors, wire tests (~200 src + 150 test)
- [ ] `imageConfig` / `responseModalities`, no casts, no aspect default (V4 + mutation)
- [ ] `extractGeminiParts({ includeThoughts })`; drop `response.parts`; zero-image warn path
- [ ] D13 `toPublicError`: gRPC-status discriminator; status-first classification; per-surface sentences; no production `cause`; status-less errors
- [ ] `test/wire.test.ts` image rows of D12 table, exactly-one-fetch, `text/html` 400, Vertex env var (V13 + mutations recorded)

## P4 — Veo (~150 src + 150 test)
- [ ] Lite; 4k; `durationRequired` added (`resolution1080p` kept, deprecated); D3 + D5 for Veo (`getVeoViolations(model, params, mode)`, `'warn'`); `validateVeoParams` 1.x signature; `isKnownVeoModel`; `getModelInfo` unchanged
- [ ] D15: remove `seed`; present `seed` → `ValidationError`
- [ ] `source:` call shape; D13 in veo-api.ts
- [ ] Wire tests (video) incl. no SDK deprecation `console.warn`; Lite gating unit tests; legacy negative tests repointed at Lite

## P5 — CLI (~110 src + 150 test)
- [ ] `--model`, aliases, repeatable `--input-image`, `--image-size`, no aspect default, Veo `4k`; remove `--imagen`/`-n`
- [ ] CLI pre-flight via `get*Violations` on real inputs; `_N` kept (after thought filter); metadata filename fix; zero-image error exit
- [ ] `test/cli.test.ts` via `--import test/helpers/fetch-replay.mjs`, temp `HOME`, fail on unexpected request, `dist/` built in `globalSetup`

## P6 — docs
- [ ] README rewritten top to bottom (spec §8 P6 method; floor list covered)
- [ ] `scripts/render-readme-tables.mjs` + generated blocks
- [ ] `test/readme.test.ts` (V17 a/b/c: runtime ∪ `.d.ts` exports, generated blocks, TOC anchors; three controls recorded)
- [ ] `public-interface-validator` read of the rendered README
- [ ] V15 three greps = 0; V5 README hits only inside "Upgrading to 2.0"
- [ ] CHANGELOG: walk every §3/§6 row (each → a line, or marked internal here); header to top, pre-2.0 note, empty `[Unreleased]`, `[2.0.0]` canonical order incl. Security
- [ ] `MIGRATION-PLAN.md` → `docs/archive/`

## P7 — release
- [ ] `git pull --ff-only`, merged-tree `npm run verify`
- [ ] Version 2.0.0; CHANGELOG dated; recheck npm `time` map for 2.0.0
- [ ] V16 live through built package on SDK 2.24 (9:16 → portrait; 2K → 2048)
- [ ] V18: sdk-drift green on `@^2`; control dispatch with a broken assertion fails and opens the issue
- [ ] `npm pack`; darkroom installs the tarball; `npm ls google-genai-api @google/genai` shows 2.0.0 + 2.x
- [ ] V12 live: Veo Fast T2V, Veo 3.1 + ref image, Veo 3.1 4k/8s (degradable per spec §7: 3 consecutive same-error failures; never on 429/5xx)
- [ ] V9 (advisory) in darkroom against the tarball: tests + one job per Google model
- [ ] Branch rename `master` → `main` (Alex: push + GitHub default)
- [ ] `npm publish` (Alex); tag `v2.0.0`; GitHub release
- [ ] darkroom: `google-genai-api@^2.0.0` from npmjs; no `file:`/`localhost:4873` for it in the lockfile; resolved URL 200
- [ ] `npm deprecate google-genai-api@"<2.0.0"` (after darkroom is on 2.0.0)

## Cross-phase invariants
- Subpath exports, class names, constructors (third arg optional), Veo method signatures unchanged (darkroom surface).
- No `as Record<string, unknown>` / `as unknown as` on SDK request objects.
- Every *declared* parameter reaches the wire for unknown models (D3).
- Every 1.x exported type keeps its fields (additive only, D5).
