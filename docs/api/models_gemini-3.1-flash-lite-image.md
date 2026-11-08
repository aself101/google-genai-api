> ## AI Agent Context
> Get the complete documentation index at: https://aistudio.google.com/llms.txt
> Use this file to discover all available pages.
> For the full documentation in a single file, fetch: https://aistudio.google.com/llms-full.txt

# Gemini 3.1 Flash Lite image

**Nano Banana 2 Lite** is designed as the efficiency specialist of the image
generation family, offering ultra-low latency and cost-effective image
generation and editing. By targeting a sub-2 second latency and significantly
reduced TPU compute costs, this model enables high-volume interactive developer
use cases and real-time consumer applications.

**Key capabilities:**

*   **Sub-2 second end-to-end latency**
*   **Interleaved generation and editing** with native support for Text -> Text + Image(s) and Image + Text -> Text + Image(s).
*   **Optimized for lower resolutions** of 1K (1024x1024px).
*   Supports a discrete set of **14 aspect ratios** including standard formats.
*   **Fast multi-turn local edits** (swapping colors, sticker creation, background adjustments).
*   Maintains high character alignment matching original Nano Banana standards.
*   New `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` aspect ratios.
*   Supported `image_size` values: `1024px` (1K). *(Note: 2K and 4K are unsupported).*
*   **SynthID watermarking (Always On) + C2PA**.

{% button href="https://aistudio.google.com?model=gemini-3.1-flash-lite-image" variant="ais" %}Try in Google AI Studio{% /button %}

## Documentation  {% id="documentation" %}

Visit the [Image generation](/docs/image-generation) page for full
coverage of features and capabilities.

## gemini-3.1-flash-lite-image  {% id="gemini-31-flash-lite-image" %}

{% table variant="model" %}
  * Property
  * Description

  ---

  *     {% section class="model-property" %}
  {% icon name="id_card" /%}Model code

    {% /section %}

  * `gemini-3.1-flash-lite-image`

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

  *     **Input token limit** 65,536

    **Output token limit** 4,096


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

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Structured outputs**](/docs/structured-output)

  {% badge type="not-supported" /%}

  {% /section %}

  {% section %}
  [**Thinking**](/docs/thinking)

  {% badge type="supported" %}Supported (minimal and high){% /badge %}

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

    *   Stable: `gemini-3.1-flash-lite-image`


  ---

  *     {% section class="model-property" %}
  {% icon name="calendar_month" /%}Latest update

    {% /section %}

  * June 2026

  ---

  *     {% section class="model-property" %}
  {% icon name="id_card" /%}Model card

    {% /section %}

  * [Model card](https://deepmind.google/models/model-cards/gemini-3-1-flash-lite-image/)

  ---

  *     {% section class="model-property" %}
  {% icon name="paid" /%}Pricing

    {% /section %}

  * [Pricing](/docs/pricing#gemini-3.1-flash-lite-image)
{% /table %}

