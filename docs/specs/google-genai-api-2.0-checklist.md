# google-genai-api 2.0 — checklist

Companion to [`google-genai-api-2.0-spec-v0_3_0.md`](./google-genai-api-2.0-spec-v0_3_0.md). `[x]` done · `[-]` deliberately skipped (reason inline) · actuals recorded inline. **Ship target: before 2026-10-02.**

## P0 — spec, review, probes
- [x] Vendor snapshots in `docs/api/` (2026-09-22)
- [x] Spec v0.1.0 (`523aedd`)
- [x] `pre-implementation` run #1 — architect 67 REVISE · docs 56 · assumptions 81 · 44 issues (tracker `google-genai-api` run 1)
- [x] Spec v0.2.0 (`c3df6d0`) — all 44 findings dispositioned (spec §13)
- [x] `pre-implementation` run #2 — architect 83 REVISE (AF-006: validateModelParams contract) · docs 71 · assumptions 81 · 41 issues (tracker run 2)
- [x] Spec v0.3.0 — all 41 findings dispositioned (spec §13b)
- [x] SDK 2.24 inspected (scratchpad install): fetch seam late-bound, no default retries, `imageConfig` maps aspectRatio/imageSize, Veo `seed` throws on Gemini API (also on 1.30 — proven locally, control `negativePrompt` reached fetch)
- [x] darkroom deadline remap handed to darkroom workstream (on 1.3.0, decoupled)
- [ ] `pre-implementation` run #3 → PROCEED
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

## P1 — tooling / release (~120 LOC)
- [ ] Remove `.releaserc.json`, `.github/workflows/release.yml`, semantic-release devDeps + script
- [ ] `.github/workflows/ci.yml` (Node 20/22/24, `npm ci && npm run verify`)
- [ ] `.github/workflows/sdk-drift.yml` (weekly + dispatch; `@google/genai@latest --no-save`; wire tests only)
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
- [ ] `src/errors.ts`: `ValidationError`; `getModelViolations` (shape/capability); `validateModelParams` still throws
- [ ] Violations checked in `generateWithGemini` before the sanitizing try; `capabilityValidation: 'error' | 'warn'`; `detectGeminiMode` + mode-bypass fixed
- [ ] 17 `validateModelParams` test sites rewritten for the new constraint shape

## P3b — request shape, errors, wire tests (~200 src + 150 test)
- [ ] `imageConfig` / `responseModalities`, no casts, no aspect default (V4 + mutation)
- [ ] `extractGeminiParts({ includeThoughts })`; drop `response.parts`; zero-image warn path
- [ ] `extraConfig` (image)
- [ ] D13 `toPublicError` in errors.ts, used by both clients (message field only; 401/403/429 no vendor text)
- [ ] `test/wire.test.ts` image rows of D12 table, exactly-one-fetch (V13 + mutations recorded)

## P4 — Veo (~150 src + 150 test)
- [ ] Lite; 4k; `durationRequired`; D3 + D5 for Veo (`getVeoViolations`, `'warn'`); `getModelInfo` `known`
- [ ] D15: remove `seed`; `extraConfig` (Veo)
- [ ] `source:` call shape; D13 in veo-api.ts
- [ ] Wire tests (video); Lite gating unit tests; legacy negative tests repointed at Lite

## P5 — CLI (~110 src + 150 test)
- [ ] `--model`, aliases, repeatable `--input-image`, `--image-size`, no aspect default, Veo `4k`; remove `--imagen`/`-n`
- [ ] `_N` kept; metadata filename fix; zero-image error exit
- [ ] `test/cli.test.ts` via `--import test/helpers/fetch-replay.mjs`, temp `HOME`, fail on unexpected request

## P6 — docs
- [ ] README rewritten top to bottom (spec §8 P6 method; floor list covered)
- [ ] `test/readme.test.ts` export census (V17, control against 1.x README + dist)
- [ ] `public-interface-validator` read of the rendered README
- [ ] V15 three greps = 0; V5 README hits only inside "Upgrading to 2.0"
- [ ] CHANGELOG: header to top, pre-2.0 note, empty `[Unreleased]`, `[2.0.0]` in canonical order incl. Security
- [ ] `MIGRATION-PLAN.md` → `docs/archive/`

## P7 — release
- [ ] `git pull --ff-only`, merged-tree `npm run verify`
- [ ] Version 2.0.0; CHANGELOG dated; recheck npm `time` map for 2.0.0
- [ ] V16 live through built package on SDK 2.24 (9:16 → portrait; 2K → 2048)
- [ ] V18: sdk-drift job green on `@latest`; control dispatch with a broken assertion fails
- [ ] Verdaccio publish; darkroom **worktree** `--registry http://localhost:4873/`; `npm ls` shows 2.0.0
- [ ] V12 live: Veo Fast T2V, Veo 3.1 + ref image, Veo 3.1 4k/8s (degradable per spec §7)
- [ ] darkroom `'1:1'` edit decision recorded (gate before pin bump)
- [ ] V9 in the darkroom worktree: tests + one job per Google model; delete worktree
- [ ] Branch rename `master` → `main` (Alex: push + GitHub default)
- [ ] `npm publish` (Alex); tag `v2.0.0`; GitHub release
- [ ] darkroom real checkout: `google-genai-api@^2.0.0` from npmjs; jq scan empty; resolved URL 200
- [ ] `npm deprecate google-genai-api@"<2.0.0"` (after darkroom is on 2.0.0)

## Cross-phase invariants
- Subpath exports, class names, constructors (third arg optional), Veo method signatures unchanged (darkroom surface).
- No `as Record<string, unknown>` / `as unknown as` on SDK request objects.
- Every caller-supplied parameter reaches the wire for unknown models (D3).
