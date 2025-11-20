#!/usr/bin/env node

/**
 * Google GenAI CLI
 *
 * Command-line tool for generating images using Google GenAI API.
 * Supports Gemini 2.5 Flash Image and Imagen 4 models.
 *
 * Usage:
 *   google-genai --gemini --prompt "a serene landscape"
 *   google-genai --imagen --prompt "futuristic robot" --number-of-images 4
 *   google-genai --gemini --prompt "make it sunset" --input-image photo.jpg
 *
 * Models:
 *   Gemini 2.5 Flash Image:
 *     - Text-to-image generation
 *     - Image-to-image transformation
 *     - Semantic masking (natural language editing)
 *
 *   Imagen 4:
 *     - High-quality text-to-image generation
 *     - Multiple outputs (1-4 images per request)
 *     - Photorealistic results
 */

import { Command } from 'commander';
import { GoogleGenAIAPI, extractGeminiParts, extractImagenImages } from './api.js';
import {
  getGoogleGenAIApiKey,
  validateModelParams,
  MODELS,
  DEFAULT_OUTPUT_DIR,
  ASPECT_RATIOS
} from './config.js';
import {
  saveBase64Image,
  saveMetadata,
  generateFilename,
  ensureDirectory,
  imageToInlineData,
  createSpinner,
  setLogLevel,
  logger
} from './utils.js';
import path from 'path';

/**
 * Display usage examples.
 */
function showExamples() {
  console.log(`
${'='.repeat(70)}
GOOGLE GENAI - USAGE EXAMPLES
${'='.repeat(70)}

GEMINI 2.5 FLASH IMAGE

1. Text-to-image generation
   $ google-genai --gemini \\
       --prompt "A serene mountain landscape at sunset" \\
       --aspect-ratio "16:9"

2. Image-to-image transformation
   $ google-genai --gemini \\
       --prompt "Transform into watercolor painting style" \\
       --input-image ./photo.jpg \\
       --aspect-ratio "1:1"

3. Semantic masking (natural language editing)
   $ google-genai --gemini \\
       --prompt "Change the car to red" \\
       --input-image ./street_scene.jpg

4. Multiple aspect ratios
   $ google-genai --gemini \\
       --prompt "Portrait of a futuristic character" \\
       --aspect-ratio "3:4"

IMAGEN 4

5. Generate single image
   $ google-genai --imagen \\
       --prompt "Futuristic cityscape at night" \\
       --aspect-ratio "16:9"

6. Generate multiple images (1-4)
   $ google-genai --imagen \\
       --prompt "Character design concepts" \\
       --number-of-images 4 \\
       --aspect-ratio "1:1"

7. Photorealistic generation
   $ google-genai --imagen \\
       --prompt "Professional product photography of a watch" \\
       --aspect-ratio "4:3"

BATCH PROCESSING

8. Multiple prompts with Gemini
   $ google-genai --gemini \\
       --prompt "a red apple" \\
       --prompt "a green apple" \\
       --prompt "a yellow apple" \\
       --aspect-ratio "1:1"

9. Multiple prompts with Imagen
   $ google-genai --imagen \\
       --prompt "logo design concept 1" \\
       --prompt "logo design concept 2" \\
       --number-of-images 2

ADVANCED OPTIONS

10. Custom output directory
    $ google-genai --gemini \\
        --prompt "test generation" \\
        --output-dir ./my-outputs

11. Debug logging
    $ google-genai --imagen \\
        --prompt "debug test" \\
        --log-level debug

AUTHENTICATION OPTIONS:

A. CLI flag (highest priority)
   $ google-genai --gemini --api-key YOUR_KEY --prompt "test"

B. Environment variable
   $ export GOOGLE_GENAI_API_KEY=YOUR_KEY
   $ google-genai --gemini --prompt "test"

C. Local .env file
   Create .env in current directory:
   GOOGLE_GENAI_API_KEY=YOUR_KEY

D. Global config
   Create ~/.google-genai/.env:
   GOOGLE_GENAI_API_KEY=YOUR_KEY

Get your API key at: https://aistudio.google.com/apikey

ASPECT RATIOS: ${ASPECT_RATIOS.join(', ')}

FEATURES:
  • All images include SynthID watermarking
  • Gemini supports natural language editing without masks
  • Imagen generates 1-4 images per request
  • Both models support various aspect ratios
${'='.repeat(70)}
  `);
}

/**
 * Main CLI program.
 */
const program = new Command();

program
  .name('google-genai')
  .description('Google GenAI API - Gemini 2.5 Flash Image & Imagen 4')
  .version('1.0.3');

// Model selection flags
program
  .option('--gemini', 'Use Gemini 2.5 Flash Image model')
  .option('--imagen', 'Use Imagen 4 model');

// Generation options
program
  .option('-p, --prompt <text...>', 'Generation prompt(s) (can specify multiple for batch processing)')
  .option('-i, --input-image <path>', 'Input image for editing (Gemini only)')
  .option('-a, --aspect-ratio <ratio>', `Aspect ratio (${ASPECT_RATIOS.join(', ')})`, '1:1')
  .option('-n, --number-of-images <number>', 'Number of images to generate (Imagen only, 1-4)', '1');

// General options
program
  .option('-o, --output-dir <path>', 'Output directory for generated images', DEFAULT_OUTPUT_DIR)
  .option('--api-key <key>', 'Google GenAI API key')
  .option('--log-level <level>', 'Logging level (debug, info, warn, error)', 'info')
  .option('--examples', 'Show usage examples')
  .option('-h, --help', 'Display help');

// Parse arguments
program.parse(process.argv);
const options = program.opts();

// Show examples if requested
if (options.examples) {
  showExamples();
  process.exit(0);
}

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Show help if no model selected
if (!options.gemini && !options.imagen) {
  program.outputHelp();
  process.exit(1);
}

// Ensure only one model is selected
if (options.gemini && options.imagen) {
  console.error('Error: Cannot use both --gemini and --imagen. Please choose one model.\n');
  process.exit(1);
}

// Validate prompt
if (!options.prompt || options.prompt.length === 0) {
  program.outputHelp();
  process.exit(1);
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // Set log level
    setLogLevel(options.logLevel);

    // Get API key
    const apiKey = getGoogleGenAIApiKey(options.apiKey);

    // Initialize API
    const api = new GoogleGenAIAPI(apiKey, options.logLevel);

    // Determine model
    const model = options.gemini ? MODELS.GEMINI : MODELS.IMAGEN;
    const modelDir = model; // Use model name as directory

    // Ensure prompts is always an array
    const prompts = Array.isArray(options.prompt) ? options.prompt : [options.prompt];

    logger.info(`Processing ${prompts.length} prompt(s) with ${model}`);

    // Process each prompt
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];

      logger.info(`\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt}"`);

      // Pre-flight validation
      const validationParams = {
        prompt,
        aspectRatio: options.aspectRatio,
        numberOfImages: parseInt(options.numberOfImages),
        inputImages: options.inputImage ? [options.inputImage] : []
      };

      validateModelParams(model, validationParams);

      // Route to appropriate API method
      let response;
      let parts = [];

      if (model === MODELS.IMAGEN) {
        // Imagen generation
        logger.info(`Generating with Imagen (numberOfImages: ${options.numberOfImages})`);

        const spinner = createSpinner(`Generating ${options.numberOfImages} image(s) with Imagen...`);
        spinner.start();

        try {
          response = await api.generateWithImagen({
            prompt,
            numberOfImages: parseInt(options.numberOfImages),
            aspectRatio: options.aspectRatio
          });

          spinner.stop('✓ Generation complete\n');

          // Extract images from Imagen response
          parts = extractImagenImages(response);
        } catch (error) {
          spinner.stop('✗ Generation failed\n');
          throw error;
        }

      } else {
        // Gemini generation
        // Convert input images to inlineData format if provided
        const inputImages = [];
        if (options.inputImage) {
          logger.info(`Loading input image: ${options.inputImage}`);
          const inlineData = await imageToInlineData(options.inputImage);
          inputImages.push(inlineData);
        }

        logger.info(`Generating with Gemini (inputImages: ${inputImages.length})`);

        const mode = inputImages.length > 0 ? 'image-to-image' : 'text-to-image';
        const spinner = createSpinner(`Generating image with Gemini (${mode})...`);
        spinner.start();

        try {
          response = await api.generateWithGemini({
            prompt,
            inputImages,
            aspectRatio: options.aspectRatio
          });

          spinner.stop('✓ Generation complete\n');

          // Extract parts from Gemini response
          parts = extractGeminiParts(response);
        } catch (error) {
          spinner.stop('✗ Generation failed\n');
          throw error;
        }
      }

      // Save outputs
      const outputDir = path.join(options.outputDir, modelDir);
      await ensureDirectory(outputDir);

      let imageCount = 0;

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];

        if (part.type === 'image') {
          imageCount++;

          // Generate filename
          let filename;
          if (parts.filter(p => p.type === 'image').length > 1) {
            // Multiple images: add index
            filename = generateFilename(`${prompt}-${imageCount}`);
          } else {
            // Single image: no index
            filename = generateFilename(prompt);
          }

          const imagePath = path.join(outputDir, filename);

          // Save image
          await saveBase64Image(part.data, imagePath, part.mimeType);

          console.log(`✓ Saved image: ${imagePath}`);
        } else if (part.type === 'text') {
          // Log text parts (Gemini may return text descriptions)
          logger.debug(`Text part: ${part.content}`);
        }
      }

      // Save metadata
      const metadataFilename = generateFilename(prompt, 'json');
      const metadataPath = path.join(outputDir, metadataFilename);

      const metadata = {
        model,
        timestamp: new Date().toISOString(),
        prompt,
        parameters: {
          aspectRatio: options.aspectRatio,
          ...(model === MODELS.IMAGEN && { numberOfImages: parseInt(options.numberOfImages) }),
          ...(options.inputImage && { inputImage: options.inputImage })
        },
        outputs: parts.map((p, idx) => ({
          type: p.type,
          ...(p.type === 'image' && { filename: generateFilename(p.content || prompt) })
        }))
      };

      await saveMetadata(metadataPath, metadata);

      console.log(`✓ Generated ${imageCount} image(s) successfully\n`);
    }

    console.log(`\n✓ All done! Processed ${prompts.length} prompt(s)\n`);

  } catch (error) {
    console.error(`\n✗ Error: ${error.message}\n`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run main function
main();
