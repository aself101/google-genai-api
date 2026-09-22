## [Unreleased]

<!-- 2.0.0 in progress on release/2.0 — spec docs/specs/google-genai-api-2.0-spec-v0_4_2.md. Entries accrue per phase; P6 restructures this file (Keep a Changelog header to the top) and moves them under [2.0.0]. -->

### Added

- `npm run check:lifecycle` — fails if any cataloged model has an announced shutdown on Google's deprecations page, or is missing from it. `--control` proves it can fail against the 1.x catalog.
- `npm run check:release`, run by `prepublishOnly`: CHANGELOG heading for the version, empty `[Unreleased]`, fresh build, tarball contents, lifecycle.
- CI on push and pull request (Node 20, 22, 24): typecheck, build, test, production audit, pack check. A weekly workflow runs the suite against the newest `@google/genai` 2.x and the lifecycle check, and opens an issue when either fails.

### Changed

- **Node.js ≥ 20 is required** (was ≥ 18). `@google/genai` has required Node 20 since its 1.0.1, so the 1.x `engines` field already understated it.
- `@google/genai` `^1.30.0` → `^2.24.0`. SDK 2.0's breaking changes are confined to its Interactions API; this package needed no source change for it.

### Removed

- **Imagen.** Google shut the Imagen family down on 2026-08-17 (the endpoints return 404; verified 2026-09-22). Removed: `generateWithImagen()`, `extractImagenImages()`, `MODELS.IMAGEN`, the `imagen-4.0-generate-001` entry in `MODEL_CONSTRAINTS`, the `Imagen*` types, and the CLI's `--imagen` and `-n/--number-of-images`. Google's replacement is `gemini-3.1-flash-image` via `generateWithGemini()` — one image per call.
- **Veo 3.0 and Veo 2.** Shut down 2026-06-30 (404). Removed: `VEO_MODELS.VEO_3`, `VEO_3_FAST`, `VEO_2`, their `VEO_DURATIONS` and `VEO_MODEL_CONSTRAINTS` entries, and duration `'5'` from `VeoDuration` (Veo 2 only). Use `VEO_MODELS.VEO_3_1` / `VEO_3_1_FAST`.
- semantic-release and its release workflow. Releases are published by hand, gated by `check:release`.

### Security

- `axios` `^1.6.2` → `^1.20.0` (the locked 1.13.2 carried ~30 advisories, including SSRF and prototype-pollution chains). `file-type` `^19.6.0` → `^21.3.4` (patched; 22.x would require Node ≥ 22). Transitive `jws`, `ws`, `minimatch`, `brace-expansion` updated. `npm audit --omit=dev`: 0 vulnerabilities.

# [1.3.0](https://github.com/aself101/google-genai-api/compare/v1.2.2...v1.3.0) (2025-12-03)


### Features

* **typescript:** migrate codebase from JavaScript to TypeScript ([4a307db](https://github.com/aself101/google-genai-api/commit/4a307db3dcac4883edb2123ebe960505e881948c))

## [1.2.2](https://github.com/aself101/google-genai-api/compare/v1.2.1...v1.2.2) (2025-11-23)


### Bug Fixes

* **cli:** unique filenames for multi-image Imagen generation ([bbdcab6](https://github.com/aself101/google-genai-api/commit/bbdcab6370e4bec8b06dcbc2ada6db931a2c1cec))

## [1.2.1](https://github.com/aself101/google-genai-api/compare/v1.2.0...v1.2.1) (2025-11-23)


### Bug Fixes

* **cli:** read version dynamically from package.json ([d108900](https://github.com/aself101/google-genai-api/commit/d108900446787e942e06bcaee10423fa7471b682))

# [1.2.0](https://github.com/aself101/google-genai-api/compare/v1.1.2...v1.2.0) (2025-11-23)


### Features

* **gemini:** add Gemini 3 Pro Image Preview model support ([6aa43bd](https://github.com/aself101/google-genai-api/commit/6aa43bd55a4a25554edd106f26932f79b56dcd32))

## [1.1.2](https://github.com/aself101/google-genai-api/compare/v1.1.1...v1.1.2) (2025-11-22)


### Bug Fixes

* **docs:** improve README with video docs and API method table ([ae85a2c](https://github.com/aself101/google-genai-api/commit/ae85a2cef53d5a7ee1ef0b051880d6c1e1b4f6f7))

## [1.1.1](https://github.com/aself101/google-genai-api/compare/v1.1.0...v1.1.1) (2025-11-22)


### Bug Fixes

* **docs:** add video generation to title and quickstart examples ([84299d2](https://github.com/aself101/google-genai-api/commit/84299d2844fefbdd0555d8995b77f7403eb5b61d))

# [1.1.0](https://github.com/aself101/google-genai-api/compare/v1.0.3...v1.1.0) (2025-11-22)


### Features

* **veo:** add Veo 3.1 video generation and video understanding APIs ([80a4ea0](https://github.com/aself101/google-genai-api/commit/80a4ea0456674b273e88e817e0c0551a112770af))

## [1.0.3](https://github.com/aself101/google-genai-api/compare/v1.0.2...v1.0.3) (2025-11-21)


### Features

* **veo:** add Veo 3.1 video generation API with text-to-video, image-to-video, and video extension
* **video:** add video understanding/analysis API for analyzing video content
* **cli:** add markdown output format for video analysis results


### Bug Fixes

* **veo-api:** fix durationSeconds type from String to Number for Veo API compatibility
* **video-api:** update files.get() API call for @google/genai SDK v1.30.0
* update CLI version to 1.0.3 ([61e4b63](https://github.com/aself101/google-genai-api/commit/61e4b635674e182fdadbabcaa0429e2ff4fab4b9))


### Dependencies

* upgrade @google/genai SDK from v0.3.1 to v1.30.0

## [1.0.2](https://github.com/aself101/google-genai-api/compare/v1.0.1...v1.0.2) (2025-11-20)


### Bug Fixes

* **security:** add DNS rebinding prevention to SSRF protection ([b089a80](https://github.com/aself101/google-genai-api/commit/b089a80ace954b1c576166057b0bd3485fbd8c8b))

## [1.0.1](https://github.com/aself101/google-genai-api/compare/v1.0.0...v1.0.1) (2025-11-19)


### Bug Fixes

* Updated README and clarified examples ([6754403](https://github.com/aself101/google-genai-api/commit/6754403e28c1468e821121cafae1bd2014785780))

# 1.0.0 (2025-11-19)


### Features

* initial release of google-genai-api ([4179a5a](https://github.com/aself101/google-genai-api/commit/4179a5aa069f1fc35913375f559ed131d14a2ad8))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
