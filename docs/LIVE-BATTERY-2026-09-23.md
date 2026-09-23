# Live battery — 2026-09-23

Every model, parameter value and mode the wrapper exposes, run against the production Gemini
Developer API through the **built** package. Image and Veo generation went through the CLI
(`dist/cli.js`); reference images, interpolation and extension have no CLI flags, so a
script drove them through `dist/veo-api.js`. The runs started at `07b3ebe` and the
fixes they produced landed in `9bac687`. The fixed paths were re-run on the rebuilt `dist/`.

Setup: one API key, US region. The inputs were a 9:16 lighthouse photo from an earlier probe
and fourteen 256×256 PNG tiles numbered 1–14. The runner, logs and outputs stayed in the
session scratchpad and are not committed; the rows below are the record.

Checking method:
- **Images:** every image was checked by eye on a contact sheet. Dimensions were read from
  the file header and compared with the requested ratio (a 4% tolerance is allowed).
- **Videos:** width, height and duration were read from the mp4 `tkhd`/`mvhd` boxes. Each clip
  was then described by the package's own `GoogleGenAIVideoAPI`, which also exercised that
  client.

Prices are Google's list prices on the pricing page on 2026-09-23. They are estimates, not
billing records.

## Image generation — 52 runs

| run | model | result | output |
|---|---|---|---|
| 14 aspect ratios | `gemini-3.1-flash-image` | 14/14 OK | 1:1 1024², 3:2 1264×848, 2:3 848×1264, 3:4 896×1200, 4:3 1200×896, 4:5 928×1152, 5:4 1152×928, 9:16 768×1376, 16:9 1376×768, 21:9 1584×672, 1:4 512×2064, 4:1 2064×512, 1:8 352×2928, 8:1 2928×352 — every ratio exact |
| 14 aspect ratios | `gemini-3.1-flash-lite-image` | 14/14 OK | the same dimensions as Flash. **Lite accepts all 14**, extreme ratios included (Google's page lists 10) |
| 10 aspect ratios | `gemini-3-pro-image` | 10/10 OK | the same dimensions as Flash for the 10 ratios |
| `--image-size` 512 / 2K / 4K | Flash | OK | 688×384 / 2752×1536 / 5504×3072 (16:9) |
| `--image-size` 1K | Lite | OK | 1376×768 |
| `--image-size` 1K / 2K / 4K | Pro | OK | 1376×768 / 2752×1536 / 5504×3072 |
| 14 input images, edit | Flash, Lite, Pro | 3/3 OK | **all fourteen numbered tiles appear in every output**, so every input reached the model |
| `--gemini`, no ratio | Flash | OK | 1408×768 is the model's default framing, which confirms no ratio is sent |
| batch, two prompts | Flash | OK | two files; a teapot and a teacup |
| `-a 1:4 --capability-validation warn` | Pro | sent, **400 from Google**: "Aspect ratio 1:4 is not supported for this model" | the catalog's rule, confirmed from the server side |
| `--image-size 2K --capability-validation warn` | Lite | sent, **400 from Google**: "Image size 2K is not supported for this model" | the catalog's rule, confirmed from the server side |

Images: $4.02.

## Veo — 12 generations

| run | model | params | result | output |
|---|---|---|---|---|
| T2V | Lite | 720p, 6 s, 9:16 | OK | 720×1280, 6.0 s, rain on a window |
| T2V | Lite | 1080p, 8 s, 16:9 | OK | 1920×1080, 8.0 s, hot-air balloon |
| I2V | Lite | 720p, 4 s, `allow_adult` | OK | 720×1280, 4.0 s, the lighthouse animated |
| T2V | Lite | 720p, 4 s, `negativePrompt`, `allow_all` | **400 from Google**: "`negativePrompt` isn't supported by this model" | finding 2 |
| T2V | Fast | 1080p, 8 s, `dont_allow` | **400 from Google**: "dont_allow for personGeneration is currently not supported" | finding 3 |
| T2V | Fast | 4k, 8 s | OK | 3840×2160, 8.0 s, misty forest (332 s render) |
| T2V | Standard | 1080p, 8 s, 9:16 | OK | 1080×1920, 8.0 s, paper boat |
| reference images ×3 (`asset`) | Fast | lighthouse + tiles 1 and 7 | OK | 1280×720, 8.0 s; the lighthouse with **1** and **7** cubes in front |
| interpolation | Fast | tile 1 → tile 7 | OK | 1280×720, 8.0 s; the 1 transforms into the 7 |
| T2V (extension base) | Fast | 720p, 8 s | OK | 1280×720, 8.0 s, sailboat |
| **extension** | Fast | the base above | OK | 1280×720, **15.0 s** (8 + 7), the sailboat reaches the shore |

Every clip has a native soundtrack: rain, waves, birdsong, burner bursts or running water.
Veo: $9.85.

### Parameter rules, pinned live (7 submissions, 4 accepted)

| probe | result |
|---|---|
| `negativePrompt` on Fast | accepted, generated |
| `negativePrompt` on Standard | accepted, generated |
| T2V `allow_adult` (Lite) | **400** "allow_adult … not supported" |
| T2V `allow_all` (Lite) | accepted, generated |
| T2V `dont_allow` (Lite) | **400** |
| I2V `allow_all` (Lite) | accepted, generated. Google's table says `allow_adult` only |
| I2V `dont_allow` (Lite) | **400** |

Rule probes: $2.40.

## Video understanding

| run | result |
|---|---|
| CLI `--video`, two prompts, `--video-start 2s --video-end 6s` (before the fix) | **400 from Google**: `Unknown name "videoMetadata" at 'contents[0].parts[1].file_data'`. See finding 1 |
| the same with `9s`–`14s`, after the fix | OK, 24 s. "A person steers a sailboat … into the vibrant golden light of a sunset"; the second prompt listed the objects. The metadata records `clipping: {startOffset: '9s', endOffset: '14s'}` |
| `GoogleGenAIVideoAPI` upload → analyse → delete on all 9 Veo clips | 9/9 OK. Each description matches its prompt |

## Client-side rejections (free; nothing sent)

These all exit 1 with a message naming the value and the rule:
- Lite `--image-size 2K`
- Pro `-a 1:8`
- 15 input images
- `2k` (lowercase)
- `-a wide`
- Lite `4k`
- Fast `1080p` at 4 s
- `--veo-duration 5`
- Veo `1:1`
- `--veo-person-generation everyone`
- no mode
- no `--prompt`

After the fixes, three more:
- Lite `--veo-negative-prompt`
- T2V `dont_allow`
- T2V `allow_adult`

A deliberately invalid key reached Google and came back as a 400 "API key not valid"; it cost nothing.

## Findings

1. **Video clipping had never worked, since 1.x.** `generateFromVideo` nested `videoMetadata`
   inside `fileData`. The API wants it beside `fileData` on the part, and it rejected every
   clipped request. The 1.x unit test asserted the nested shape against a mocked SDK, so it
   passed. This is the blind spot the wire tests exist for. Fixed in `9bac687`: the part is
   typed as the SDK's `Part`, and a wire test through the real serializer pins the shape.
   Restoring the 1.x shape makes that test fail. Re-run live: OK.
2. **Veo 3.1 Lite rejects `negativePrompt`; Fast and Standard accept it.** Google's parameter
   table does not list `negativePrompt` for 3.1 at all. It is now a `VeoFeatures.negativePrompt`
   capability, shown in the README's Veo table.
3. **`personGeneration` depends on the mode, and `dont_allow` is rejected everywhere.**
   Text-to-video accepts `allow_all` only. Image-to-video accepts `allow_all` and `allow_adult`;
   Google's table says `allow_adult` only, which is wrong for this key and region. Encoded as
   `VEO_PERSON_GENERATION_BY_MODE` capability checks. They can be downgraded with
   `capabilityValidation: 'warn'`, because Google limits EU, UK, CH and MENA to `allow_adult`.
4. **The catalog's image rules hold from the server side too.** Sending a value the catalog
   rejects, via `warn`, got Google's own 400 for the same reason, both times.
5. **At extreme ratios Flash and Lite fill the frame with repeated panels.** At 1:4, 1:8 and
   8:1 they often tile two or three copies of the scene instead of composing one. The
   dimensions are exact; this is model behaviour. Noted in the README.
6. **Google's spend-based rate limit.** Running the image and Veo groups in parallel tripped
   `429 RESOURCE_EXHAUSTED` ("You exceeded your spend-based rate limit … for your account's
   billing history and tier") on 21 image runs. Those runs cost nothing. Re-run at one request
   every 20 s, all 21 passed. The wrapper classifies the error `TRANSIENT`. The README's
   troubleshooting section now names it.
7. **The CLI prints the SDK's raw JSON error body outside production.** This is the documented
   D13 behaviour: the original SDK error, as 1.x did. It is noisy on a terminal. Left as is.

## Not exercised

- the 429 and long-processing branches of *upload* polling;
- Pro's thought parts (Pro again returned none);
- a safety-blocked prompt (not attempted deliberately);
- Veo extension on Standard (the same code path as Fast);
- regions outside the US.

## Totals

- 87 recorded runs:
  - 60 successful generations or analyses;
  - 15 intended client-side rejections, all exit 1 with nothing sent;
  - the rest were server rejections, each a finding above.
- Estimated at list price: **≈ $16.30**. Images $4.02, Veo $9.85 (including the library modes),
  rule probes $2.40, video understanding under $0.05.
