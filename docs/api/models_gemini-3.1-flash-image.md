> ## AI Agent Context
> Get the complete documentation index at: https://aistudio.google.com/llms.txt
> Use this file to discover all available pages.
> For the full documentation in a single file, fetch: https://aistudio.google.com/llms-full.txt

# Gemini 3.1 Flash image

**Nano Banana 2** provides high-quality image generation and conversational
editing at a mainstream price point and low latency. It serves as the
high-efficiency counterpart to [Gemini 3 Pro Image](/docs/models/gemini-3-pro-image), optimized for speed and
high-volume developer use cases.

**Key updates:**

* New output resolution options:  * New support for 0.5K, 2K and 4K, default 1K

* New Image Search Grounding:  *     Integration of both text and image search results to inform generation with
    real-time web data

  *     Supported with Thinking on or off


* New 1:4, 4:1, 1:8 and 8:1 aspect ratios
* Improved aspect ratio adherence
* Improved image quality and consistency
* Improved i18n text rendering

{% button href="https://aistudio.google.com?model=gemini-3.1-flash-image" variant="ais" %}Try in Google AI Studio{% /button %}

## Documentation  {% id="documentation" %}

Visit the [Image generation](/docs/image-generation) page for full
coverage of features and capabilities.

## gemini-3.1-flash-image  {% id="gemini-31-flash-image" %}

{% table variant="model" %}
  * Property
  * Description

  ---

  *     {% section class="model-property" %}
  {% icon name="id_card" /%}Model code

    {% /section %}

  * `gemini-3.1-flash-image`

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

    *   Stable: `gemini-3.1-flash-image`


  ---

  *     {% section class="model-property" %}
  {% icon name="calendar_month" /%}Latest update

    {% /section %}

  * February 2026

  ---

  *     {% section class="model-property" %}
  {% icon name="id_card" /%}Model card

    {% /section %}

  * [Model card](https://deepmind.google/models/model-cards/gemini-3-1-flash-image/)

  ---

  *     {% section class="model-property" %}
  {% icon name="paid" /%}Pricing

    {% /section %}

  * [Pricing](/docs/pricing#gemini-3.1-flash-image)
{% /table %}

