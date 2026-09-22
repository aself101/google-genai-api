# google-genai-api 2.0 — checklist

Companion to [`google-genai-api-2.0-spec-v0_1_0.md`](./google-genai-api-2.0-spec-v0_1_0.md). `[x]` done · `[-]` deliberately skipped (reason inline) · actuals recorded inline.

## P0 — spec, review, probes
- [x] Vendor snapshots in `docs/api/` (2026-09-22)
- [x] Spec v0.1.0
- [ ] `pre-implementation` review → spec v0.2.0
- [x] V2 — `gemini-3-pro-image-preview` generate: **OK** 1024×1024 ; `gemini-3.1-flash-image-preview` generate: **OK** 1024×1024 → both route to D2 deprecated tier (past-tense warning), not deleted
- [x] V3 control — first run confounded (prompt said "wide establishing shot": flat 16:9 and imageConfig 16:9 both 1376×768). Rerun, neutral prompt "A red apple on a wooden table": flat `9:16` → **1408×768 (ignored)**; `imageConfig` `9:16` → **768×1376**. SDK 1.30 serializer (`generateContentConfigToMldev`) copies `imageConfig` only; top-level `aspectRatio` is dropped. Also: unset ratio ⇒ model-chosen framing (landscape here), not 1:1.
- [x] V10 — `'512'` → 512×512 ; `'2K'` → 2048×2048 ; Lite `'2K'` → server 400 "Image size 2K is not supported for this model"
- [x] V11 — 3 input images on 3.1-flash → OK 1376×768 (16:9 honored)
- [x] Lite `1:4` → OK 512×2064 — Lite accepts extended ratios (at least 1:4); resolves the "14 ratios" ambiguity toward 14
- [x] V8 — Lite refs → server 400 "`referenceImages` isn't supported by this model" ; Lite 720p/4s T2V → OK, 32 s wall
- [x] Probe spend: 12 image generations (11 OK, 1 rejected pre-generation) + 1 Veo Lite 4 s job (1 refs call rejected pre-generation). Cost not metered per call. Raw: `docs/specs/probes-2026-09-22.jsonl`

## P1 — tooling / release
- [ ] Remove `.releaserc.json`, `.github/workflows/release.yml`, semantic-release devDeps + script
- [ ] Add `.github/workflows/ci.yml` (Node 20/22)
- [ ] `verify` script
- [ ] `engines.node >=20`; `@google/genai ^2.24.0`; TS ^5.9; vitest ^4; `@types/node` ^24
- [ ] Baseline test count on SDK 2.24: ___ (1.3.0: 358)

## P2 — removals
- [ ] V5 control (pre-removal census count): ___
- [ ] Imagen surface removed
- [ ] Veo 3.0/2.0 surface removed
- [ ] V5 = 0

## P3 — image catalog
- [ ] Catalog + `MODEL_DEPRECATIONS` + warn-once (V7)
- [ ] Unknown-id passthrough (V6, with mutation)
- [ ] Capability validation; `detectGeminiMode` fixed
- [ ] `imageConfig` / `thinkingConfig` / `tools` request shape (V4, with mutation)
- [ ] `extractGeminiParts` skips thought parts; drop `response.parts` fallback

## P4 — Veo
- [ ] Lite constraints; 4k for 3.1/Fast
- [ ] `source:` call shape
- [ ] Negative tests repointed at Lite

## P5 — CLI
- [ ] `--model`, aliases, repeatable `--input-image`, `--image-size`, `--thinking`, `--grounding`, Veo `4k`
- [ ] `cli.ts:912` metadata filename fix
- [ ] Subprocess CLI smoke tests

## P6 — docs
- [ ] README models table, Upgrading to 2.0, fix export/CLI-syntax errors
- [ ] CHANGELOG `[2.0.0]`
- [ ] `MIGRATION-PLAN.md` → `docs/archive/`

## P7 — release
- [ ] Merged-tree `npm run verify`
- [ ] Verdaccio publish; darkroom install + tests + 1 image + 1 video job (V9)
- [ ] Live V3 / V8 against built package
- [ ] Branch rename `master` → `main` (Alex: push + GitHub default branch)
- [ ] `npm publish` (Alex); `npm deprecate google-genai-api@"<2.0.0"`
- [ ] darkroom lockfile jq scan + authenticated resolution check

## Cross-phase invariants
- Subpath exports, class names, constructors, `extractGeminiParts`, Veo method signatures unchanged (darkroom surface).
- No `as Record<string, unknown>` / `as unknown as` on SDK request objects.
