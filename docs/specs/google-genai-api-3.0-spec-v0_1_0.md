# google-genai-api 3.0 — specification

| | |
|---|---|
| Version | v0.1.1 (built on branch `release/3.0`; live battery run 2026-11-08; not yet reviewed) |
| Date | 2026-11-08 |
| Target repo | `misc/npm-packages/google-genai-api`, branch `release/3.0` |
| From → To | 2.0.0 (`5d9c1ba`, published 2026-09-23) → 3.0.0 |
| Decision owner | Alex |
| Settled decisions | Ship 3.0 that replaces Veo with Omni, adds Nano Banana 2.1, moves video understanding off `gemini-2.5-flash` (Alex, 2026-11-08: "make the recommended fixes"). The 2.0 rule stands: the catalog lists current models only (2.0 spec D2). |
| Ship gate | §7: every check green **and** the live battery run — **run 2026-11-08** ([`../LIVE-BATTERY-2026-11-08.md`](../LIVE-BATTERY-2026-11-08.md)). It was first blocked by `402 RESOURCE_EXHAUSTED` ("prepayment credits are depleted"): Google moved the billing account to Prepay, and Alex loaded credits. |
| Predecessor | [`google-genai-api-2.0-spec-v0_4_2.md`](./google-genai-api-2.0-spec-v0_4_2.md) — D1–D16 still hold except where a decision below says otherwise |
| Vendor source | `docs/api/*.md`, fetched 2026-11-08 from `aistudio.google.com/docs/*.md` (Google moved the docs there from `ai.google.dev`) |
| Tags | **[LIVE]** observed against the real API · **[DOC]** vendor docs snapshot · **[VERIFY]** unresolved; the named check settles it |

## 0. Summary

Google shut down all three Veo 3.1 models on 2026-10-22, so every 2.0 video-generation call has failed since. The replacement Google names, Gemini Omni Flash, runs on the Interactions API, not on `generateVideos`. 3.0 therefore removes the Veo client and adds an Omni client rather than repointing model ids. Google also released Nano Banana 2.1 (and recommends it over 2.0's default), and scheduled the video-understanding model for shutdown on 2026-12-01. The lifecycle gate that should have announced all this did: it opened issue #2 on 2026-10-05 and commented weekly. Nobody read it. Separately, Google changed the deprecations page format in the week of 2026-11-02, which would have broken the gate's parser at the next run.

## 1. Evidence

### 1.1 Vendor state [DOC] — `docs/api/deprecations.md`

| Cataloged in 2.0 | Page, 2026-11-08 | Replacement named |
|---|---|---|
| `veo-3.1-generate-preview`, `-fast-`, `-lite-` | **shut down 2026-10-22** | `gemini-omni-1.2-flash` |
| `gemini-2.5-flash` (video understanding) | shutdown 2026-12-01; then routes to `gemini-3.5-flash-lite` | — |
| `gemini-3.1-flash-image` | no shutdown; recommended replacement `gemini-nano-banana-2.1` | — |
| `gemini-3-pro-image`, `gemini-3.1-flash-lite-image` | no shutdown | — |

New: `gemini-nano-banana-2.1` (2026-10-06), `gemini-omni-1.2-flash` (2026-11-05). `gemini-omni-1.1-flash` routes to 1.2 from 2026-12-03, so it is not cataloged (D2). The video-understanding guide (`docs/api/video-understanding.md`) uses only `gemini-3.8-flash`.

### 1.2 Live [LIVE, 2026-11-08, key fingerprint `12aa91bb443a`]

- `models.list`: 61 models. Includes `gemini-omni-1.2-flash`, `gemini-nano-banana-2.1` and `gemini-3.8-flash`, and **no Veo id**. Control: a bogus key returns 400 "API key not valid".
- `interactions.create` and `models.generateContent` both returned **402 RESOURCE_EXHAUSTED, "Your prepayment credits are depleted"**. No generation evidence yet (§7).
- The Interactions client's error is `APIError` (`InternalServerError` for 5xx) with `status`. Its `message` is `402 API error occurred: {"httpMeta":…}`, and the vendor body sits in `body` as a **JSON array of one error**.
- Interactions client and the fetch seam (local stub): it resolves the global `fetch` per call and passes a `Request` object. It builds `output_video` from `steps[]`. **With the default retry policy, one 503 produced 5 calls**; with `retries: { strategy: 'none' }`, 1.

### 1.3 SDK [DOC] — `docs/api/js-genai-CHANGELOG.md`

`@google/genai` 3.0.0 (2026-11-06): Node ≥ 22, default API version `v1` (Gemini Developer API), "Disable GenerateVideos for Gemini API". 2.32.0 (2026-10-29) is the last 2.x, and its Interactions types cover everything Omni needs (`previous_interaction_id`, `response_format.{aspect_ratio,resolution,duration,delivery}`, `generation_config.video_config.task`, `store`).

## 4. Decisions

Numbering continues from the 2.0 spec.

**D17 — Lifecycle gate reads both page formats.** Google now serves `https://aistudio.google.com/docs/deprecations.md` (the `.md.txt` URL redirects) with Markdoc `{% table %}` blocks: rows are separated by `---` lines and cells are `* value` items. The pipe-table parser read 0 rows from that page. The zero-row check would have failed loudly, so the gate was not silently broken, but it could no longer report anything useful. The parser takes both formats. A row counts only when its first cell is a backticked id. The snapshot is refreshed. The 2026-09-22 pipe-format page moves to `test/fixtures/`, and `--control` must parse it, so neither parser can rot while the live page uses the other format. `gemini-3.1-flash-lite-image` leaves the not-listed allowlist (Google lists it now), which leaves the allowlist empty.

**D18 — Remove Veo; add Omni as its own client. Major version.** The rejected alternative was to keep `./veo` and `GoogleGenAIVeoAPI` as a compatibility shim over Omni. That shim would have to fake an operation/poll lifecycle that Omni does not have, accept parameters Omni rejects (`negativePrompt`, `personGeneration`), and map Veo's per-mode methods onto a model that picks the mode itself. It would hide exactly the differences a caller has to know about. 2.0 precedent: removed models are removed, not aliased (2.0 §6, the `MODELS.GEMINI` row). Importing `./veo` now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. That failure is loud and immediate, unlike calling a shut-down endpoint.

**D19 — One `generate()`, no per-mode methods.** Omni reads the mode from the prompt and the inputs. `generation_config.video_config.task` exists only as a fallback, and Google says to try the prompt first because `task` "adds strict constraints". Per-mode methods (`generateFromImage`, `interpolate`, …) would claim a mode control the API does not give. So the client exposes `generate(params)`, with `images`, `video`, `previousInteractionId` and an optional `task`, and the README tells the caller to describe each image's role in the prompt. Editing and extension ship in 3.0. They cost no surface beyond `previousInteractionId` and `video`, and they are Omni's main reason to exist. **Alex was asked whether editing should be in 3.0 or 3.1 and did not choose; this is the builder's call, flagged.**

**D20 — Default image model: `gemini-nano-banana-2.1`.** Google: "Recommended for all new projects to use Nano Banana 2.1". A major release is where a default changes (2.0 D4 changed the default the same way). Its constraint row comes from Google's docs: all 14 ratios, `1K`/`2K`/`4K` (no `512`, stated in the image-generation guide), and 14 inputs. **Settled live 2026-11-08:** all 42 ratio × size cells generated, and Google refused `512`; the row matches.

**D21 — Video understanding: `gemini-3.8-flash`.** `gemini-2.5-flash` shuts down 2026-12-01 and then routes to `gemini-3.5-flash-lite`. That routing is a silent model change, worse than an explicit one. `gemini-3.8-flash` is the model Google's video-understanding guide uses throughout. `MODELS.GEMINI_VIDEO` keeps its key and changes its value, which is a semantics-without-signature change, so the CHANGELOG says so explicitly. It stays a fixed model with no override, as in 2.0 (README Known limitations).

**D22 — Omni `create` is never retried, and it is bounded.** Every attempt is a billed generation. The SDK's default policy retried a 503 four times in the probe (§1.2), and a timeout or 5xx after the server had started could bill for videos nobody receives. `generate` passes `retries: { strategy: 'none' }` and `timeout_ms` (default `OMNI_TIMEOUTS.REQUEST`, 15 min: 4k 15 s took 213 s live, overridable per call). A wire test counts the calls, and its negative control (option removed → 5 calls) was run on 2026-11-08. The Files API poll for `uri` delivery is retried the normal way: it is free.

**D23 — `@google/genai` stays on 2.x (`^2.32.0`).** 3.0 raises the Node floor to 22 and changes the default API version to `v1`, while Google's Omni examples use `/v1beta/interactions` **[UNSEARCHED: whether `/v1/interactions` exists]**. Taking SDK 3.0 here would put a second breaking change (the Node floor) into the same major as the Omni switch, and would trade the documented endpoint for an undocumented one. Revisit in 3.1 or 4.0 with its own live check.

**D24 — Veo parameters are rejected, not dropped.** `negativePrompt`, `personGeneration` and `seed` on an Omni call are **shape** violations, with the message "not supported by Gemini Omni; put negatives in the prompt". 2.0 D15 precedent: a JS caller spreading `{ seed }` must not go from a loud error to a silent ignore. The CLI does the same for `--veo` and every `--veo-*` flag. The check runs **before** commander parses, because commander would otherwise reject `--veo-duration` as an "unknown option" and never reach a message that explains what happened.

**D25 — The build empties `dist/`, and the release gate rejects orphaned `dist/` files.** `tsc` never deletes output, and `check:release` allowed all of `dist/`, so 3.0 (the first release to delete a source module) would have shipped 2.x's `dist/veo-api.js`. Its docstring claimed the tarball was "never a stale one". Prevention: `build` runs `clean` first. Detection: every tarball `dist/` file must map to a `src/` module. 2.0.0's published tarball was inspected and is clean.

**D26 — The error surface reads the Interactions error body.** `vendorMessage` also parses `err.body` (object, or array of one) under the same rule as before: `error.status` must be a gRPC status name, and only `error.message` is read, never `details[]`. Without this, a production 402 "credits depleted" reads "the request was rejected. Please check your inputs." Negative control (errors.ts at 2.0 → two production tests fail) was run on 2026-11-08. A failed interaction (`status: 'failed'`) carries its `errors[].message` as `operationError.message`, so safety classification works unchanged.

**D27 — Outside production, an Interactions error carries the vendor error as its message.** 2.0 D13 keeps the SDK's own error message outside production, for 1.x compatibility. The Interactions client's own message is `<status> API error occurred: {"httpMeta":…}`, which carries no information. With D13 applied unchanged, the CLI (not a production process) printed that for a 402 "credits depleted" (found live, 2026-11-08, free check F9). Omni has no 1.x callers to stay compatible with, so for this error shape only, `message` becomes the vendor error JSON (`{"error":{…}}`). That is the form the models client's `ApiError.message` already has, including `details`, exactly as image errors are outside production. Identity, class and every other property are kept. A message that does not match the shape is left alone. Negative control: the wire and CLI tests fail with the replacement removed (2026-11-08).

**D28 — Two task rules from the live battery.** (a) `task` with `previousInteractionId` is a **capability** violation. The API says "previous_interaction_id is not allowed when video task is set", and the 3.0 wire test had sent exactly that pair. It is capability rather than shape because it is this model's rule (D3: an unknown id is not held to it). To edit or extend with a task, pass `video`, which works live. (b) `upscale` leaves `OMNI_TASKS` and `OmniTask`: SDK 2.32's `Task` type lists it, and the API answers "Supported values: 'text_to_video', 'image_to_video', 'reference_to_video', 'edit', 'extend'". The catalog follows the API, not the SDK type, as with every other row. Negative control: 4 tests failed before the fix.

**D29 — The Interactions API's own error format is read too, only from `body`.** Request-validation errors arrive as `{"error":{"message":…,"code":"invalid_request"}}`, with no gRPC status, no array and a string code. Gateway errors (402, a bad key, 503) arrive as an array of one gRPC-style Gemini error. D26 recognised only the second, so in production "1:1 is not supported … Supported values: '16:9', '9:16'" became "the request was rejected" (live check P1). The new form is trusted only from `body` (which only the Interactions client sets) and only with a lowercase-identifier `code`. A test shows a JSON body with any other code is still not trusted. Negative control: the format test failed before the fix; P1 re-ran live and passed.

**Documented, not guarded (live 2026-11-08):** continuing a `store: false` interaction is silently a fresh, billed generation (10 s default, unrelated); extending past 30 s in total fails with a generic 400 after ~60 s. The client cannot know an earlier interaction's storage or length, so a guard would need state the package does not have. README: the `store` row and Known limitations.

## 5. Target catalog

| Constant | Value |
|---|---|
| `MODELS` | `GEMINI_NANO_BANANA_2_1` `gemini-nano-banana-2.1`, `GEMINI_3_1_FLASH`, `GEMINI_3_1_FLASH_LITE`, `GEMINI_3_PRO`, `GEMINI_VIDEO` `gemini-3.8-flash` |
| `DEFAULT_IMAGE_MODEL` | `gemini-nano-banana-2.1` |
| `OMNI_MODELS` | `OMNI_1_2_FLASH` `gemini-omni-1.2-flash` |
| `OMNI_MODEL_CONSTRAINTS` | ratios `16:9`/`9:16`; `360p`–`4k`; 3–15 s (default 10); 10 s cap for first+last frame and per extension turn; 30 s extended total; 6 images; tasks per SDK 2.32 `Task` |

## 6. Migration

README → "Upgrading to 3.0" is the source. CHANGELOG `[Unreleased]` lists every removal.

## 7. Verification

Offline, all green on 2026-11-08: `npm run verify` (typecheck of source and tests, build, 443 tests). Free live checks F1-F10 and C-veo pass through `dist/` (2026-11-08), `check:lifecycle` live and `--control`, `readme:tables --check`. Negative controls run: D22 (retries), D26 (error body), D27 (non-production message), D17 (old parser vs new page reads 0 rows), README retired-name rule vs the 2.0 README (fails, >10 lines).

**Live battery** — `scripts/live-battery-3.0.mjs`, through `dist/` (the built package). Alex 2026-11-08: "Full battery, $30 budget, every param if possible": the Nano Banana 2.1 grid, the Omni ratio × resolution grid and every duration, every mode and `task`, both deliveries, `store:false`, the API's own rejections, uploaded-video edit/extend, video understanding with clipping, the CLI. A running estimate stops it at $30; estimated ≈ $18. The table below is the minimum it must settle; the script holds the full list. It records results to `docs/specs/live-3.0-<date>.jsonl`. Estimated cost under $2 at the 2026-11-08 price list (Omni $0.023/s at 360p, $0.07/s at 720p, $0.104/s at 1080p; Nano Banana 2.1 $0.034 per 1K image).

| ID | Check | Settles |
|---|---|---|
| L1–L3 | Nano Banana 2.1: 1K 1:1, 2K 21:9, 1K 1:8 | D20 row |
| L4 | Nano Banana 2.1 `512` → rejected before the network | D20 |
| L5 | Nano Banana 2.1 edit with 2 input images | D20 |
| L6 | `gemini-3.1-flash-image` still generates (the 2.x default, still cataloged) | D2 |
| L7 | Omni text-to-video, 360p 3 s inline: response shape, wall time, bytes | D19 |
| L8 | Omni edit of L7 via `previousInteractionId` | D19 |
| L9 | Omni extend of L7, 3 s | D19 |
| L10 | Omni image-to-video from L1's image | D19 |
| L11 | Omni first+last frame (L1, L2), 3 s | D19 |
| L12 | Omni `delivery: 'uri'`: file reaches ACTIVE, `saveVideo` downloads | D19 |
| L13 | Omni 9:16 | catalog |
| L14 | Omni 1080p 3 s inline: does inline survive > 4 MB? | `delivery` default — **settled:** inline returned 6 MB (4k 3 s) and 8 MB (360p 15 s); `inline` stays the default |
| L15 | Omni two frames + 11 s → API 400, and the message reaches the caller | D19 note, D26 |
| L16 | Omni `negativePrompt` → rejected before the network | D24 |
| L17 | Omni edit of an uploaded video (L7's file through the Files API) | `video` input |
| L18 | Video understanding on `gemini-3.8-flash` over L7's clip | D21 |
| L19 | CLI `--omni` and CLI `--gemini` default, through `dist/cli.js` | CLI |

## 9. Known limitations (shipped, documented)

README → Known limitations: an Omni call that times out may still be billed. The Omni `uri` download and image/video-understanding calls set no timeout. Omni's regional limits are not modeled. `@google/genai` 3.x is unsupported.

## 7b. Live result (2026-11-08)

123 checks in the main run, 116 passed; 7 follow-up checks, all passed. Estimated spend $18.06 of the $30 budget. The 7 non-passes: 3 package defects (D28 a/b, D29), fixed and re-run; 2 vendor behaviours, documented; 1 battery mislabel (`V-sq`, a confirmation); 1 Google 503, re-run and passed. Detail: [`../LIVE-BATTERY-2026-11-08.md`](../LIVE-BATTERY-2026-11-08.md); raw: `live-3.0-2026-11-08.jsonl`.

## 11. Open questions

- D19: is editing in 3.0 the right call? (Built; Alex to confirm.)
- D20: does Alex want the default changed at all, given that it changes output for every caller who omits `model`? (Built as recommended; one-line revert.)

## Revision history

- **v0.1.1** (2026-11-08) — live battery run (§7b); D28 and D29 added from its findings; the `store`/30 s behaviours recorded as documented-not-guarded. The [VERIFY] on the 15-minute timeout is settled: 4k 15 s took 213 s.
- **v0.1.0** (2026-11-08) — first draft, written alongside the build on `release/3.0`; live battery blocked on billing.
