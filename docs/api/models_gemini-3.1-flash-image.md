<br />

**Nano Banana 2** provides high-quality image generation and conversational
editing at a mainstream price point and low latency. It serves as the
high-efficiency counterpart to [Gemini 3 Pro Image](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image), optimized for speed and
high-volume developer use cases.

**Key updates:**

- New output resolution options:
  - New support for 0.5K, 2K and 4K, default 1K
- New Image Search Grounding:
  - Integration of both text and image search results to inform generation with real-time web data
  - Supported with Thinking on or off
- New 1:4, 4:1, 1:8 and 8:1 aspect ratios
- Improved aspect ratio adherence
- Improved image quality and consistency
- Improved i18n text rendering

[Try in Google AI Studio](https://aistudio.google.com?model=gemini-3.1-flash-image)

## Documentation

Visit the [Image generation](https://ai.google.dev/gemini-api/docs/image-generation) page for full
coverage of features and capabilities.

## gemini-3.1-flash-image

| Property | Description |
|---|---|
| Model code | `gemini-3.1-flash-image` |
| Supported data types | **Inputs** Text, Image, Video, and PDF **Output** Image and Text |
| Token limits^[\[\*\]](https://ai.google.dev/gemini-api/docs/tokens)^ | **Input token limit** 131,072 **Output token limit** 32,768 |
| Capabilities | **[Audio generation](https://ai.google.dev/gemini-api/docs/speech-generation)** Not supported **[Caching](https://ai.google.dev/gemini-api/docs/caching)** Not supported **[Code execution](https://ai.google.dev/gemini-api/docs/code-execution)** Not supported **[File search](https://ai.google.dev/gemini-api/docs/file-search)** Not supported **[Function calling](https://ai.google.dev/gemini-api/docs/function-calling)** Not supported **[Grounding with Google Maps](https://ai.google.dev/gemini-api/docs/maps-grounding)** Not supported **[Image generation](https://ai.google.dev/gemini-api/docs/image-generation)** Supported **[Live API](https://ai.google.dev/gemini-api/docs/live-api)** Not supported **[Search grounding](https://ai.google.dev/gemini-api/docs/google-search)** Supported **[Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)** Not supported **[Thinking](https://ai.google.dev/gemini-api/docs/thinking)** Supported **[URL context](https://ai.google.dev/gemini-api/docs/url-context)** Not supported |
| Consumption options | **[Batch API](https://ai.google.dev/gemini-api/docs/batch-api)** Supported **[Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)** Not supported **[Priority inference](https://ai.google.dev/gemini-api/docs/priority-inference)** Not supported |
| Versions | Read the [model version patterns](https://ai.google.dev/gemini-api/docs/models/gemini#model-versions) for more details. - Stable: `gemini-3.1-flash-image` |
| Latest update | February 2026 |
| Model card | [Model card](https://deepmind.google/models/model-cards/gemini-3-1-flash-image/) |