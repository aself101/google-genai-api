## [Unreleased]

<!-- 2.0.0 in progress on release/2.0 — spec docs/specs/google-genai-api-2.0-spec-v0_4_2.md. Entries accrue per phase; P6 restructures this file (Keep a Changelog header to the top) and moves them under [2.0.0]. -->

### Added

- **Current Gemini image models:** `gemini-3.1-flash-image` (`MODELS.GEMINI_3_1_FLASH`), `gemini-3.1-flash-lite-image` (`MODELS.GEMINI_3_1_FLASH_LITE`) and `gemini-3-pro-image` (GA), each with its own constraint entry: aspect ratios, `imageSizes`, and up to 14 input images.
- `DEFAULT_IMAGE_MODEL` (`gemini-3.1-flash-image`), `IMAGE_SIZES`, `SUPPORTED_IMAGE_MIME_TYPES`; `ASPECT_RATIOS` grows from 5 to 14 values (the ten every model accepts, plus `1:4`, `4:1`, `1:8`, `8:1` on the 3.1 models).
- `ValidationError` (extends `Error`; `violations` lists every problem) and `getModelViolations(model, params)`, which returns violations instead of throwing. Each is tagged `shape` (malformed — always enforced) or `capability` (the model's constraint table says no).
- A third constructor argument, `{ capabilityValidation: 'error' | 'warn' }`. `'warn'` logs a capability violation and sends the request anyway, for when Google accepts something the table does not know yet. Shape violations always throw.
- `isKnownImageModel(id)` and `isKnownVeoModel(id)` type guards.
- `npm run check:lifecycle` — fails if any cataloged model has an announced shutdown on Google's deprecations page, or is missing from it. `--control` proves it can fail against the 1.x catalog.
- `npm run check:release`, run by `prepublishOnly`: CHANGELOG heading for the version, empty `[Unreleased]`, fresh build, tarball contents, lifecycle.
- CI on push and pull request (Node 20, 22, 24): typecheck, build, test, production audit, pack check. A weekly workflow runs the suite against the newest `@google/genai` 2.x and the lifecycle check, and opens an issue when either fails.

### Changed

- **Default image model is `gemini-3.1-flash-image`** (was `gemini-2.5-flash-image`, which Google shuts down on 2026-10-02). Callers that relied on the implicit default get the new model.
- **`generateWithGemini()` now validates parameters before calling the API** — shape rules for every model, and the constraint table for known models. 1.x never validated in the library, only in the CLI.
- **Model ids this package does not know are sent, not rejected.** They get a one-time warning per client and shape checks only; every parameter the caller passed is sent. `validateModelParams()` no longer throws for an unknown id. This keeps new Google models, and retired ids Google still serves, usable without a release.
- `validateModelParams()` keeps its throwing contract, now throwing `ValidationError` (an `Error`, with the same messages 1.x used for the rules 1.x had). It also now rejects input images with empty `data` or a malformed `mimeType`, and an `aspectRatio`/`imageSize` that is not well-formed, for every model.
- `detectGeminiMode()` no longer throws on more than one input image; how many a model takes is its `inputImagesMax` (up to 14).
- `MODELS.GEMINI_3_PRO` is now `'gemini-3-pro-image'` (GA), not the preview id.
- The SDK client is pinned to the Gemini Developer API (`vertexai: false`) in all three clients. Before, `GOOGLE_GENAI_USE_VERTEXAI` or `GOOGLE_GENAI_USE_ENTERPRISE` in the environment would move requests to a different endpoint and serializer.
- CLI: `--gemini` uses `gemini-3.1-flash-image`; `--gemini-3-pro` uses `gemini-3-pro-image`.
- **Node.js ≥ 20 is required** (was ≥ 18). `@google/genai` has required Node 20 since its 1.0.1, so the 1.x `engines` field already understated it.
- `@google/genai` `^1.30.0` → `^2.24.0`. SDK 2.0's breaking changes are confined to its Interactions API; this package needed no source change for it.

### Removed

- **Imagen.** Google shut the Imagen family down on 2026-08-17 (the endpoints return 404; verified 2026-09-22). Removed: `generateWithImagen()`, `extractImagenImages()`, `MODELS.IMAGEN`, the `imagen-4.0-generate-001` entry in `MODEL_CONSTRAINTS`, the `Imagen*` types, and the CLI's `--imagen` and `-n/--number-of-images`. Google's replacement is `gemini-3.1-flash-image` via `generateWithGemini()` — one image per call.
- **Veo 3.0 and Veo 2.** Shut down 2026-06-30 (404). Removed: `VEO_MODELS.VEO_3`, `VEO_3_FAST`, `VEO_2`, their `VEO_DURATIONS` and `VEO_MODEL_CONSTRAINTS` entries, and duration `'5'` from `VeoDuration` (Veo 2 only). Use `VEO_MODELS.VEO_3_1` / `VEO_3_1_FAST`.
- **`gemini-2.5-flash-image`, `gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` leave the catalog**, with `MODELS.GEMINI` (which pointed at `gemini-2.5-flash-image`) and their `MODEL_CONSTRAINTS` entries. The package now catalogs only models with no announced shutdown. The ids still work — pass them as `model` and they are sent with a warning, for as long as Google serves them. `MODELS.GEMINI` was removed rather than pointed at a new model, so code that used it fails visibly instead of silently switching models. `MODEL_CONSTRAINTS` is string-keyed: a lookup of a removed id compiles and returns `undefined` — check `isKnownImageModel()` first.
- semantic-release and its release workflow. Releases are published by hand, gated by `check:release`.

### Fixed

- `generateWithGemini()` skipped its input-image count check whenever the caller passed `mode`; the check now always runs.
- CLI: pre-flight validation used a placeholder input image; it now validates the real decoded image.

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
