# google-genai-api 2.0 — checklist

Companion to [`google-genai-api-2.0-spec-v0_2_0.md`](./google-genai-api-2.0-spec-v0_2_0.md). `[x]` done · `[-]` deliberately skipped (reason inline) · actuals recorded inline. **Ship target: before 2026-10-02.**

## P0 — spec, review, probes
- [x] Vendor snapshots in `docs/api/` (2026-09-22)
- [x] Spec v0.1.0 (`523aedd`)
- [x] `pre-implementation` run #1 — architect 67 REVISE · docs 56 · assumptions 81 · 44 issues (tracker `google-genai-api` run 1)
- [x] Spec v0.2.0 (`c3df6d0`) — all 44 findings dispositioned (spec §13)
- [ ] `pre-implementation` run #2 → PROCEED
- [x] V2 — `gemini-3-pro-image-preview` **OK** 1024×1024 ; `gemini-3.1-flash-image-preview` **OK** 1024×1024 → D2 deprecated tier
- [x] V3 — first run confounded (prompt "wide establishing shot": flat 16:9 and imageConfig 16:9 both 1376×768). Rerun, neutral prompt: flat `9:16` → **1408×768 (ignored)**; `imageConfig` `9:16` → **768×1376**. SDK 1.30 `generateContentConfigToMldev` copies `imageConfig` only. Unset ratio ⇒ model-chosen framing, not 1:1.
- [x] V10 — `'512'` → 512×512 ; `'2K'` → 2048×2048 ; Lite `'2K'` → server 400 "Image size 2K is not supported for this model"
- [x] V11 — 3 input images on 3.1-flash → OK 1376×768
- [x] Lite `1:4` → OK 512×2064 (Lite accepts extended ratios)
- [x] V8 — Lite refs → server 400 "`referenceImages` isn't supported by this model" ; Lite 720p/4s T2V → OK, 32 s
- [x] A4 — `gemini-3-pro-image` (GA) `4:5`/`1K` → OK, finish STOP, 1 image, 0 thought parts
- [x] Probe spend: 15 image generations (14 OK, 1 rejected pre-generation) + 1 Veo Lite 4 s job (1 refs call rejected pre-generation). Not metered per call. Raw: `docs/specs/probes-2026-09-22.jsonl`
- [x] V5 control (pre-removal, `-i`, src+test+package.json+README): **220**
- [x] V15 control (README "default: 1:1"): **8**

## P1 — tooling / release (~120 LOC)
- [ ] Remove `.releaserc.json`, `.github/workflows/release.yml`, semantic-release devDeps + script
- [ ] `.github/workflows/ci.yml` (Node 20/22/24, `npm ci && npm run verify`)
- [ ] `verify` script; `check:release` as `prepublishOnly` (V14, each condition induced once)
- [ ] `engines.node >=20`; `@google/genai ^2.24.0`; TS ^5.9; vitest ^4; `@types/node` ^24
- [ ] Test count on SDK 2.24 with compile fixes only: ___ (1.3.0: 358)

## P2 — removals (~60 LOC, net −~900)
- [ ] Imagen surface removed
- [ ] Veo 3.0/2.0 surface removed (keep `hasAudio`; keep feature-gate branches)
- [ ] V5 = 0 in src/test/package.json (README handled in P6)

## P3a — catalog, lifecycle, validation (~260 LOC)
- [ ] `MODELS`, `DEFAULT_IMAGE_MODEL`, `MODEL_CONSTRAINTS` (new shape), `ASPECT_RATIOS`, `IMAGE_SIZES`
- [ ] `MODEL_DEPRECATIONS` (3 entries) + warn-once + tense + injectable clock (V7)
- [ ] D3 passthrough, all params sent (V6 + both mutations)
- [ ] D5 validation called from `generateWithGemini`; `capabilityValidation: 'error' | 'warn'`; `detectGeminiMode` + mode-bypass fixed

## P3b — request shape, errors, wire tests (~280 LOC)
- [ ] `imageConfig` / `responseModalities`, no casts, no aspect default (V4 + mutation)
- [ ] `extractGeminiParts({ includeThoughts })`; drop `response.parts`; zero-image warn path
- [ ] D13 4xx pass-through (api.ts)
- [ ] `test/wire.test.ts` image cases (V13 + flat-shape mutation)

## P4 — Veo (~220 LOC)
- [ ] Lite; 4k; `durationRequired`; D3 for Veo + `getModelInfo` `known`
- [ ] `source:` call shape; D13 in veo-api.ts
- [ ] Wire tests (video); Lite gating unit tests; legacy negative tests repointed at Lite

## P5 — CLI (~250 LOC)
- [ ] `--model`, aliases, repeatable `--input-image`, `--image-size`, no aspect default, Veo `4k`; remove `--imagen`/`-n`
- [ ] `_N` kept; metadata filename fix; zero-image error exit
- [ ] `test/cli.test.ts` subprocess smoke tests against `dist/cli.js`

## P6 — docs
- [ ] README per spec §8 P6 scope (every listed location)
- [ ] V15 = 0; V5 README hits only inside "Upgrading to 2.0"
- [ ] CHANGELOG: header moved to top, pre-2.0 note, `[2.0.0]` per category table
- [ ] `MIGRATION-PLAN.md` → `docs/archive/`

## P7 — release
- [ ] `git pull --ff-only`, merged-tree `npm run verify`
- [ ] Version 2.0.0; CHANGELOG dated; recheck npm `time` map for 2.0.0
- [ ] Verdaccio publish; darkroom one-off `--registry http://localhost:4873/`; `npm ls` shows 2.0.0
- [ ] V12 live: Veo Fast T2V, Veo 3.1 + ref image, Veo 3.1 4k/8s
- [ ] Darkroom follow-through (darkroom repo): Pro → `gemini-3-pro-image`; fallback → `gemini-3.1-flash-image`; decide edit `1:1`; pin `^2.0.0`
- [ ] V9: darkroom tests + one job per Google model
- [ ] Branch rename `master` → `main` (Alex: push + GitHub default)
- [ ] `npm publish` (Alex); tag `v2.0.0`; GitHub release
- [ ] darkroom `--registry https://registry.npmjs.org/` reinstall; jq scan empty; resolved URL 200
- [ ] `npm deprecate google-genai-api@"<2.0.0"` (after darkroom is on 2.0.0)

## Cross-phase invariants
- Subpath exports, class names, constructors (third arg optional), Veo method signatures unchanged (darkroom surface).
- No `as Record<string, unknown>` / `as unknown as` on SDK request objects.
- Every caller-supplied parameter reaches the wire for unknown models (D3).
