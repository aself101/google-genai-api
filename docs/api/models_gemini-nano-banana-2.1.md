> ## AI Agent Context
> Get the complete documentation index at: https://aistudio.google.com/llms.txt
> Use this file to discover all available pages.
> For the full documentation in a single file, fetch: https://aistudio.google.com/llms-full.txt

# Gemini Nano Banana 2.1

**Gemini Nano Banana 2.1** (`gemini-nano-banana-2.1`) is the latest
high-efficiency image generation and conversational editing model. An update
to Nano Banana 2
([Gemini 3.1 Flash Image](/docs/models/gemini-3.1-flash-image)), it maintains
Flash-level speed and cost efficiency while delivering significant
improvements in visual quality, prompt adherence, multi-turn character
consistency, and text rendering. It serves as the more efficient counterpart to
[Gemini 3 Pro Image](/docs/models/gemini-3-pro-image) (Nano Banana Pro).

**Key updates:**

* Improved visual quality and realism across `1K`, `2K`, and `4K` output
  resolutions (default `1K`)
* Fixed tiling artifacts on wide and panoramic aspect ratios (`1:4`, `4:1`,
  `1:8`, `8:1`) at `2K` and `4K` resolutions
* Enhanced text rendering and infographic layout accuracy
* Multi-image fusion supporting up to 14 reference images (character consistency
  for up to 4 characters and object fidelity for up to 10 objects)
* Grounding with Google Web and Image Search
* Configurable Thinking levels (`minimal`, `medium` default, and `high`)

{% button href="https://aistudio.google.com?model=gemini-nano-banana-2.1" variant="ais" %}Try in Google AI Studio{% /button %}

## Documentation  {% id="documentation" %}

Visit the [Image generation](/docs/image-generation) page for full
coverage of features and capabilities.

## gemini-nano-banana-2.1  {% id="gemini-nano-banana-2-1" %}

{% table variant="model" %}
  * Property
  * Description

  ---

  *     {% section class="model-property" %}
  {% icon name="id_card" /%}Model code

    {% /section %}

  * `gemini-nano-banana-2.1`

  ---

  *     {% section class="model-property" %}
  {% icon name="save" /%}Supported data types

    {% /section %}

  *     **Inputs** Text, Image, Video, and PDF

    **Output** Image and Text


  ---

  *     {% section class="model-property" %}
  {% icon name="token_auto" /%}Token limits{% sup %}[[*]](/docs/tokens){% /sup %}

    {% /section %}

  *     **Input token limit** 131,072

    **Output token limit** 32,768


  ---

  *     {% section class="model-property" %}
  {% icon name="handyman" /%}Capabilities

    {% /section %}

  *     {% section class="three-column-grid" %}
  {% section %}
  [**Audio generation**](/docs/speech-generation)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Batch API**](/docs/batch-api)

  {% badge type="supported" /%}

  {% /section %}

  {% section %}
  [**Caching**](/docs/caching)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Code execution**](/docs/code-execution)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**File search**](/docs/file-search)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Flex inference**](/docs/flex-inference)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Function calling**](/docs/function-calling)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Grounding with Google Maps**](/docs/maps-grounding)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Image generation**](/docs/image-generation)

  {% badge type="supported" /%}

  {% /section %}

  {% section %}
  [**Live API**](/docs/live-api)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Priority inference**](/docs/priority-inference)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Search grounding**](/docs/google-search)

  {% badge type="supported" /%}

  {% /section %}

  {% section %}
  [**Structured outputs**](/docs/structured-output)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Thinking**](/docs/thinking)

  {% badge type="supported" /%}

  {% /section %}

  {% section %}
  [**URL context**](/docs/url-context)

  {% badge type="not-supported" /%}

  {% /section %}

    {% /section %}


  ---

  *     {% section class="model-property" %}
  {% icon name="123" /%}Versions

    {% /section %}

  *     Read the [model version patterns](/docs/models#model-versions) for more details.

    *   Stable: `gemini-nano-banana-2.1`


  ---

  *     {% section class="model-property" %}
  {% icon name="calendar_month" /%}Latest update

    {% /section %}

  * October 2026

  ---

  *     {% section class="model-property" %}
  {% icon name="paid" /%}Pricing

    {% /section %}

  * [Pricing](/docs/pricing#gemini-nano-banana-2.1)
{% /table %}

