# Live battery — 2026-11-08 (3.0)

Run through `dist/`, the built package, on branch `release/3.0`. One key (fingerprint `12aa91bb443a`), US region, a prepay billing account. Script: `scripts/live-battery-3.0.mjs`, plus a follow-up pass for the findings below. Raw record: [`specs/live-3.0-2026-11-08.jsonl`](specs/live-3.0-2026-11-08.jsonl) (130 rows). Scope set by Alex: "Full battery, $30 budget, every param if possible". Estimated spend **$18.06**, from Google's 2026-11-08 price list. The battery estimates from requested resolution and duration; the real cost is on the AI Studio billing page.

**Result: 123 checks in the main run, 116 passed. Of the 7 others, 3 were package defects (fixed, re-run, passing), 2 are vendor behaviour that is now documented, 1 was a battery mislabel, and 1 was a Google 503 (re-run, passing).** The follow-up pass ran 7 more checks, all passing.

## What passed

| Area | Checks | Evidence |
|---|---|---|
| Nano Banana 2.1 grid | all 14 aspect ratios × `1K`/`2K`/`4K` = 42 | every one returned an image at the ratio asked; e.g. 1:1 → 1024², 2048², 4096²; 16:9 1K → 1376×768; 1:8 1K → 352×2928; 8:1 4K → 11712×1408; `modelVersion` `gemini-nano-banana-2.1` |
| Nano Banana 2.1 limits | `512` rejected before the network; `512` sent anyway (warn) → Google: "Image size 512 is not supported for this model" | the constraint row is right |
| Nano Banana 2.1 inputs | 1, 2 and 14 input images; no ratio/size (model default) | all returned an image |
| 2.x image models | `gemini-3.1-flash-image` (1K, 512), `-lite-image` 1K, `gemini-3-pro-image` 1K | still generate |
| Omni grid | `16:9`/`9:16` × `360p`/`720p`/`1080p`/`4k`, 3 s | exact dimensions (640×360 … 3840×2160, portrait swapped), audio track present |
| Omni durations | 3-15 s at 360p, every whole second | each within 0.05 s of the request |
| Omni defaults | no settings | 16:9, 1280×720, 10 s |
| Omni 4k 15 s, `uri` | 213 s wall, 26 MB | inside the 15-minute timeout |
| Deliveries | `inline` explicit, `uri` at 360p and 1080p | `saveVideo` waits for ACTIVE then downloads |
| Inline size | 4k 3 s inline = 5.9-6.3 MB; 360p 15 s image-to-video = 8.2 MB inline | Google's "use uri over 4 MB" is advice, not a limit, at these sizes |
| Modes | image-to-video (3 s, 15 s), 6 reference images, first+last frame 3 s and 10 s | all generated |
| Editing / extension | edit via `previousInteractionId`; extend +3 s → 6.04 s, +10 s → 13.04 s, again +10 s → 23.04 s | an extension returns the whole video, not the tail |
| Uploaded video | upload, edit, extend +3 s, extend with a reference image (after a 503, see below), `task: edit` and `task: extend` with `video` | all generated |
| Tasks | `text_to_video`, `image_to_video`, `reference_to_video`; `edit` / `extend` with `video` | accepted |
| `store: false` | generates | — |
| API rejections | 11 s first+last frame, 16 s, 11 s extension, 1:1, a non-existent `previousInteractionId` | 400s with readable messages, ≈140 ms (rejected before generation) except as noted |
| Video understanding | `gemini-3.8-flash` on an Omni clip, with and without clipping offsets | `modelVersion` `gemini-3.8-flash`; correct descriptions |
| Errors | bad key (both clients), a real 503, production 400s | classified; Omni 503 made **one** call (D22); vendor text present (D26, D27, D29) |
| CLI | `--omni` (9:16), `--omni-previous`, `--omni-image`, `--omni-video`, `--omni-delivery uri --omni-task text_to_video`, `--video`, `--gemini` default, `--veo` migration exit | all as documented |

Wall time, for sizing timeouts: 360p 3 s ≈ 14 s, 720p ≈ 20 s, 1080p ≈ 38 s, 4k ≈ 91 s. At 360p, 10 s takes ≈ 20 s but 11-15 s takes ≈ 36-39 s. Edits ≈ 30 s; a +10 s extension ≈ 37 s, a second one ≈ 64 s.

## Findings

1. **`task` cannot be combined with `previousInteractionId`.** Google: "previous_interaction_id is not allowed when video task is set." The 3.0 wire test had sent exactly that pair. **Fixed (spec D28):** a capability violation before the network. With a task, edit or extend by passing `video`. That works live (`U-task-edit`, `U-task-extend`).
2. **`upscale` is not a task the API accepts**, although SDK 2.32's `Task` type lists it. Google: "Supported values: 'text_to_video', 'image_to_video', 'reference_to_video', 'edit', 'extend'." **Fixed (D28):** removed from `OMNI_TASKS` and `OmniTask`.
3. **In production, Omni request-validation errors lost Google's message.** Their body is the Interactions API's own format, `{"error":{"message":…,"code":"invalid_request"}}`, with no gRPC status, so it differs from the gateway errors (402, bad key, 503), which use Google's gRPC format in an array. **Fixed (D29)** and re-run live: "Video generation failed (HTTP 400): The value '1:1' is not supported … Supported values: '16:9', '9:16'."
4. **Continuing a `store: false` interaction is not rejected.** It returned a new 10.03 s video, the default length, where an edit of the 3 s clip returns 3 s. Google evidently ignores the id it never stored and generates from the prompt alone, and bills for it. The client cannot detect this. **Documented** (README `store` row, Known limitations).
5. **Extending past 30 s in total fails with a generic error after ~60 s.** "400 Request contains an invalid argument", returned only after 62 s of server time, so it may be billed. The client cannot check it, because it does not know an earlier interaction's length. **Documented.**
6. `V-sq` (1:1 sent in warn mode) was labelled a failure by the battery, which expected a success, but it is the confirmation it was looking for: Google accepts only 16:9 and 9:16.
7. `U-ext-ref` got a real 503 "The service is currently unavailable". The client made one call and classified it `TRANSIENT`. Re-run in the follow-up pass: passed.

## Not exercised

Other regions (the EEA/CH/UK limits on uploaded-video editing), 429 handling on Omni, a safety-refused Omni prompt, `delivery: 'uri'` at 4k for a short clip (4k 15 s used it), `gemini-3-pro-image` at 2K/4K and Lite's ratio grid (both exercised in the 2.0 battery and unchanged here).
