> ## AI Agent Context
> Get the complete documentation index at: https://aistudio.google.com/llms.txt
> Use this file to discover all available pages.
> For the full documentation in a single file, fetch: https://aistudio.google.com/llms-full.txt

# Nano Banana image generation

{% button href="https://aistudio.google.com" variant="ais" %}
  Try in Google AI Studio

{% /button %}

**Nano Banana** is the name for Gemini's native image generation capabilities.
Gemini can generate and process images conversationally with text, images,
video, or a combination. This lets you create, edit, and iterate on visuals with
unprecedented control.

## Model selection  {% id="model-selection" %}

Nano Banana refers to the following models available in the Gemini API:

*   **Nano Banana 2.1**: The
  [Gemini Nano Banana 2.1](/docs/models/gemini-nano-banana-2.1) model
  (`gemini-nano-banana-2.1`). An update to Nano Banana 2, serving as the
  primary high-efficiency workhorse model for image generation and
  conversational editing. It maintains Flash-level speed and cost efficiency
  while delivering improved visual quality, text rendering, multi-turn
  consistency, and Google Search grounding across 1K, 2K, and 4K resolutions.

*   **Nano Banana 2 Lite**: The
  [Gemini 3.1 Flash Lite Image](/docs/models/gemini-3.1-flash-lite-image) model
  (`gemini-3.1-flash-lite-image`). The fastest and cheapest Gemini image
  model, engineered for velocity and scale where speed and cost are primary
  constraints. Not optimized for multiple reference inputs or multi-turn
  sequential editing.

*   **Nano Banana 2**: The
  [Gemini 3.1 Flash Image](/docs/models/gemini-3.1-flash-image) model
  (`gemini-3.1-flash-image`). The previous-generation high-efficiency workhorse
  model, optimized for speed, 4K generation, and multiple reference image
  consistency. Recommended for all new projects to use Nano Banana 2.1.

*   **Nano Banana Pro**: The
  [Gemini 3 Pro Image](/docs/models/gemini-3-pro-image) model
  (`gemini-3-pro-image`). The premium choice for complex visual tasks,
  utilizing advanced reasoning ("Thinking") to follow complex instructions,
  maintain brand consistency, and render high-fidelity text.

*   **Nano Banana**: The
  [Gemini 2.5 Flash Image](/docs/models/gemini-2.5-flash-image) model
  (`gemini-2.5-flash-image`). The legacy model of the Nano Banana series. Recommended
  migration path is Nano Banana 2 Lite for higher quality, faster speeds,
  and lower pricing.


All generated images include a
[SynthID watermark](https://ai.google.dev/responsible/docs/safeguards/synthid).

## Image generation (text-to-image)  {% id="image-generation-text-to-image" %}

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
      from PIL import Image
  
      client = genai.Client()
  
      prompt = ("Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme")
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[prompt],
      )
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif part.inline_data is not None:
              image = part.as_image()
              image.save("generated_image.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const prompt =
          "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme";
  
        const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: prompt,
        });
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("gemini-native-image.png", buffer);
            console.log("Image saved as gemini-native-image.png");
          }
        }
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
        package main
  
        import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
        )
  
        func main() {
  
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
  
        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-nano-banana-2.1",
            genai.Text("Create a picture of a nano banana dish in a " +
                       " fancy restaurant with a Gemini theme"),
            nil,
        )
  
        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "gemini_generated_image.png"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
        }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.Part;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Paths;
  
      public class TextToImage {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1",
                "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme",
                config);
  
            for (Part part : response.parts()) {
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("_01_generated_image.png"), blob.data().get());
                }
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.IO;
      using System.Threading.Tasks;
  
      public class TextToImage {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("generated_image.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as generated_image.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{
            "parts": [
              {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
            ]
          }]
        }'
  ```

  {% /tab %}

{% /tabs %}

## Image editing (text-and-image-to-image)  {% id="gemini-image-editing" %}

**Reminder**: Make sure you have the necessary rights to any images you upload.
Don't generate content that infringe on others' rights, including videos or
images that deceive, harass, or harm. Your use of this generative AI service is
subject to our
[Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).

Provide an image and use text prompts to add, remove, or modify elements, change
the style, or adjust the color grading.

The following example demonstrates uploading `base64` encoded images. For
multiple images, larger payloads, and supported MIME types, check the
[Image understanding](/docs/image-understanding) page.

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
      from PIL import Image
  
      client = genai.Client()
  
      prompt = (
          "Create a picture of my cat eating a nano-banana in a "
          "fancy restaurant under the Gemini constellation"
      )
  
      image = Image.open("/path/to/cat_image.png")
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[prompt, image],
      )
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif part.inline_data is not None:
              image = part.as_image()
              image.save("generated_image.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const imagePath = "path/to/cat_image.png";
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString("base64");
  
        const prompt = [
          { text: "Create a picture of my cat eating a nano-banana in a " +
                  "fancy restaurant under the Gemini constellation" },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image,
            },
          },
        ];
  
        const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: prompt,
        });
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("gemini-native-image.png", buffer);
            console.log("Image saved as gemini-native-image.png");
          }
        }
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
         package main
  
         import (
       "context"
       "fmt"
       "log"
       "os"
       "google.golang.org/genai"
         )
  
         func main() {
  
       ctx := context.Background()
       client, err := genai.NewClient(ctx, nil)
       if err != nil {
           log.Fatal(err)
       }
  
       imagePath := "/path/to/cat_image.png"
       imgData, _ := os.ReadFile(imagePath)
  
       parts := []*genai.Part{
         genai.NewPartFromText("Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation"),
         &genai.Part{
           InlineData: &genai.Blob{
             MIMEType: "image/png",
             Data:     imgData,
           },
         },
       }
  
       contents := []*genai.Content{
         genai.NewContentFromParts(parts, genai.RoleUser),
       }
  
       result, _ := client.Models.GenerateContent(
           ctx,
           "gemini-nano-banana-2.1",
           contents,
           nil,
       )
  
       for _, part := range result.Candidates[0].Content.Parts {
           if part.Text != "" {
               fmt.Println(part.Text)
           } else if part.InlineData != nil {
               imageBytes := part.InlineData.Data
               outputFilename := "gemini_generated_image.png"
               _ = os.WriteFile(outputFilename, imageBytes, 0644)
           }
       }
         }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
        import com.google.genai.Client;
        import com.google.genai.types.Content;
        import com.google.genai.types.GenerateContentConfig;
        import com.google.genai.types.GenerateContentResponse;
        import com.google.genai.types.Part;
  
        import java.io.IOException;
        import java.nio.file.Files;
        import java.nio.file.Path;
        import java.nio.file.Paths;
  
        public class TextAndImageToImage {
      public static void main(String[] args) throws IOException {
  
        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();
  
          GenerateContentResponse response = client.models.generateContent(
              "gemini-nano-banana-2.1",
              Content.fromParts(
                  Part.fromText("""
                      Create a picture of my cat eating a nano-banana in
                      a fancy restaurant under the Gemini constellation
                      """),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("src/main/resources/cat.jpg")),
                      "image/jpeg")),
              config);
  
          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("gemini_generated_image.png"), blob.data().get());
              }
            }
          }
        }
      }
        }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class TextAndImageToImage {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: new Content
              {
                  Parts = new List<Part>
                  {
                      new Part { Text = "Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation" },
                      Part.FromBytes(await File.ReadAllBytesAsync("/path/to/cat_image.png"), "image/png")
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("gemini_generated_image.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as gemini_generated_image.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
          -H "x-goog-api-key: $GEMINI_API_KEY" \
          -H 'Content-Type: application/json' \
          -d "{
            \"contents\": [{
              \"parts\":[
                  {\"text\": \"Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation\"},
                  {
                    \"inline_data\": {
                      \"mime_type\":\"image/jpeg\",
                      \"data\": \"<BASE64_IMAGE_DATA>\"
                    }
                  }
              ]
            }]
          }"
  ```

  {% /tab %}

{% /tabs %}

### Multi-turn image editing  {% id="multi-turn-image-editing" %}

Keep generating and editing images conversationally. Chat or multi-turn
conversation is the recommended way to iterate on images. The following example
shows a prompt to generate an infographic about photosynthesis.

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
  
      client = genai.Client()
  
      chat = client.chats.create(
          model="gemini-nano-banana-2.1",
          config=types.GenerateContentConfig(
              response_modalities=['TEXT', 'IMAGE'],
              tools=[{"google_search": {}}]
          )
      )
  
      message = "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."
  
      response = chat.send_message(message)
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif image:= part.as_image():
              image.save("photosynthesis.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      const ai = new GoogleGenAI({});
  
      async function main() {
        const chat = ai.chats.create({
          model: "gemini-nano-banana-2.1",
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            tools: [{googleSearch: {}}],
          },
        });
  
        const message = "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."
  
        let response = await chat.sendMessage({message});
  
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("photosynthesis.png", buffer);
            console.log("Image saved as photosynthesis.png");
          }
        }
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
          "context"
          "fmt"
          "log"
          "os"
  
          "google.golang.org/genai"
      )
  
      func main() {
          ctx := context.Background()
          client, err := genai.NewClient(ctx, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          config := &genai.GenerateContentConfig{
              ResponseModalities: []string{"TEXT", "IMAGE"},
              Tools: []*genai.Tool{
                  {GoogleSearch: &genai.GoogleSearch{}},
              },
          }
          chat, err := client.Chats.Create(ctx, "gemini-nano-banana-2.1", config, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          message := "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."
  
          resp, err := chat.SendMessage(ctx, genai.Part{Text: message})
          if err != nil {
              log.Fatal(err)
          }
  
          for _, part := range resp.Candidates[0].Content.Parts {
              if part.Text != "" {
                  fmt.Println(part.Text)
              } else if part.InlineData != nil {
                  err := os.WriteFile("photosynthesis.png", part.InlineData.Data, 0644)
                  if err != nil {
                      log.Fatal(err)
                  }
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Chat;
      import com.google.genai.Client;
      import com.google.genai.types.Content;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.GoogleSearch;
      import com.google.genai.types.ImageConfig;
      import com.google.genai.types.Part;
      import com.google.genai.types.RetrievalConfig;
      import com.google.genai.types.Tool;
      import com.google.genai.types.ToolConfig;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Path;
      import java.nio.file.Paths;
  
      public class MultiturnImageEditing {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
  
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .tools(Tool.builder()
                    .googleSearch(GoogleSearch.builder().build())
                    .build())
                .build();
  
            Chat chat = client.chats.create("gemini-nano-banana-2.1", config);
  
            GenerateContentResponse response = chat.sendMessage("""
                Create a vibrant infographic that explains photosynthesis
                as if it were a recipe for a plant's favorite food.
                Show the "ingredients" (sunlight, water, CO2)
                and the "finished dish" (sugar/energy).
                The style should be like a page from a colorful
                kids' cookbook, suitable for a 4th grader.
                """);
  
            for (Part part : response.parts()) {
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("photosynthesis.png"), blob.data().get());
                }
              }
            }
            // ...
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class MultiturnImageEditing {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader.",
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" },
                  Tools = new List<Tool> { new Tool { GoogleSearch = new GoogleSearch() } }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("photosynthesis.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as photosynthesis.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{
            "role": "user",
            "parts": [
              {"text": "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plants favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids cookbook, suitable for a 4th grader."}
            ]
          }],
          "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

![AI-generated infographic about photosynthesis](https://www.gstatic.com/cloud-cms/bb7eae3c8034fd8aded280176d387543.png)You can then use the same chat to change the language on the graphic to Spanish.

{% tabs %}
  {% tab label="Python" %}
  ```python
      message = "Update this infographic to be in Spanish. Do not change any other elements of the image."
      aspect_ratio = "16:9" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
      resolution = "2K" # "1K", "2K", "4K"
  
      response = chat.send_message(message,
          config=types.GenerateContentConfig(
              image_config=types.ImageConfig(
                  aspect_ratio=aspect_ratio,
                  image_size=resolution
              ),
          ))
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif image:= part.as_image():
              image.save("photosynthesis_spanish.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      const message = 'Update this infographic to be in Spanish. Do not change any other elements of the image.';
      const aspectRatio = '16:9';
      const resolution = '2K';
  
      let response = await chat.sendMessage({
        message,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution,
          },
          tools: [{googleSearch: {}}],
        },
      });
  
      for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("photosynthesis2.png", buffer);
            console.log("Image saved as photosynthesis2.png");
          }
      }
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      message = "Update this infographic to be in Spanish. Do not change any other elements of the image."
      aspectRatio := "16:9" // "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
      resolution := "2K"    // "1K", "2K", "4K"
  
      config.ImageConfig = &genai.ImageConfig{
          AspectRatio: aspectRatio,
          ImageSize:   resolution,
      }
  
      resp, err = chat.SendMessage(ctx, genai.Part{Text: message})
      if err != nil {
          log.Fatal(err)
      }
  
      for _, part := range resp.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              err := os.WriteFile("photosynthesis_spanish.png", part.InlineData.Data, 0644)
              if err != nil {
                  log.Fatal(err)
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      String aspectRatio = "16:9"; // "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
      String resolution = "2K"; // "1K", "2K", "4K"
  
      config = GenerateContentConfig.builder()
          .responseModalities("TEXT", "IMAGE")
          .imageConfig(ImageConfig.builder()
              .aspectRatio(aspectRatio)
              .imageSize(resolution)
              .build())
          .build();
  
      response = chat.sendMessage(
          "Update this infographic to be in Spanish. " +
          "Do not change any other elements of the image.",
          config);
  
      for (Part part : response.parts()) {
        if (part.text().isPresent()) {
          System.out.println(part.text().get());
        } else if (part.inlineData().isPresent()) {
          var blob = part.inlineData().get();
          if (blob.data().isPresent()) {
            Files.write(Paths.get("photosynthesis_spanish.png"), blob.data().get());
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class MultiturnImageEditingSpanish {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: new Content
              {
                  Parts = new List<Part>
                  {
                      new Part { Text = "Update this infographic to be in Spanish. Do not change any other elements of the image." },
                      Part.FromBytes(await File.ReadAllBytesAsync("photosynthesis.png"), "image/png")
                  }
              },
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" },
                  ImageConfig = new ImageConfig
                  {
                      AspectRatio = "16:9",
                      ImageSize = "2K"
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("photosynthesis_spanish.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as photosynthesis_spanish.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d '{
          "contents": [
            {
              "role": "user",
              "parts": [{"text": "Create a vibrant infographic that explains photosynthesis..."}]
            },
            {
              "role": "model",
              "parts": [{"inline_data": {"mime_type": "image/png", "data": "<PREVIOUS_IMAGE_DATA>"}}]
            },
            {
              "role": "user",
              "parts": [{"text": "Update this infographic to be in Spanish. Do not change any other elements of the image."}]
            }
          ],
          "tools": [{"google_search": {}}],
          "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
              "aspectRatio": "16:9",
              "imageSize": "2K"
            }
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

![AI-generated infographic of photosynthesis in Spanish](https://www.gstatic.com/cloud-cms/b435b5da9f72aebf268a1d821a46bd3a.png)## Features of Nano Banana  {% id="gemini-3-capabilities" %}

Nano Banana models offer state-of-the-art image generation and editing. Gemini
Nano Banana 2.1 and Gemini 3.1 Flash Image are optimized for speed and
high-volume use-cases, and Gemini 3 Pro Image is optimized for professional
asset production.

Designed to tackle the most challenging workflows through advanced reasoning,
they excel at complex, multi-turn creation and modification tasks.

-   **High-resolution output**: Built-in generation capabilities for 1K, 2K, and
  4K visuals.

  - **Gemini 3.1 Flash Image** adds the smaller 512 (0.5K) resolution (not supported on Gemini Nano Banana 2.1).

-   **Advanced text rendering**: Capable of generating legible, stylized text for
  infographics, menus, diagrams, and marketing assets.

-   **Grounding with Google Search**: The model can use Google Search as a tool to
  verify facts and generate imagery based on real-time data (e.g., current
  weather maps, stock charts, recent events).

  - **Gemini Nano Banana 2.1 and Gemini 3.1 Flash Image** add the integration of Grounding with Google Search for Images alongside Web Search.

-   **Thinking mode**: The model utilizes a "thinking" process to reason through
  complex prompts. It generates interim "thought images" (visible in the backend
  but not charged) to refine the composition before producing the final
  high-quality output.

-   **Up to 14 reference images**: Mix up to 14 reference images to
  produce the final image.

-   **New aspect ratios**: Gemini Nano Banana 2.1 and Gemini 3.1 Flash Image add 1:4, 4:1, 1:8, and
  8:1 [aspect ratios](/docs/image-generation#aspect-ratios-and-image-size).


### Use up to 14 reference images  {% id="use-14-images" %}

Nano Banana models allow you to mix up to 14 reference images. These 14 images
can include the following:

| Gemini Nano Banana 2.1 & Gemini 3.1 Flash Image | Gemini 3 Pro Image |
| :--- | :--- |
| Up to 10 images of objects with high-fidelity to include in the final image | Up to 6 images of objects with high-fidelity to include in the final image |
| Up to 4 images of characters to maintain character consistency | Up to 5 images of characters to maintain character consistency |
| N/A | Up to 3 images to be used as style references |

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
      from PIL import Image
  
      prompt = "An office group photo of these people, they are making funny faces."
      aspect_ratio = "5:4" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
      resolution = "2K" # "1K", "2K", "4K"
  
      client = genai.Client()
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[
              prompt,
              Image.open('person1.png'),
              Image.open('person2.png'),
              Image.open('person3.png'),
              Image.open('person4.png'),
              Image.open('person5.png'),
          ],
          config=types.GenerateContentConfig(
              response_modalities=['TEXT', 'IMAGE'],
              image_config=types.ImageConfig(
                  aspect_ratio=aspect_ratio,
                  image_size=resolution
              ),
          )
      )
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif image:= part.as_image():
              image.save("office.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const prompt =
            'An office group photo of these people, they are making funny faces.';
        const aspectRatio = '5:4';
        const resolution = '2K';
  
        const base64ImageFile1 = fs.readFileSync("person1.png", { encoding: "base64" });
        const base64ImageFile2 = fs.readFileSync("person2.png", { encoding: "base64" });
        const base64ImageFile3 = fs.readFileSync("person3.png", { encoding: "base64" });
        const base64ImageFile4 = fs.readFileSync("person4.png", { encoding: "base64" });
        const base64ImageFile5 = fs.readFileSync("person5.png", { encoding: "base64" });
  
      const contents = [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile1,
          },
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile2,
          },
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile3,
          },
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile4,
          },
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile5,
          },
        }
      ];
  
      const response = await ai.models.generateContent({
          model: 'gemini-nano-banana-2.1',
          contents: contents,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: resolution,
            },
          },
        });
  
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("image.png", buffer);
            console.log("Image saved as image.png");
          }
        }
  
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
          "context"
          "fmt"
          "log"
          "os"
  
          "google.golang.org/genai"
      )
  
      func main() {
          ctx := context.Background()
          client, err := genai.NewClient(ctx, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          config := &genai.GenerateContentConfig{
              ResponseModalities: []string{"TEXT", "IMAGE"},
              ImageConfig: &genai.ImageConfig{
                  AspectRatio: "5:4",
                  ImageSize:   "2K",
              },
          }
  
          img1, err := os.ReadFile("person1.png")
          if err != nil { log.Fatal(err) }
          img2, err := os.ReadFile("person2.png")
          if err != nil { log.Fatal(err) }
          img3, err := os.ReadFile("person3.png")
          if err != nil { log.Fatal(err) }
          img4, err := os.ReadFile("person4.png")
          if err != nil { log.Fatal(err) }
          img5, err := os.ReadFile("person5.png")
          if err != nil { log.Fatal(err) }
  
          parts := []*genai.Part{
              genai.NewPartFromText("An office group photo of these people, they are making funny faces."),
              &genai.Part{InlineData: &genai.Blob{MIMEType: "image/png", Data: img1}},
              &genai.Part{InlineData: &genai.Blob{MIMEType: "image/png", Data: img2}},
              &genai.Part{InlineData: &genai.Blob{MIMEType: "image/png", Data: img3}},
              &genai.Part{InlineData: &genai.Blob{MIMEType: "image/png", Data: img4}},
              &genai.Part{InlineData: &genai.Blob{MIMEType: "image/png", Data: img5}},
          }
  
          contents := []*genai.Content{
              genai.NewContentFromParts(parts, genai.RoleUser),
          }
  
          resp, err := client.Models.GenerateContent(ctx, "gemini-nano-banana-2.1", contents, config)
          if err != nil {
              log.Fatal(err)
          }
  
          for _, part := range resp.Candidates[0].Content.Parts {
              if part.Text != "" {
                  fmt.Println(part.Text)
              } else if part.InlineData != nil {
                  err := os.WriteFile("office.png", part.InlineData.Data, 0644)
                  if err != nil {
                      log.Fatal(err)
                  }
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.Content;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.ImageConfig;
      import com.google.genai.types.Part;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Path;
      import java.nio.file.Paths;
  
      public class GroupPhoto {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .imageConfig(ImageConfig.builder()
                    .aspectRatio("5:4")
                    .imageSize("2K")
                    .build())
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1",
                Content.fromParts(
                    Part.fromText("An office group photo of these people, they are making funny faces."),
                    Part.fromBytes(Files.readAllBytes(Path.of("person1.png")), "image/png"),
                    Part.fromBytes(Files.readAllBytes(Path.of("person2.png")), "image/png"),
                    Part.fromBytes(Files.readAllBytes(Path.of("person3.png")), "image/png"),
                    Part.fromBytes(Files.readAllBytes(Path.of("person4.png")), "image/png"),
                    Part.fromBytes(Files.readAllBytes(Path.of("person5.png")), "image/png")
                ), config);
  
            for (Part part : response.parts()) {
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("office.png"), blob.data().get());
                }
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class GroupPhoto {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: new Content
              {
                  Parts = new List<Part>
                  {
                      new Part { Text = "An office group photo of these people, they are making funny faces." },
                      Part.FromBytes(await File.ReadAllBytesAsync("person1.png"), "image/png"),
                      Part.FromBytes(await File.ReadAllBytesAsync("person2.png"), "image/png"),
                      Part.FromBytes(await File.ReadAllBytesAsync("person3.png"), "image/png"),
                      Part.FromBytes(await File.ReadAllBytesAsync("person4.png"), "image/png"),
                      Part.FromBytes(await File.ReadAllBytesAsync("person5.png"), "image/png")
                  }
              },
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" },
                  ImageConfig = new ImageConfig
                  {
                      AspectRatio = "5:4",
                      ImageSize = "2K"
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("office.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as office.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
          -H "x-goog-api-key: $GEMINI_API_KEY" \
          -H 'Content-Type: application/json' \
          -d "{
            \"contents\": [{
              \"parts\":[
                  {\"text\": \"An office group photo of these people, they are making funny faces.\"},
                  {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_1>\"}},
                  {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_2>\"}},
                  {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_3>\"}},
                  {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_4>\"}},
                  {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_5>\"}}
              ]
            }],
            \"generationConfig\": {
              \"responseModalities\": [\"TEXT\", \"IMAGE\"],
              \"imageConfig\": {
                \"aspectRatio\": \"5:4\",
                \"imageSize\": \"2K\"
              }
            }
          }"
  ```

  {% /tab %}

{% /tabs %}

![AI-generated office group photo](https://www.gstatic.com/cloud-cms/e4b16a85c6cedde829bc7532c456fe5a.jpeg)### Grounding with Google Search  {% id="use-with-grounding" %}

Use the [Google Search tool](/docs/google-search) to generate images based on
real-time information, such as weather forecasts, stock charts, or recent
events.

Note that when using Grounding with Google Search with image generation,
image-based search results are not passed to the generation model and are
excluded from the response (see
[Grounding with Google Search for images](/docs/image-generation#image-search)).

{% callout type="note" %}
  Grounding with Google Search is not supported by the
  `gemini-3.1-flash-lite-image` model.

{% /callout %}

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
      prompt = "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day"
      aspect_ratio = "16:9" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
  
      client = genai.Client()
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=prompt,
          config=types.GenerateContentConfig(
              response_modalities=['Text', 'Image'],
              image_config=types.ImageConfig(
                  aspect_ratio=aspect_ratio,
              ),
              tools=[{"google_search": {}}]
          )
      )
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif image:= part.as_image():
              image.save("weather.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const prompt = 'Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day';
        const aspectRatio = '16:9';
        const resolution = '2K';
  
      const response = await ai.models.generateContent({
          model: 'gemini-nano-banana-2.1',
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: resolution,
            },
            tools: [{ googleSearch: {} }]
          },
        });
  
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("image.png", buffer);
            console.log("Image saved as image.png");
          }
        }
  
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.GoogleSearch;
      import com.google.genai.types.ImageConfig;
      import com.google.genai.types.Part;
      import com.google.genai.types.Tool;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Paths;
  
      public class SearchGrounding {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .imageConfig(ImageConfig.builder()
                    .aspectRatio("16:9")
                    .build())
                .tools(Tool.builder()
                    .googleSearch(GoogleSearch.builder().build())
                    .build())
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1", """
                    Visualize the current weather forecast for the next 5 days
                    in San Francisco as a clean, modern weather chart.
                    Add a visual on what I should wear each day
                    """,
                config);
  
            for (Part part : response.parts()) {
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("weather.png"), blob.data().get());
                }
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class SearchGrounding {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day",
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" },
                  ImageConfig = new ImageConfig
                  {
                      AspectRatio = "16:9"
                  },
                  Tools = new List<Tool> { new Tool { GoogleSearch = new GoogleSearch() } }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("weather.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as weather.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{"parts": [{"text": "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day"}]}],
          "tools": [{"google_search": {}}],
          "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
              "aspectRatio": "16:9"
            }
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

![AI-generated five day weather chart for San Francisco](https://www.gstatic.com/cloud-cms/3444f386f283ac68b9d97cfe37c2f588.png)The response includes `groundingMetadata` which contains the following required
fields:

-   **`searchEntryPoint`**: Contains the HTML and CSS to render the required
  search suggestions.

-   **`groundingChunks`**: Returns the top 3 web sources used to ground the
  generated image


### Grounding with Google Search for Images (Nano Banana 2.1 and 3.1 Flash)  {% id="image-search" %}

{% callout type="note" %}
  Note: This feature is only available for the Gemini Nano Banana 2.1 and Gemini 3.1 Flash Image models.

{% /callout %}

Grounding with Google Search for images allows models to use web images
retrieved via Google Search as visual context for image generation. Image Search
is a new search type within the existing Grounding with Google Search tool,
functioning alongside standard [Web Search](/docs/image-generation#use-with-grounding).

To enable Image Search, configure the `googleSearch` tool in your API request
and specify `imageSearch` within the `searchTypes` object. Image Search can be
used independently or together with Web Search.

Note that Grounding with Google Search for images can't be used to search for
people.

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
      from IPython.display import display, HTML
      prompt = "A detailed painting of a Timareta butterfly resting on a flower"
  
      client = genai.Client()
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=prompt,
          config=types.GenerateContentConfig(
              response_modalities=["IMAGE"],
              tools=[
                  types.Tool(google_search=types.GoogleSearch(
                      search_types=types.SearchTypes(
                          web_search=types.WebSearch(),
                          image_search=types.ImageSearch()
                      )
                  ))
              ]
          )
      )
  
      # Display grounding sources if available
      if response.candidates and response.candidates[0].grounding_metadata and response.candidates[0].grounding_metadata.search_entry_point:
          display(HTML(response.candidates[0].grounding_metadata.search_entry_point.rendered_content))
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const prompt = "A detailed painting of a Timareta butterfly resting on a flower";
  
        const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: prompt,
          config: {
            responseModalities: ["IMAGE"],
            tools: [
              {
                googleSearch: {
                  searchTypes: {
                    webSearch: {},
                    imageSearch: {}
                  }
                }
              }
            ]
          }
        });
  
        // Display grounding sources if available
        if (response.candidates && response.candidates[0].groundingMetadata && response.candidates[0].groundingMetadata.searchEntryPoint) {
            console.log(response.candidates[0].groundingMetadata.searchEntryPoint.renderedContent);
        }
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
        "context"
        "fmt"
        "log"
  
        "google.golang.org/genai"
      )
  
      func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
          log.Fatal(err)
        }
  
        config := &genai.GenerateContentConfig{
          ResponseModalities: []string{"IMAGE"},
          Tools: []*genai.Tool{
            {
              GoogleSearch: &genai.GoogleSearch{
                SearchTypes: &genai.SearchTypes{
                  WebSearch:   &genai.WebSearch{},
                  ImageSearch: &genai.ImageSearch{},
                },
              },
            },
          },
        }
  
        prompt := "A detailed painting of a Timareta butterfly resting on a flower"
        resp, err := client.Models.GenerateContent(ctx, "gemini-nano-banana-2.1", genai.Text(prompt), config)
        if err != nil {
          log.Fatal(err)
        }
  
        if resp.Candidates[0].GroundingMetadata != nil && resp.Candidates[0].GroundingMetadata.SearchEntryPoint != nil {
          fmt.Println(resp.Candidates[0].GroundingMetadata.SearchEntryPoint.RenderedContent)
        }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.GoogleSearch;
      import com.google.genai.types.ImageSearch;
      import com.google.genai.types.SearchTypes;
      import com.google.genai.types.Tool;
      import com.google.genai.types.WebSearch;
  
      import java.io.IOException;
  
      public class ImageSearchGrounding {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("IMAGE")
                .tools(Tool.builder()
                    .googleSearch(GoogleSearch.builder()
                        .searchTypes(SearchTypes.builder()
                            .webSearch(WebSearch.builder().build())
                            .imageSearch(ImageSearch.builder().build())
                            .build())
                        .build())
                    .build())
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1",
                "A detailed painting of a Timareta butterfly resting on a flower",
                config);
  
            if (response.candidates().isPresent() && !response.candidates().get().isEmpty()) {
              var candidate = response.candidates().get().get(0);
              if (candidate.groundingMetadata().isPresent() && candidate.groundingMetadata().get().searchEntryPoint().isPresent()) {
                System.out.println(candidate.groundingMetadata().get().searchEntryPoint().get().renderedContent().orElse(""));
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.Threading.Tasks;
  
      public class ImageSearchGrounding {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "A detailed painting of a Timareta butterfly resting on a flower",
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "IMAGE" },
                  Tools = new List<Tool>
                  {
                      new Tool
                      {
                          GoogleSearch = new GoogleSearch
                          {
                              SearchTypes = new SearchTypes
                              {
                                  WebSearch = new WebSearch(),
                                  ImageSearch = new ImageSearch()
                              }
                          }
                      }
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              if (candidate.GroundingMetadata != null && candidate.GroundingMetadata.SearchEntryPoint != null) {
                  Console.WriteLine(candidate.GroundingMetadata.SearchEntryPoint.RenderedContent);
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```shell
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{"parts": [{"text": "A detailed painting of a Timareta butterfly resting on a flower"}]}],
          "tools": [{"google_search": {"searchTypes": {"webSearch": {}, "imageSearch": {}}}}],
          "generationConfig": {
            "responseModalities": ["IMAGE"]
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

**Display requirements**

When you use Image Search within Grounding with Google Search, you must comply
with the following conditions:

*   **Source attribution**: You must provide a link to the webpage containing
  the source image (the "containing page," not the image file itself) in a
  manner that the user will recognize as a link.

*   **Direct navigation**: If you also choose to display the source images, you
  must provide a direct, single-click path from the source images to its
  containing source webpage. Any other implementation that delays or abstracts
  the end user's access to the source webpage, including but not limited to
  any multi-click path or the use of an intermediate image viewer, is not
  permitted.


**Response**

For grounded responses using image search, the API provides clear attribution
and metadata to link its output to verified sources. Key fields in the
`groundingMetadata` object include:

*   **`imageSearchQueries`**: The specific queries used by the model for visual
  context (image search).

*   **`groundingChunks`**: Contains source information for retrieved results.
  For image sources, these will be returned as redirect URLs using a new image
  chunk type. This chunk includes:

  *   **`uri`**: The web page URL for attribution (the landing page).
  *   **`image_uri`**: The direct image URL.

*   **`groundingSupports`**: Provides specific mappings that link the generated
  content to its relevant citation source in the chunks.

*   **`searchEntryPoint`**: Includes the "Google Search" chip containing
  compliant HTML and CSS to render Search Suggestions.


### Video-to-image generation (Nano Banana 2.1, 3.1 Flash, and 3.1 Flash Lite)  {% id="video-to-image" %}

{% callout type="note" %}
  Note: This feature is only available for the Gemini Nano Banana 2.1, Gemini 3.1 Flash Image, and
  Gemini 3.1 Flash Lite Image models.

{% /callout %}

Video-to-image generation allows you to generate new images using a video's
context as a multimodal reference. This is useful for creating high-quality
video thumbnails, cinematic posters, summary infographics, or new artwork
inspired by a video scene.

During generation, the model analyzes the video frames in context (up to the
model's input token limit of 131,072 tokens) to extract visual themes and key
events, then uses them alongside your text
prompt to synthesize the output image.

You can pass public
[YouTube URLs](/docs/video-understanding#youtube) directly
in your API request or upload local video files using the
[Files API](/docs/files).

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
  
      client = genai.Client()
  
      # Pass a public YouTube video URL as part of the contents
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[
              types.Part(
                file_data=types.FileData(file_uri="https://www.youtube.com/watch?v=UTdfxFyOQTI"),
                video_metadata=types.VideoMetadata(fps=0.5)
              ),
              "Generate a poster image that captures the key themes of this video."
          ],
          config=types.GenerateContentConfig(
              response_modalities=["TEXT", "IMAGE"]
          )
      )
  
      # Save the generated image part
      for part in response.parts:
          if part.inline_data is not None:
              image = part.as_image()
              image.save("video_poster.png")
              print("Image saved as video_poster.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
        const ai = new GoogleGenAI({});
  
        const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: [
            {
              fileData: {
                fileUri: "https://www.youtube.com/watch?v=UTdfxFyOQTI",
              },
              videoMetadata: {
                fps: 0.5
              }
            },
            { text: "Generate a poster image that captures the key themes of this video." }
          ],
          config: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        });
  
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("video_poster.png", buffer);
            console.log("Image saved as video_poster.png");
          }
        }
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
          "context"
          "log"
          "os"
          "google.golang.org/genai"
      )
  
      func main() {
          ctx := context.Background()
          client, err := genai.NewClient(ctx, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          videoPart := genai.NewPartFromURI("https://www.youtube.com/watch?v=UTdfxFyOQTI", "video/mp4")
          videoPart.VideoMetadata = &genai.VideoMetadata{FPS: genai.Ptr(0.5)}
  
          parts := []*genai.Part{
              videoPart,
              genai.NewPartFromText("Generate a poster image that captures the key themes of this video."),
          }
  
          contents := []*genai.Content{
              genai.NewContentFromParts(parts, genai.RoleUser),
          }
  
          result, err := client.Models.GenerateContent(
              ctx,
              "gemini-nano-banana-2.1",
              contents,
              &genai.GenerateContentConfig{
                  ResponseModalities: []string{"TEXT", "IMAGE"},
              },
          )
          if err != nil {
              log.Fatal(err)
          }
  
          for _, part := range result.Candidates[0].Content.Parts {
              if part.InlineData != nil {
                  imageBytes := part.InlineData.Data
                  _ = os.WriteFile("video_poster.png", imageBytes, 0644)
                  log.Println("Image saved as video_poster.png")
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.Content;
      import com.google.genai.types.FileData;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.Part;
      import com.google.genai.types.VideoMetadata;
      import com.google.common.collect.ImmutableList;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Paths;
  
      public class VideoToImage {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            Part videoPart = Part.builder()
                .fileData(FileData.builder()
                    .fileUri("https://www.youtube.com/watch?v=UTdfxFyOQTI")
                    .build())
                .videoMetadata(VideoMetadata.builder()
                    .fps(0.5)
                    .build())
                .build();
  
            Part textPart = Part.builder()
                .text("Generate a poster image that captures the key themes of this video.")
                .build();
  
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1",
                Content.builder()
                    .role("user")
                    .parts(ImmutableList.of(videoPart, textPart))
                    .build(),
                config);
  
            for (Part part : response.parts()) {
              if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("video_poster.png"), blob.data().get());
                  System.out.println("Image saved as video_poster.png");
                }
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class VideoToImage {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: new Content
              {
                  Parts = new List<Part>
                  {
                      new Part
                      {
                          FileData = new FileData { FileUri = "https://www.youtube.com/watch?v=UTdfxFyOQTI" },
                          VideoMetadata = new VideoMetadata { Fps = 0.5 }
                      },
                      new Part { Text = "Generate a poster image that captures the key themes of this video." }
                  }
              },
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.InlineData != null) {
                      await File.WriteAllBytesAsync("video_poster.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as video_poster.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{
            "parts": [
              {
                "file_data": {
                  "file_uri": "https://www.youtube.com/watch?v=UTdfxFyOQTI"
                },
                "video_metadata": {
                  "fps": 0.5
                }
              },
              {"text": "Generate a poster image that captures the key themes of this video."}
            ]
          }],
          "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

![AI-generated infographic from a youtube video](https://www.gstatic.com/cloud-cms/f0d79a97f2742cf79b96cc961e8625bb.jpg)### Generate images up to 4K resolution  {% id="generate-4k-images" %}

Gemini 3 image models generate 1K images by default but can also output 2K,
4K, and 512 (0.5K) (Gemini 3.1 Flash Image only) images. To generate higher
resolution assets, specify the `image_size` in the `generation_config`.

You must use an uppercase 'K' (e.g. 1K, 2K, 4K). The `512` value does not use a
'K' suffix. Lowercase parameters (e.g., 1k) will be rejected.

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
  
      prompt = "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
      aspect_ratio = "1:1" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
      resolution = "1K" # "1K", "2K", "4K"
  
      client = genai.Client()
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=prompt,
          config=types.GenerateContentConfig(
              response_modalities=['TEXT', 'IMAGE'],
              image_config=types.ImageConfig(
                  aspect_ratio=aspect_ratio,
                  image_size=resolution
              ),
          )
      )
  
      for part in response.parts:
          if part.text is not None:
              print(part.text)
          elif image:= part.as_image():
              image.save("butterfly.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const prompt =
            'Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English.';
        const aspectRatio = '1:1';
        const resolution = '1K';
  
        const response = await ai.models.generateContent({
          model: 'gemini-nano-banana-2.1',
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: resolution,
            },
          },
        });
  
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("butterfly.png", buffer);
            console.log("Image saved as butterfly.png");
          }
        }
  
      }
  
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
          "context"
          "fmt"
          "log"
          "os"
  
          "google.golang.org/genai"
      )
  
      func main() {
          ctx := context.Background()
          client, err := genai.NewClient(ctx, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          config := &genai.GenerateContentConfig{
              ResponseModalities: []string{"TEXT", "IMAGE"},
              ImageConfig: &genai.ImageConfig{
                  AspectRatio: "1:1",
                  ImageSize:   "1K",
              },
          }
  
          prompt := "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
          resp, err := client.Models.GenerateContent(
              ctx,
              "gemini-nano-banana-2.1",
              genai.Text(prompt),
              config,
          )
          if err != nil {
              log.Fatal(err)
          }
  
          for _, part := range resp.Candidates[0].Content.Parts {
              if part.Text != "" {
                  fmt.Println(part.Text)
              } else if part.InlineData != nil {
                  err := os.WriteFile("butterfly.png", part.InlineData.Data, 0644)
                  if err != nil {
                      log.Fatal(err)
                  }
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.ImageConfig;
      import com.google.genai.types.Part;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Paths;
  
      public class HiRes {
          public static void main(String[] args) throws IOException {
  
            try (Client client = new Client()) {
              GenerateContentConfig config = GenerateContentConfig.builder()
                  .responseModalities("TEXT", "IMAGE")
                  .imageConfig(ImageConfig.builder()
                      .aspectRatio("1:1")
                      .imageSize("1K")
                      .build())
                  .build();
  
              GenerateContentResponse response = client.models.generateContent(
                  "gemini-nano-banana-2.1", """
                    Da Vinci style anatomical sketch of a dissected Monarch butterfly.
                    Detailed drawings of the head, wings, and legs on textured
                    parchment with notes in English.
                    """,
                  config);
  
              for (Part part : response.parts()) {
                if (part.text().isPresent()) {
                  System.out.println(part.text().get());
                } else if (part.inlineData().isPresent()) {
                  var blob = part.inlineData().get();
                  if (blob.data().isPresent()) {
                    Files.write(Paths.get("butterfly.png"), blob.data().get());
                  }
                }
              }
            }
          }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class HiRes {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English.",
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "TEXT", "IMAGE" },
                  ImageConfig = new ImageConfig
                  {
                      AspectRatio = "1:1",
                      ImageSize = "1K"
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData?.Data != null) {
                      await File.WriteAllBytesAsync("butterfly.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as butterfly.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{"parts": [{"text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."}]}],
          "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
              "aspectRatio": "1:1",
              "imageSize": "1K"
            }
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

The following is an example image generated from this prompt:

![AI-generated Da Vinci style anatomical sketch of a dissected Monarch
butterfly.](https://www.gstatic.com/cloud-cms/c111455910e372aa2c46d7cb7b0c5d85.png)### Thinking process  {% id="thinking-process" %}

Gemini 3 image models are thinking models that use a reasoning
process ("Thinking") for complex prompts. This feature is enabled by default and
cannot be disabled in the API. To learn more about the thinking process, see
the [Gemini Thinking](/docs/thinking) guide.

The model generates up to two interim images to test composition and logic. The
last image within Thinking is also the final rendered image.

You can check the thoughts that lead to the final image being produced.

{% tabs %}
  {% tab label="Python" %}
  ```python
      for part in response.parts:
          if part.thought:
              if part.text:
                  print(part.text)
              elif image:= part.as_image():
                  image.show()
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      for (const part of response.candidates[0].content.parts) {
        if (part.thought) {
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, 'base64');
            fs.writeFileSync('image.png', buffer);
            console.log('Image saved as image.png');
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      for (Part part : response.parts()) {
        if (part.thought().orElse(false)) {
          if (part.text().isPresent()) {
            System.out.println(part.text().get());
          } else if (part.inlineData().isPresent()) {
            var blob = part.inlineData().get();
            if (blob.data().isPresent()) {
              Files.write(Paths.get("image.png"), blob.data().get());
              System.out.println("Image saved as image.png");
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      foreach (var candidate in response.Candidates) {
          foreach (var part in candidate.Content.Parts) {
              if (part.Thought == true) {
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData?.Data != null) {
                      await File.WriteAllBytesAsync("image.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as image.png");
                  }
              }
          }
      }
  ```

  {% /tab %}

{% /tabs %}

#### Controlling thinking levels  {% id="thinking-levels" %}

With Gemini Nano Banana 2.1, Gemini 3.1 Flash Image, and Gemini 3.1 Flash Lite
Image, you can control the amount of thinking the model uses to balance quality
and latency:

| Model | Supported thinking levels | Default |
| :--- | :--- | :--- |
| **Gemini Nano Banana 2.1** | `minimal`, `medium`, `high` | `medium` |
| **Gemini 3.1 Flash Image** | `minimal`, `high` | `minimal` |
| **Gemini 3.1 Flash Lite Image** | `minimal`, `high` | `minimal` |

Setting the `thinkingLevel` to `minimal` provides the lowest latency responses.
Note that minimal thinking does not mean the model uses no thinking at all.

You can add the `includeThoughts` boolean to determine whether the model's
generated thoughts are returned in the response, or remain hidden.

{% tabs %}
  {% tab label="Python" %}
  ```python
      from google import genai
      from google.genai import types
  
      client = genai.Client()
  
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents="A futuristic city built inside a giant glass bottle floating in space",
          config=types.GenerateContentConfig(
              response_modalities=["IMAGE"],
              thinking_config=types.ThinkingConfig(
                  thinking_level="High",
                  include_thoughts=True
              ),
          )
      )
  
      for part in response.parts:
          if part.thought: # Skip outputting thoughts
              continue
          if part.text:
              print(part.text)
          elif image := part.as_image():
              image.save("image.png")
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      import { GoogleGenAI } from "@google/genai";
      import * as fs from "node:fs";
  
      async function main() {
  
        const ai = new GoogleGenAI({});
  
        const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: "A futuristic city built inside a giant glass bottle floating in space",
          config: {
            responseModalities: ["IMAGE"],
            thinkingConfig: {
              thinkingLevel: "High",
              includeThoughts: true
            },
          },
        });
  
        for (const part of response.candidates[0].content.parts) {
          if (part.thought) { // Skip outputting thoughts
            continue;
          }
          if (part.text) {
            console.log(part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync("image.png", buffer);
            console.log("Image saved as image.png");
          }
        }
      }
      main();
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      package main
  
      import (
          "context"
          "fmt"
          "log"
          "os"
  
          "google.golang.org/genai"
      )
  
      func main() {
          ctx := context.Background()
          client, err := genai.NewClient(ctx, nil)
          if err != nil {
              log.Fatal(err)
          }
  
          config := &genai.GenerateContentConfig{
              ResponseModalities: []string{"IMAGE"},
              ThinkingConfig: &genai.ThinkingConfig{
                  ThinkingLevel:   genai.ThinkingLevelHigh,
                  IncludeThoughts: true,
              },
          }
  
          prompt := "A futuristic city built inside a giant glass bottle floating in space"
          resp, err := client.Models.GenerateContent(
              ctx,
              "gemini-nano-banana-2.1",
              genai.Text(prompt),
              config,
          )
          if err != nil {
              log.Fatal(err)
          }
  
          for _, part := range resp.Candidates[0].Content.Parts {
              if part.Thought { // Skip outputting thoughts
                  continue
              }
              if part.Text != "" {
                  fmt.Println(part.Text)
              } else if part.InlineData != nil {
                  err := os.WriteFile("image.png", part.InlineData.Data, 0644)
                  if err != nil {
                      log.Fatal(err)
                  }
              }
          }
      }
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      import com.google.genai.Client;
      import com.google.genai.types.GenerateContentConfig;
      import com.google.genai.types.GenerateContentResponse;
      import com.google.genai.types.Part;
      import com.google.genai.types.ThinkingConfig;
  
      import java.io.IOException;
      import java.nio.file.Files;
      import java.nio.file.Paths;
  
      public class ThinkingLevels {
        public static void main(String[] args) throws IOException {
  
          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("IMAGE")
                .thinkingConfig(ThinkingConfig.builder()
                    .thinkingLevel("High")
                    .includeThoughts(true)
                    .build())
                .build();
  
            GenerateContentResponse response = client.models.generateContent(
                "gemini-nano-banana-2.1",
                "A futuristic city built inside a giant glass bottle floating in space",
                config);
  
            for (Part part : response.parts()) {
              if (part.thought().orElse(false)) {
                // Skip outputting thoughts
                continue;
              }
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("image.png"), blob.data().get());
                  System.out.println("Image saved as image.png");
                }
              }
            }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      using Google.GenAI;
      using Google.GenAI.Types;
      using System;
      using System.Collections.Generic;
      using System.IO;
      using System.Threading.Tasks;
  
      public class ThinkingLevels {
        public static async Task Main(string[] args) {
          var client = new Client();
  
          var response = await client.Models.GenerateContentAsync(
              model: "gemini-nano-banana-2.1",
              contents: "A futuristic city built inside a giant glass bottle floating in space",
              config: new GenerateContentConfig
              {
                  ResponseModalities = new List<string> { "IMAGE" },
                  ThinkingConfig = new ThinkingConfig
                  {
                      ThinkingLevel = ThinkingLevel.High,
                      IncludeThoughts = true
                  }
              }
          );
  
          foreach (var candidate in response.Candidates) {
              foreach (var part in candidate.Content.Parts) {
                  if (part.Thought == true) {
                      // Skip outputting thoughts
                      continue;
                  }
                  if (part.Text != null) {
                      Console.WriteLine(part.Text);
                  } else if (part.InlineData?.Data != null) {
                      await File.WriteAllBytesAsync("image.png", part.InlineData.Data);
                      Console.WriteLine("Image saved as image.png");
                  }
              }
          }
        }
      }
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{"parts": [{"text": "A futuristic city built inside a giant glass bottle floating in space"}]}],
          "generationConfig": {
            "responseModalities": ["IMAGE"],
            "thinkingConfig": {
              "thinkingLevel": "HIGH",
              "includeThoughts": true
            }
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

Note that thinking tokens are billed regardless of whether `includeThoughts` is
set to `true` or `false`, as the [thinking process](/docs/image-generation#thinking-process) always
happens by default whether you view the process or not.

#### Thought Signatures  {% id="thought-signatures" %}

Thought signatures are encrypted representations of the
model's internal thought process and are used to preserve reasoning context
across multi-turn interactions. All responses include a `thought_signature`
field. As a general rule, if you receive a thought signature in a model
response, you should pass it back exactly as received when sending the
conversation history in the next turn. Failure to circulate thought signatures
may cause the response to fail. Check the [thought signature](/docs/thinking#signatures)
documentation for more explanations of signatures overall.

{% callout type="note" %}
  Note: If you use the official [Google Gen AI SDKs](/docs/libraries)
  and use the chat feature (or append the full model response object directly to
  history), **thought signatures are handled automatically**. You do not need to
  manually extract or manage them, or change your code.

{% /callout %}

Here is how thought signatures work:

-   All `inline_data` parts with image `mime_type` which are part of the response
  should have signature.

-   If there are some text parts at the beginning (before any image) right after
  the thoughts, the first text part should also have a signature.

-   If `inline_data` parts with image `mime_type` are part of thoughts, they won't
  have signatures.


The following code shows an example of where thought signatures are included:

```json
[
  {
    "inlineData": {
      "data": "<base64_image_data_0>",
      "mimeType": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "inlineData": {
      "data": "<base64_image_data_1>",
      "mimeType": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "inlineData": {
      "data": "<base64_image_data_2>",
      "mimeType": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "text": "Here is a step-by-step guide to baking macarons, presented in three separate images.\n\n### Step 1: Piping the Batter\n\nThe first step after making your macaron batter is to pipe it onto a baking sheet. This requires a steady hand to create uniform circles.\n\n",
    "thoughtSignature": "<Signature_A>" // The first non-thought part always has a signature
  },
  {
    "inlineData": {
      "data": "<base64_image_data_3>",
      "mimeType": "image/png"
    },
    "thoughtSignature": "<Signature_B>" // All image parts have a signature
  },
  {
    "text": "\n\n### Step 2: Baking and Developing Feet\n\nOnce piped, the macarons are baked in the oven. A key sign of a successful bake is the development of \"feet\" - the ruffled edge at the base of each macaron shell.\n\n"
    // Follow-up text parts don't have signatures
  },
  {
    "inlineData": {
      "data": "<base64_image_data_4>",
      "mimeType": "image/png"
    },
    "thoughtSignature": "<Signature_C>" // All image parts have a signature
  },
  {
    "text": "\n\n### Step 3: Assembling the Macaron\n\nThe final step is to pair the cooled macaron shells by size and sandwich them together with your desired filling, creating the classic macaron dessert.\n\n"
  },
  {
    "inlineData": {
      "data": "<base64_image_data_5>",
      "mimeType": "image/png"
    },
    "thoughtSignature": "<Signature_D>" // All image parts have a signature
  }
]
```

## Other image generation modes  {% id="other-modes" %}

Gemini supports other image interaction modes based on prompt structure and
context, including:

* **Text to image(s) and text (interleaved):** Outputs images with related text.  *   Example prompt: "Generate an illustrated recipe for a paella."

* **Image(s) and text to image(s) and text (interleaved)**: Uses input images
  and text to create new related images and text.  *   Example prompt: (With an image of a furnished room) "What other color
    sofas would work in my space? can you update the image?"


## Generate images in batch  {% id="batch-api" %}

If you need to generate a lot of images, you can use the
[Batch API](/docs/batch-api). You get higher
[rate limits](/docs/rate-limits) in exchange for a turnaround of up
to 24 hours.

Check the
[Batch API image generation documentation](/docs/batch-api#image-generation) and
the [cookbook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Batch_mode.ipynb)
for Batch API image examples and code.

## Prompting guide and strategies  {% id="prompt-guide" %}

Mastering image generation starts with one fundamental principle:

**Describe the scene, don't just list keywords.**
The model's core strength is its deep language understanding. A narrative,
descriptive paragraph will almost always produce a better, more coherent image
than a list of disconnected words.

### Prompts for generating images  {% id="image-generation-prompts" %}

The following strategies will help you create effective prompts to
generate exactly the images you're looking for.

#### Photography  {% id="1_photorealistic_scenes" %}

For realistic images, use photography terms. Mention camera angles, lens types,
lighting, and fine details to guide the model toward a realistic result.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * A photo of a close-up portrait of an elderly Japanese ceramicist with deep,
    sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a
    freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop. The
    scene is illuminated by soft, golden hour light streaming through a window,
    highlighting the fine texture of the clay. Captured with an 85mm portrait
    lens, resulting in a soft, blurred background (bokeh). The overall mood is
    serene and masterful. Vertical portrait orientation.
  * ![](https://www.gstatic.com/cloud-cms/0a5f6ccdb6893347dea597b9de6dc51e.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Stylized illustrations and stickers  {% id="2_stylized_illustrations_stickers" %}

To create stickers, icons, or assets, be explicit about the style and request a
white background.

{% callout type="note" %}
  Note: The model does not support generating a transparent background.

{% /callout %}

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's
    munching on a green bamboo leaf. The design features bold, clean outlines,
    simple cel-shading, and a vibrant color palette. The background must be white.
  * ![](https://www.gstatic.com/cloud-cms/239971d11d553532aaf0f70ca49f30ef.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Accurate text in images  {% id="3_accurate_text_in_images" %}

Gemini excels at rendering text. Be clear about the text, the font style
(descriptively), and the overall design. Use Gemini 3 Pro Image for
professional asset production.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'.
    The text should be in a clean, bold, sans-serif font. The color scheme is
    black and white. Put the logo in a circle. Use a coffee bean in a clever way.
  * ![](https://www.gstatic.com/cloud-cms/f501e05c7e3dbb96395eb156fa3faeb4.jpg) {% class="screenshot" width="50%" %}
{% /table %}

#### Product mockups and commercial photography  {% id="4_product_mockups_commercial_photography" %}

Perfect for creating clean, professional product shots for ecommerce,
advertising, or branding.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * A high-resolution, studio-lit product photograph of a minimalist ceramic
    coffee mug in matte black, presented on a polished concrete surface. The
    lighting is a three-point softbox setup designed to create soft, diffused
    highlights and eliminate harsh shadows. The camera angle is a slightly
    elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with
    sharp focus on the steam rising from the coffee. Square image.
  * ![](https://www.gstatic.com/cloud-cms/4c77e8a2b3655d5d94b134b073b976c2.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Minimalist and negative space design  {% id="minimalist-and-negative-space-design" %}

Excellent for creating backgrounds for websites, presentations, or marketing
materials where text will be overlaid.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * A minimalist composition featuring a single, delicate red maple leaf
    positioned in the bottom-right of the frame. The background is a vast, empty
    off-white canvas, creating significant negative space for text. Soft, diffused
    lighting from the top left. Square image.
  * ![](https://www.gstatic.com/cloud-cms/eabdf57912bb9e3412cb7ae92f1e7ce6.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Sequential art (Comic panel / Storyboard)  {% id="sequential-art-comic-panel-storyboard" %}

Builds on character consistency and scene description to create panels for
visual storytelling. For accuracy with text and storytelling ability, these
prompts work best with Gemini 3.1 Pro and Gemini 3.1 Flash Image.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/75f6d00e713587601b3fde0d1ce3f39f.jpg)
    Input image
    **Prompt:** Make a 3 panel comic in a gritty, noir art style with
    high-contrast black and white inks. Put the character in a humurous scene.
  * ![](https://www.gstatic.com/cloud-cms/aa62e80cd0c43fa1a4f086d3e4c720fb.jpg) {% class="screenshot" width="50%" %}
{% /table %}

#### Grounding with Google Search  {% id="grounding-with-search" %}

Use Google Search to generate images based on recent or real-time information.
This is useful for news, weather, and other time-sensitive topics.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * Make a simple but stylish graphic of last night's Arsenal game in the Champion's League
  * ![](https://www.gstatic.com/cloud-cms/ab8ab85b1d93b1802adeb3ea7c3b8bea.jpg) {% class="screenshot" width="50%" %}
{% /table %}

### Prompts for editing images  {% id="image-editing-prompts" %}

These examples show how to provide images alongside your text prompts for
editing, composition, and style transfer.

#### Adding and removing elements  {% id="adding-and-removing-elements" %}

Provide an image and describe your change. The model will match the original
image's style, lighting, and perspective.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/4a26c9e6a813d316fcc515db9c6721e8.png)
    Input image
    **Prompt:** Using the provided image of my cat, please add a small, knitted
    wizard hat on its head. Make it look like it's sitting comfortably and
    matches the soft lighting of the photo.
  * ![](https://www.gstatic.com/cloud-cms/aaf4ca309bb3731c7a607e89dddd8a7a.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Inpainting (Semantic masking)  {% id="inpainting-semantic-masking" %}

Conversationally define a "mask" to edit a specific part of an image while
leaving the rest untouched.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/c4bc515821aabf9438b4140dd581ee04.png)
    Input image
    **Prompt:** Using the provided image of a living room, change only the blue
    sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the
    room, including the pillows on the sofa and the lighting, unchanged.
  * ![](https://www.gstatic.com/cloud-cms/50e14b41157a17030d665ec71fbe17e0.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Style transfer  {% id="3_style_transfer" %}

Provide an image and ask the model to recreate its content in a different
artistic style.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/c6c7a301a3e30f428a159cd359f37827.png)
    Input image
    **Prompt:** Transform the provided photograph of a modern city street at
    night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve
    the original composition of buildings and cars, but render all elements with
    swirling, impasto brushstrokes and a dramatic palette of deep blues and
    bright yellows.
  * ![](https://www.gstatic.com/cloud-cms/e749119638b1abc50d2620ed76a60706.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Advanced composition: Combining multiple images  {% id="advanced-composition-combining-multiple-images" %}

Provide multiple images as context to create a new, composite scene. This is
perfect for product mockups or creative collages.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input images:**
    ![](https://www.gstatic.com/cloud-cms/ef38320013ceae07bd42686c364a16a3.png)
    Input 1: Dress
    ![](https://www.gstatic.com/cloud-cms/39a9891907e0a1b80ecb168c32bda34d.png)
    Input 2: Model
    **Prompt:** Create a professional e-commerce fashion photo. Take the blue
    floral dress from the first image and let the woman from the second image
    wear it. Generate a realistic, full-body shot of the woman wearing the
    dress, with the lighting and shadows adjusted to match the outdoor
    environment.
  * ![](https://www.gstatic.com/cloud-cms/e6ea1787bd4158e76d6490d18301d7fd.png) {% class="screenshot" width="50%" %}
{% /table %}

#### High-fidelity detail preservation  {% id="5_high-fidelity_detail_preservation" %}

To ensure critical details (like a face or logo) are preserved during an edit,
describe them in great detail along with your edit request.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input images:**
    ![](https://www.gstatic.com/cloud-cms/f1f3d04375e487bc630f1af0e2b081fb.png)
    Input 1: Woman
    ![](https://www.gstatic.com/cloud-cms/5c6702cf25e4707c890457d7b315f0b2.png)
    Input 2: Logo
    **Prompt:** Take the first image of the woman with brown hair, blue eyes,
    and a neutral expression. Add the logo from the second image onto her black
    t-shirt. Ensure the woman's face and features remain completely unchanged.
    The logo should look like it's naturally printed on the fabric, following
    the folds of the shirt.
  * ![](https://www.gstatic.com/cloud-cms/2b6b85696ca48b750cffa82a29cf56b3.png) {% class="screenshot" width="50%" %}
{% /table %}

#### Bring something to life  {% id="bring-something-to-life" %}

Upload a rough sketch or drawing and ask the model to refine it into a finished
image.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/937f4ad9bbc91213c1b069acf78da4eb.jpg)
    Rough sketch of a car
    **Prompt:** Turn this rough pencil sketch of a futuristic car into a
    polished photo of the finished concept car in a showroom. Keep the sleek
    lines and low profile from the sketch but add metallic blue paint and neon
    rim lighting.
  * ![](https://www.gstatic.com/cloud-cms/93d2f7208f11510ad185f0572c7ca616.jpg) {% class="screenshot" width="50%" %}
{% /table %}

#### Character consistency: 360 view  {% id="character-consistency-360-view" %}

You can generate 360-degree views of a character by iteratively prompting for
different angles. For best results, include previously generated images in
subsequent prompts to maintain consistency. For complex poses, include a
reference image of the desired pose.

{% table %}
  * **Prompt**
  * **Generated output**

  ---

  * **Input image:**
    ![](https://www.gstatic.com/cloud-cms/75f6d00e713587601b3fde0d1ce3f39f.jpg)
    Original image
    **Prompt:** A studio portrait of this man against white, in profile looking
    right
  * ![](https://www.gstatic.com/cloud-cms/2143d148c8ca3169e2d42869ab4af6a6.jpg)
    Man in white glasses looking right
    ![](https://www.gstatic.com/cloud-cms/91dd9874fa2cd0fe714418c9a4ba9f5c.jpg)
    Man in white glasses looking forward
{% /table %}

### Best Practices  {% id="best-practices" %}

To elevate your results from good to great, incorporate these professional
strategies into your workflow.

*   **Be Hyper-Specific:** The more detail you provide, the more control you
  have. Instead of "fantasy armor," describe it: "ornate elven plate armor,
  etched with silver leaf patterns, with a high collar and pauldrons shaped like
  falcon wings."

*   **Provide Context and Intent:** Explain the *purpose* of the image. The
  model's understanding of context will influence the final output. For example,
  "Create a logo for a high-end, minimalist skincare brand" will yield better
  results than just "Create a logo."

*   **Iterate and Refine:** Don't expect a perfect image on the first try. Use
  the conversational nature of the model to make small changes. Follow up with
  prompts like, "That's great, but can you make the lighting a bit warmer?" or
  "Keep everything the same, but change the character's expression to be more
  serious."

*   **Use Step-by-Step Instructions:** For complex scenes with many elements,
  break your prompt into steps. "First, create a background of a serene, misty
  forest at dawn. Then, in the foreground, add a moss-covered ancient stone
  altar. Finally, place a single, glowing sword on top of the altar."

*   **Use "Semantic Negative Prompts":** Instead of saying "no cars," describe
  the desired scene positively: "an empty, deserted street with no signs of
  traffic."

*   **Control the Camera:** Use photographic and cinematic language to control
  the composition. Terms like `wide-angle shot`, `macro shot`, `low-angle
perspective`.


## Limitations  {% id="limitations" %}

*   For best performance, use the following languages: EN, ar-EG, de-DE, es-MX,
  fr-FR, hi-IN, id-ID, it-IT, ja-JP, ko-KR, pt-BR, ru-RU, ua-UA, vi-VN, zh-CN.

*   Image generation does not support audio inputs. Video inputs are only
  supported for Gemini Nano Banana 2.1, Gemini 3.1 Flash Image, and Gemini 3.1 Flash Lite Image.

*   The model won't always follow the exact number of image outputs that the
  user explicitly asks for.

*   `gemini-2.5-flash-image` works best with up to 3 images as input, while
  `gemini-3-pro-image` supports 5 images with high fidelity, and up to
  14 images in total. `gemini-nano-banana-2.1` and `gemini-3.1-flash-image` support character
  resemblance of up to 4 characters and the fidelity of up to 10 objects in a
  single workflow.

*   When generating text for an image, Gemini works best if you first generate
  the text and then ask for an image with the text.

*   `gemini-nano-banana-2.1` and `gemini-3.1-flash-image` Grounding with Google Search do not support using
  real-world images of people from web search at this time.

*   All generated images include a
  [SynthID watermark](https://ai.google.dev/responsible/docs/safeguards/synthid).


## Optional configurations  {% id="optional-configurations" %}

You can optionally configure the response modalities and aspect ratio of the
model's output in the `config` field of `generate_content` calls.

### Output types  {% id="output-types" %}

The model defaults to returning text and image responses
(i.e. `response_modalities=['Text', 'Image']`).
You can configure the response to return only images without text using
`response_modalities=['Image']`.

{% tabs %}
  {% tab label="Python" %}
  ```python
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[prompt],
          config=types.GenerateContentConfig(
              response_modalities=['Image']
          )
      )
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      const response = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: prompt,
          config: {
              responseModalities: ['Image']
          }
        });
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-nano-banana-2.1",
          genai.Text("Create a picture of a nano banana dish in a " +
                      " fancy restaurant with a Gemini theme"),
          &genai.GenerateContentConfig{
              ResponseModalities: []string{"IMAGE"},
          },
        )
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      response = client.models.generateContent(
          "gemini-nano-banana-2.1",
          prompt,
          GenerateContentConfig.builder()
              .responseModalities("IMAGE")
              .build());
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      var response = await client.Models.GenerateContentAsync(
          model: "gemini-nano-banana-2.1",
          contents: prompt,
          config: new GenerateContentConfig
          {
              ResponseModalities = new List<string> { "IMAGE" }
          }
      );
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "contents": [{
            "parts": [
              {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
            ]
          }],
          "generationConfig": {
            "responseModalities": ["Image"]
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

### Aspect ratios and image size  {% id="aspect-ratios-and-image-size" %}

The model defaults to matching the output image size to that of your input
image, or otherwise generates 1:1 squares. You can control the aspect ratio of
the output image using the `aspect_ratio` field under `image_config` in the
response request, shown here:

{% tabs %}
  {% tab label="Python" %}
  ```python
      # For gemini-2.5-flash-image
      response = client.models.generate_content(
          model="gemini-2.5-flash-image",
          contents=[prompt],
          config=types.GenerateContentConfig(
              image_config=types.ImageConfig(
                  aspect_ratio="16:9",
              )
          )
      )
  
      # For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      response = client.models.generate_content(
          model="gemini-nano-banana-2.1",
          contents=[prompt],
          config=types.GenerateContentConfig(
              image_config=types.ImageConfig(
                  aspect_ratio="16:9",
                  image_size="2K",
              )
          )
      )
  ```

  {% /tab %}

  {% tab label="JavaScript" %}
  ```javascript
      // For gemini-2.5-flash-image
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: prompt,
          config: {
            imageConfig: {
              aspectRatio: "16:9",
            },
          }
        });
  
      // For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      const response_gemini3 = await ai.models.generateContent({
          model: "gemini-nano-banana-2.1",
          contents: prompt,
          config: {
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: "2K",
            },
          }
        });
  ```

  {% /tab %}

  {% tab label="Go" %}
  ```go
      // For gemini-2.5-flash-image
      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-2.5-flash-image",
          genai.Text("Create a picture of a nano banana dish in a " +
                      " fancy restaurant with a Gemini theme"),
          &genai.GenerateContentConfig{
              ImageConfig: &genai.ImageConfig{
                AspectRatio: "16:9",
              },
          },
        )
  
      // For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      result_gemini3, _ := client.Models.GenerateContent(
          ctx,
          "gemini-nano-banana-2.1",
          genai.Text("Create a picture of a nano banana dish in a " +
                      " fancy restaurant with a Gemini theme"),
          &genai.GenerateContentConfig{
              ImageConfig: &genai.ImageConfig{
                AspectRatio: "16:9",
                ImageSize: "2K",
              },
          },
        )
  ```

  {% /tab %}

  {% tab label="Java" %}
  ```java
      // For gemini-2.5-flash-image
      response = client.models.generateContent(
          "gemini-2.5-flash-image",
          prompt,
          GenerateContentConfig.builder()
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("16:9")
                  .build())
              .build());
  
      // For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      response_gemini3 = client.models.generateContent(
          "gemini-nano-banana-2.1",
          prompt,
          GenerateContentConfig.builder()
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("16:9")
                  .imageSize("2K")
                  .build())
              .build());
  ```

  {% /tab %}

  {% tab label="C#" %}
  ```csharp
      // For gemini-2.5-flash-image
      var response = await client.Models.GenerateContentAsync(
          model: "gemini-2.5-flash-image",
          contents: prompt,
          config: new GenerateContentConfig
          {
              ImageConfig = new ImageConfig
              {
                  AspectRatio = "16:9"
              }
          }
      );
  
      // For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      var response_gemini3 = await client.Models.GenerateContentAsync(
          model: "gemini-nano-banana-2.1",
          contents: prompt,
          config: new GenerateContentConfig
          {
              ImageConfig = new ImageConfig
              {
                  AspectRatio = "16:9",
                  ImageSize = "2K"
              }
          }
      );
  ```

  {% /tab %}

  {% tab label="REST" %}
  ```bash
      # For gemini-2.5-flash-image
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-image:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d '{
          "contents": [{
            "parts": [
              {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
            ]
          }],
          "generationConfig": {
            "imageConfig": {
              "aspectRatio": "16:9"
            }
          }
        }'
  
      # For gemini-nano-banana-2.1, gemini-3.1-flash-image, and gemini-3-pro-image
      curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d '{
          "contents": [{
            "parts": [
              {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
            ]
          }],
          "generationConfig": {
            "imageConfig": {
              "aspectRatio": "16:9",
              "imageSize": "2K"
            }
          }
        }'
  ```

  {% /tab %}

{% /tabs %}

The different ratios available and the size of the image generated are listed in
the following tables:

{% tabs %}
  {% tab label="Nano Banana 2.1" %}
  {% table %}
  * Aspect ratio {% align="left" %}
  * 1K resolution {% align="left" %}
  * 1K tokens {% align="left" %}
  * 2K resolution {% align="left" %}
  * 2K tokens {% align="left" %}
  * 4K resolution {% align="left" %}
  * 4K tokens {% align="left" %}

  ---

  * **1:1** {% align="left" %}
  * 1024x1024 {% align="left" %}
  * 1120 {% align="left" %}
  * 2048x2048 {% align="left" %}
  * 1680 {% align="left" %}
  * 4096x4096 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **1:4** {% align="left" %}
  * 512x2048 {% align="left" %}
  * 1120 {% align="left" %}
  * 1024x4096 {% align="left" %}
  * 1680 {% align="left" %}
  * 2048x8192 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **1:8** {% align="left" %}
  * 384x3072 {% align="left" %}
  * 1120 {% align="left" %}
  * 768x6144 {% align="left" %}
  * 1680 {% align="left" %}
  * 1536x12288 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **2:3** {% align="left" %}
  * 848x1264 {% align="left" %}
  * 1120 {% align="left" %}
  * 1696x2528 {% align="left" %}
  * 1680 {% align="left" %}
  * 3392x5056 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **3:2** {% align="left" %}
  * 1264x848 {% align="left" %}
  * 1120 {% align="left" %}
  * 2528x1696 {% align="left" %}
  * 1680 {% align="left" %}
  * 5056x3392 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **3:4** {% align="left" %}
  * 896x1200 {% align="left" %}
  * 1120 {% align="left" %}
  * 1792x2400 {% align="left" %}
  * 1680 {% align="left" %}
  * 3584x4800 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:1** {% align="left" %}
  * 2048x512 {% align="left" %}
  * 1120 {% align="left" %}
  * 4096x1024 {% align="left" %}
  * 1680 {% align="left" %}
  * 8192x2048 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:3** {% align="left" %}
  * 1200x896 {% align="left" %}
  * 1120 {% align="left" %}
  * 2400x1792 {% align="left" %}
  * 1680 {% align="left" %}
  * 4800x3584 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:5** {% align="left" %}
  * 928x1152 {% align="left" %}
  * 1120 {% align="left" %}
  * 1856x2304 {% align="left" %}
  * 1680 {% align="left" %}
  * 3712x4608 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **5:4** {% align="left" %}
  * 1152x928 {% align="left" %}
  * 1120 {% align="left" %}
  * 2304x1856 {% align="left" %}
  * 1680 {% align="left" %}
  * 4608x3712 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **8:1** {% align="left" %}
  * 3072x384 {% align="left" %}
  * 1120 {% align="left" %}
  * 6144x768 {% align="left" %}
  * 1680 {% align="left" %}
  * 12288x1536 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **9:16** {% align="left" %}
  * 768x1376 {% align="left" %}
  * 1120 {% align="left" %}
  * 1536x2752 {% align="left" %}
  * 1680 {% align="left" %}
  * 3072x5504 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **16:9** {% align="left" %}
  * 1376x768 {% align="left" %}
  * 1120 {% align="left" %}
  * 2752x1536 {% align="left" %}
  * 1680 {% align="left" %}
  * 5504x3072 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **21:9** {% align="left" %}
  * 1584x672 {% align="left" %}
  * 1120 {% align="left" %}
  * 3168x1344 {% align="left" %}
  * 1680 {% align="left" %}
  * 6336x2688 {% align="left" %}
  * 2520 {% align="left" %}
  {% /table %}

  {% /tab %}

  {% tab label="3.1 Flash Image" %}
  {% table %}
  * Aspect ratio {% align="left" %}
  * 512 resolution {% align="left" %}
  * 0.5K tokens {% align="left" %}
  * 1K resolution {% align="left" %}
  * 1K tokens {% align="left" %}
  * 2K resolution {% align="left" %}
  * 2K tokens {% align="left" %}
  * 4K resolution {% align="left" %}
  * 4K tokens {% align="left" %}

  ---

  * **1:1** {% align="left" %}
  * 512x512 {% align="left" %}
  * 747 {% align="left" %}
  * 1024x1024 {% align="left" %}
  * 1120 {% align="left" %}
  * 2048x2048 {% align="left" %}
  * 1680 {% align="left" %}
  * 4096x4096 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **1:4** {% align="left" %}
  * 256x1024 {% align="left" %}
  * 747 {% align="left" %}
  * 512x2048 {% align="left" %}
  * 1120 {% align="left" %}
  * 1024x4096 {% align="left" %}
  * 1680 {% align="left" %}
  * 2048x8192 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **1:8** {% align="left" %}
  * 192x1536 {% align="left" %}
  * 747 {% align="left" %}
  * 384x3072 {% align="left" %}
  * 1120 {% align="left" %}
  * 768x6144 {% align="left" %}
  * 1680 {% align="left" %}
  * 1536x12288 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **2:3** {% align="left" %}
  * 424x632 {% align="left" %}
  * 747 {% align="left" %}
  * 848x1264 {% align="left" %}
  * 1120 {% align="left" %}
  * 1696x2528 {% align="left" %}
  * 1680 {% align="left" %}
  * 3392x5056 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **3:2** {% align="left" %}
  * 632x424 {% align="left" %}
  * 747 {% align="left" %}
  * 1264x848 {% align="left" %}
  * 1120 {% align="left" %}
  * 2528x1696 {% align="left" %}
  * 1680 {% align="left" %}
  * 5056x3392 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **3:4** {% align="left" %}
  * 448x600 {% align="left" %}
  * 747 {% align="left" %}
  * 896x1200 {% align="left" %}
  * 1120 {% align="left" %}
  * 1792x2400 {% align="left" %}
  * 1680 {% align="left" %}
  * 3584x4800 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:1** {% align="left" %}
  * 1024x256 {% align="left" %}
  * 747 {% align="left" %}
  * 2048x512 {% align="left" %}
  * 1120 {% align="left" %}
  * 4096x1024 {% align="left" %}
  * 1680 {% align="left" %}
  * 8192x2048 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:3** {% align="left" %}
  * 600x448 {% align="left" %}
  * 747 {% align="left" %}
  * 1200x896 {% align="left" %}
  * 1120 {% align="left" %}
  * 2400x1792 {% align="left" %}
  * 1680 {% align="left" %}
  * 4800x3584 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **4:5** {% align="left" %}
  * 464x576 {% align="left" %}
  * 747 {% align="left" %}
  * 928x1152 {% align="left" %}
  * 1120 {% align="left" %}
  * 1856x2304 {% align="left" %}
  * 1680 {% align="left" %}
  * 3712x4608 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **5:4** {% align="left" %}
  * 576x464 {% align="left" %}
  * 747 {% align="left" %}
  * 1152x928 {% align="left" %}
  * 1120 {% align="left" %}
  * 2304x1856 {% align="left" %}
  * 1680 {% align="left" %}
  * 4608x3712 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **8:1** {% align="left" %}
  * 1536x192 {% align="left" %}
  * 747 {% align="left" %}
  * 3072x384 {% align="left" %}
  * 1120 {% align="left" %}
  * 6144x768 {% align="left" %}
  * 1680 {% align="left" %}
  * 12288x1536 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **9:16** {% align="left" %}
  * 384x688 {% align="left" %}
  * 747 {% align="left" %}
  * 768x1376 {% align="left" %}
  * 1120 {% align="left" %}
  * 1536x2752 {% align="left" %}
  * 1680 {% align="left" %}
  * 3072x5504 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **16:9** {% align="left" %}
  * 688x384 {% align="left" %}
  * 747 {% align="left" %}
  * 1376x768 {% align="left" %}
  * 1120 {% align="left" %}
  * 2752x1536 {% align="left" %}
  * 1680 {% align="left" %}
  * 5504x3072 {% align="left" %}
  * 2520 {% align="left" %}

  ---

  * **21:9** {% align="left" %}
  * 792x168 {% align="left" %}
  * 747 {% align="left" %}
  * 1584x672 {% align="left" %}
  * 1120 {% align="left" %}
  * 3168x1344 {% align="left" %}
  * 1680 {% align="left" %}
  * 6336x2688 {% align="left" %}
  * 2520 {% align="left" %}
  {% /table %}

  {% /tab %}

  {% tab label="3.1 Pro Image" %}
  {% table %}
  * Aspect ratio {% align="left" %}
  * 1K resolution {% align="left" %}
  * 1K tokens {% align="left" %}
  * 2K resolution {% align="left" %}
  * 2K tokens {% align="left" %}
  * 4K resolution {% align="left" %}
  * 4K tokens {% align="left" %}

  ---

  * **1:1** {% align="left" %}
  * 1024x1024 {% align="left" %}
  * 1120 {% align="left" %}
  * 2048x2048 {% align="left" %}
  * 1120 {% align="left" %}
  * 4096x4096 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **2:3** {% align="left" %}
  * 848x1264 {% align="left" %}
  * 1120 {% align="left" %}
  * 1696x2528 {% align="left" %}
  * 1120 {% align="left" %}
  * 3392x5056 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **3:2** {% align="left" %}
  * 1264x848 {% align="left" %}
  * 1120 {% align="left" %}
  * 2528x1696 {% align="left" %}
  * 1120 {% align="left" %}
  * 5056x3392 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **3:4** {% align="left" %}
  * 896x1200 {% align="left" %}
  * 1120 {% align="left" %}
  * 1792x2400 {% align="left" %}
  * 1120 {% align="left" %}
  * 3584x4800 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **4:3** {% align="left" %}
  * 1200x896 {% align="left" %}
  * 1120 {% align="left" %}
  * 2400x1792 {% align="left" %}
  * 1120 {% align="left" %}
  * 4800x3584 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **4:5** {% align="left" %}
  * 928x1152 {% align="left" %}
  * 1120 {% align="left" %}
  * 1856x2304 {% align="left" %}
  * 1120 {% align="left" %}
  * 3712x4608 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **5:4** {% align="left" %}
  * 1152x928 {% align="left" %}
  * 1120 {% align="left" %}
  * 2304x1856 {% align="left" %}
  * 1120 {% align="left" %}
  * 4608x3712 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **9:16** {% align="left" %}
  * 768x1376 {% align="left" %}
  * 1120 {% align="left" %}
  * 1536x2752 {% align="left" %}
  * 1120 {% align="left" %}
  * 3072x5504 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **16:9** {% align="left" %}
  * 1376x768 {% align="left" %}
  * 1120 {% align="left" %}
  * 2752x1536 {% align="left" %}
  * 1120 {% align="left" %}
  * 5504x3072 {% align="left" %}
  * 2000 {% align="left" %}

  ---

  * **21:9** {% align="left" %}
  * 1584x672 {% align="left" %}
  * 1120 {% align="left" %}
  * 3168x1344 {% align="left" %}
  * 1120 {% align="left" %}
  * 6336x2688 {% align="left" %}
  * 2000 {% align="left" %}
  {% /table %}

  {% /tab %}

  {% tab label="Gemini 2.5 Flash Image" %}
  {% table %}
  * Aspect ratio
  * Resolution
  * Tokens

  ---

  * 1:1
  * 1024x1024
  * 1290

  ---

  * 2:3
  * 832x1248
  * 1290

  ---

  * 3:2
  * 1248x832
  * 1290

  ---

  * 3:4
  * 864x1184
  * 1290

  ---

  * 4:3
  * 1184x864
  * 1290

  ---

  * 4:5
  * 896x1152
  * 1290

  ---

  * 5:4
  * 1152x896
  * 1290

  ---

  * 9:16
  * 768x1344
  * 1290

  ---

  * 16:9
  * 1344x768
  * 1290

  ---

  * 21:9
  * 1536x672
  * 1290
  {% /table %}

  {% /tab %}

{% /tabs %}

## When to use Imagen  {% id="choose-a-model" %}

{% callout type="warning" %}
  Imagen models are shut down. Use Nano Banana models for all
  image generation tasks.

{% /callout %}

## What's next  {% id="what-is-next" %}

*   Find more examples and code samples in the
  [cookbook guide](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_Started_Nano_Banana.ipynb).

*   Check out the [Veo guide](/docs/video) to learn how to generate
  videos with the Gemini API.

*   To learn more about Gemini models, see [Gemini models](/docs/models).


