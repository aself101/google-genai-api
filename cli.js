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
import { GoogleGenAIAPI, extractGeminiParts, extractImagenImages, GoogleGenAIVideoAPI } from './api.js';
import { GoogleGenAIVeoAPI, VEO_MODELS, VEO_MODES } from './veo-api.js';
import {
  getGoogleGenAIApiKey,
  validateModelParams,
  validateVideoParams,
  validateVeoParams,
  MODELS,
  DEFAULT_OUTPUT_DIR,
  ASPECT_RATIOS,
  VIDEO_MIME_TYPES,
  VEO_ASPECT_RATIOS,
  VEO_RESOLUTIONS,
  VEO_DURATIONS
} from './config.js';
import {
  saveBase64Image,
  saveMetadata,
  generateFilename,
  ensureDirectory,
  imageToInlineData,
  createSpinner,
  setLogLevel,
  logger,
  formatTimeOffset,
  extractVideoMetadata,
  imageToVeoInput,
  generateVeoOutputPath,
  saveVeoMetadata,
  createVeoSpinner
} from './utils.js';
import path from 'path';
import fs from 'fs/promises';

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

GEMINI 3 PRO IMAGE PREVIEW

5. Text-to-image with Gemini 3 Pro
   $ google-genai --gemini-3-pro \\
       --prompt "A hyper-realistic photograph of a mountain lake" \\
       --aspect-ratio "16:9"

6. Image-to-image with Gemini 3 Pro
   $ google-genai --gemini-3-pro \\
       --prompt "Add dramatic storm clouds" \\
       --input-image ./landscape.jpg

IMAGEN 4

7. Generate single image
   $ google-genai --imagen \\
       --prompt "Futuristic cityscape at night" \\
       --aspect-ratio "16:9"

8. Generate multiple images (1-4)
   $ google-genai --imagen \\
       --prompt "Character design concepts" \\
       --number-of-images 4 \\
       --aspect-ratio "1:1"

9. Photorealistic generation
   $ google-genai --imagen \\
       --prompt "Professional product photography of a watch" \\
       --aspect-ratio "4:3"

BATCH PROCESSING

10. Multiple prompts with Gemini
   $ google-genai --gemini \\
       --prompt "a red apple" \\
       --prompt "a green apple" \\
       --prompt "a yellow apple" \\
       --aspect-ratio "1:1"

11. Multiple prompts with Imagen
   $ google-genai --imagen \\
       --prompt "logo design concept 1" \\
       --prompt "logo design concept 2" \\
       --number-of-images 2

ADVANCED OPTIONS

12. Custom output directory
    $ google-genai --gemini \\
        --prompt "test generation" \\
        --output-dir ./my-outputs

13. Debug logging
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

VIDEO UNDERSTANDING (Gemini 2.5 Flash)

14. Basic video analysis
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "Describe what happens in this video"

15. Video clipping (analyze specific segment)
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "What actions occur in this segment?" \\
        --video-start "30s" \\
        --video-end "1:30"

16. Ask about timestamps
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "List the key moments with timestamps"

17. Multiple analysis prompts (single upload)
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "Summarize this video" \\
        --prompt "Who are the main people shown?" \\
        --prompt "What objects are visible?"

SUPPORTED VIDEO FORMATS:
  ${VIDEO_MIME_TYPES.join(', ')}

TIME OFFSET FORMATS:
  • Seconds: "90s" or "90"
  • Minutes+seconds: "1m30s"
  • MM:SS: "1:30" or "01:30"
  • HH:MM:SS: "1:15:30"

ASPECT RATIOS (Image): ${ASPECT_RATIOS.join(', ')}

VEO VIDEO GENERATION (Veo 3.1)

18. Text-to-video generation
    $ google-genai --veo \\
        --prompt "A majestic lion walking through the savannah" \\
        --veo-aspect-ratio "16:9" \\
        --veo-duration 8

19. Image-to-video (animate an image)
    $ google-genai --veo \\
        --prompt "The cat wakes up and stretches" \\
        --veo-image ./cat.png \\
        --veo-duration 8

20. High resolution video (1080p)
    $ google-genai --veo \\
        --prompt "Cinematic sunset over the ocean" \\
        --veo-resolution "1080p" \\
        --veo-duration 8

21. Fast generation mode
    $ google-genai --veo \\
        --prompt "A butterfly landing on a flower" \\
        --veo-model "veo-3.1-fast-generate-preview"

22. Negative prompts (avoid certain content)
    $ google-genai --veo \\
        --prompt "A beautiful landscape" \\
        --veo-negative-prompt "blurry, low quality, cartoon"

VEO MODELS:
  • veo-3.1-generate-preview (default) - Full quality, native audio
  • veo-3.1-fast-generate-preview - Faster generation
  • veo-3.0-generate-001 - Stable release
  • veo-3.0-fast-generate-001 - Fast stable
  • veo-2.0-generate-001 - Legacy (720p only, no audio)

VEO ASPECT RATIOS: ${VEO_ASPECT_RATIOS.join(', ')}
VEO RESOLUTIONS: ${VEO_RESOLUTIONS.join(', ')} (1080p requires 8s duration)
VEO DURATIONS: 4s, 6s, 8s (Veo 3.x) or 5s, 6s, 8s (Veo 2)

FEATURES:
  • All images include SynthID watermarking
  • Gemini supports natural language editing without masks
  • Imagen generates 1-4 images per request
  • Both models support various aspect ratios
  • Video understanding with Gemini 2.5 Flash
  • Video clipping with start/end offsets
  • Video generation with Veo (native audio in Veo 3.x)
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
  .option('--gemini-3-pro', 'Use Gemini 3 Pro Image Preview model')
  .option('--imagen', 'Use Imagen 4 model')
  .option('--video', 'Analyze video content (requires --input-video)')
  .option('--veo', 'Generate video with Veo 3.1 models');

// Generation options
program
  .option('-p, --prompt <text...>', 'Generation prompt(s) (can specify multiple for batch processing)')
  .option('-i, --input-image <path>', 'Input image for editing (Gemini only)')
  .option('-a, --aspect-ratio <ratio>', `Aspect ratio (${ASPECT_RATIOS.join(', ')})`, '1:1')
  .option('-n, --number-of-images <number>', 'Number of images to generate (Imagen only, 1-4)', '1');

// Video options
program
  .option('--input-video <path>', 'Path to video file for analysis (with --video)')
  .option('--video-start <offset>', 'Start offset for video clipping (e.g., "30s", "1:30")')
  .option('--video-end <offset>', 'End offset for video clipping (e.g., "60s", "2:00")');

// Veo video generation options
program
  .option('--veo-model <model>', 'Veo model to use', VEO_MODELS.VEO_3_1)
  .option('--veo-aspect-ratio <ratio>', `Veo aspect ratio (${VEO_ASPECT_RATIOS.join(', ')})`, '16:9')
  .option('--veo-resolution <res>', `Veo resolution (${VEO_RESOLUTIONS.join(', ')})`, '720p')
  .option('--veo-duration <seconds>', 'Video duration in seconds (4, 5, 6, or 8)', '8')
  .option('--veo-negative-prompt <text>', 'What to avoid in the video')
  .option('--veo-image <path>', 'Image file to animate (image-to-video mode)')
  .option('--veo-person-generation <value>', 'Person generation (allow_all, allow_adult, dont_allow)');

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
if (!options.gemini && !options.gemini3Pro && !options.imagen && !options.video && !options.veo) {
  program.outputHelp();
  process.exit(1);
}

// Count modes selected
const modesSelected = [options.gemini, options.gemini3Pro, options.imagen, options.video, options.veo].filter(Boolean).length;

// Ensure only one mode is selected
if (modesSelected > 1) {
  if (options.video && (options.gemini || options.gemini3Pro || options.imagen || options.veo)) {
    console.error('Error: --video cannot be used with --gemini, --gemini-3-pro, --imagen, or --veo.');
    console.error('Video analysis uses Gemini 2.5 Flash automatically.\n');
  } else if (options.veo && (options.gemini || options.gemini3Pro || options.imagen)) {
    console.error('Error: --veo cannot be used with --gemini, --gemini-3-pro, or --imagen.');
    console.error('Veo is for video generation. Use --gemini, --gemini-3-pro, or --imagen for images.\n');
  } else {
    console.error('Error: Cannot use multiple model modes. Please choose one: --gemini, --gemini-3-pro, --imagen, --video, or --veo.\n');
  }
  process.exit(1);
}

// Video-specific validation
if (options.video) {
  if (!options.inputVideo) {
    console.error('Error: --video requires --input-video <path>');
    console.error('Example: google-genai --video --input-video ./video.mp4 --prompt "Describe this video"\n');
    process.exit(1);
  }
}

// Validate prompt
if (!options.prompt || options.prompt.length === 0) {
  program.outputHelp();
  process.exit(1);
}

/**
 * Handle video analysis mode.
 * Uploads video once and processes all prompts.
 *
 * @param {string} apiKey - Google GenAI API key
 * @param {Array<string>} prompts - Array of analysis prompts
 */
async function handleVideoMode(apiKey, prompts) {
  const videoApi = new GoogleGenAIVideoAPI(apiKey, options.logLevel);
  const outputDir = path.join(options.outputDir, 'video-analysis');
  await ensureDirectory(outputDir);

  let uploadedFile = null;

  try {
    // Validate video time offsets if provided
    let videoMetadata = null;
    if (options.videoStart || options.videoEnd) {
      const validation = validateVideoParams({
        startOffset: options.videoStart,
        endOffset: options.videoEnd
      });

      videoMetadata = {};
      if (validation.startSeconds !== undefined) {
        videoMetadata.startOffset = formatTimeOffset(validation.startSeconds);
      }
      if (validation.endSeconds !== undefined) {
        videoMetadata.endOffset = formatTimeOffset(validation.endSeconds);
      }
    }

    // ========================================================================
    // UPLOAD PHASE (ONCE, OUTSIDE PROMPT LOOP)
    // ========================================================================
    logger.info(`Uploading video: ${options.inputVideo}`);

    const uploadSpinner = createSpinner('Uploading and processing video...');
    uploadSpinner.start();

    try {
      uploadedFile = await videoApi.uploadVideoFile(options.inputVideo);
      uploadSpinner.stop(`✓ Video uploaded and processed (${(uploadedFile.sizeBytes / 1024 / 1024).toFixed(1)}MB)\n`);
    } catch (error) {
      uploadSpinner.stop('✗ Video upload failed\n');
      throw error;
    }

    logger.info(`Video ready: ${uploadedFile.name} (state: ${uploadedFile.state})`);

    // ========================================================================
    // GENERATION PHASE (FOR EACH PROMPT)
    // ========================================================================
    logger.info(`Processing ${prompts.length} prompt(s) for video analysis`);

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

      const analyzeSpinner = createSpinner('Analyzing video...');
      analyzeSpinner.start();

      let response;
      try {
        response = await videoApi.generateFromVideo({
          prompt,
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType,
          videoMetadata
        });
        analyzeSpinner.stop('✓ Analysis complete\n');
      } catch (error) {
        analyzeSpinner.stop('✗ Analysis failed\n');
        throw error;
      }

      // Extract analysis and metadata
      const { text: analysisText, frames } = extractVideoMetadata(response);

      // Generate filenames
      const baseFilename = generateFilename(prompt);
      const mdFilename = baseFilename.replace(/\.[^.]+$/, '.md');
      const jsonFilename = baseFilename.replace(/\.[^.]+$/, '.json');

      const mdPath = path.join(outputDir, mdFilename);
      const jsonPath = path.join(outputDir, jsonFilename);

      // Save analysis as markdown
      const videoBasename = path.basename(options.inputVideo);
      const mdContent = `# Video Analysis

## Video
\`${videoBasename}\`

## Prompt
${prompt}

## Analysis
${analysisText}

---
*Generated: ${new Date().toISOString()}*
`;
      await fs.writeFile(mdPath, mdContent, 'utf-8');
      console.log(`✓ Saved analysis: ${mdPath}`);

      // Build comprehensive metadata
      const metadata = {
        model: MODELS.GEMINI_VIDEO,
        type: 'video-analysis',
        timestamp: new Date().toISOString(),
        video: {
          file: options.inputVideo,
          mimeType: uploadedFile.mimeType,
          fileSize: uploadedFile.sizeBytes,
          uploadedUri: uploadedFile.uri,
          ...(videoMetadata && { clipping: videoMetadata })
        },
        prompt,
        analysis: {
          text: analysisText,
          frames
        },
        outputs: [
          { type: 'markdown', filename: mdFilename },
          { type: 'metadata', filename: jsonFilename }
        ]
      };

      await saveMetadata(jsonPath, metadata);
      console.log(`✓ Saved metadata: ${jsonPath}`);

      if (frames.length > 0) {
        console.log(`✓ Found ${frames.length} timestamp reference(s)`);
      }
    }

    console.log(`\n✓ All done! Processed ${prompts.length} prompt(s) for video analysis\n`);

  } finally {
    // ========================================================================
    // CLEANUP PHASE (BEST-EFFORT, AFTER ALL PROMPTS)
    // ========================================================================
    if (uploadedFile?.uri) {
      logger.debug('Cleaning up uploaded video file...');
      try {
        await videoApi.deleteVideoFile(uploadedFile.uri);
        logger.debug('Deleted uploaded video file');
      } catch (error) {
        logger.warn(`Failed to delete video file: ${error.message}`);
        // Best-effort cleanup - don't fail if deletion fails
      }
    }
  }
}

/**
 * Handle Veo video generation mode.
 *
 * @param {string} apiKey - Google GenAI API key
 * @param {Array<string>} prompts - Array of generation prompts
 */
async function handleVeoMode(apiKey, prompts) {
  const veoApi = new GoogleGenAIVeoAPI(apiKey, options.logLevel);

  const model = options.veoModel;
  const outputDir = path.join(options.outputDir, 'veo', model.replace(/[^a-z0-9.-]/gi, '-'));
  await ensureDirectory(outputDir);

  logger.info(`Starting Veo video generation with ${model}`);
  logger.info(`Processing ${prompts.length} prompt(s)`);

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    console.log(`\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

    // Build generation parameters
    const params = {
      prompt,
      model,
      aspectRatio: options.veoAspectRatio,
      resolution: options.veoResolution,
      durationSeconds: options.veoDuration
    };

    if (options.veoNegativePrompt) {
      params.negativePrompt = options.veoNegativePrompt;
    }
    if (options.veoPersonGeneration) {
      params.personGeneration = options.veoPersonGeneration;
    }

    // Determine generation mode
    let mode = VEO_MODES.TEXT_TO_VIDEO;
    let operation;

    // Image-to-video mode
    if (options.veoImage) {
      mode = VEO_MODES.IMAGE_TO_VIDEO;
      logger.info(`Loading input image: ${options.veoImage}`);

      const image = await imageToVeoInput(options.veoImage);
      params.image = image;

      // Pre-flight validation
      validateVeoParams(model, params, mode);

      const spinner = createVeoSpinner('Generating video from image...');
      spinner.start();

      try {
        operation = await veoApi.generateFromImage(params);
        spinner.updateMessage('Video generation in progress...');

        operation = await veoApi.waitForCompletion(operation, {
          onProgress: (op, elapsed) => {
            spinner.updateElapsed(elapsed);
          }
        });

        spinner.stop('✓ Video generated\n');
      } catch (error) {
        spinner.stop('✗ Generation failed\n');
        throw error;
      }
    } else {
      // Text-to-video mode
      mode = VEO_MODES.TEXT_TO_VIDEO;

      // Pre-flight validation
      validateVeoParams(model, params, mode);

      const spinner = createVeoSpinner('Generating video...');
      spinner.start();

      try {
        operation = await veoApi.generateVideo(params);
        spinner.updateMessage('Video generation in progress...');

        operation = await veoApi.waitForCompletion(operation, {
          onProgress: (op, elapsed) => {
            spinner.updateElapsed(elapsed);
          }
        });

        spinner.stop('✓ Video generated\n');
      } catch (error) {
        spinner.stop('✗ Generation failed\n');
        throw error;
      }
    }

    // Download video
    const filename = generateFilename(prompt, 'mp4', 40);
    const videoPath = path.join(outputDir, filename);

    logger.info('Downloading video...');
    await veoApi.downloadVideo(operation, videoPath);
    console.log(`✓ Saved video: ${videoPath}`);

    // Save metadata
    const metadataPath = await saveVeoMetadata(videoPath, {
      operationName: operation.name,
      model,
      mode,
      parameters: {
        prompt,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        durationSeconds: params.durationSeconds,
        ...(params.negativePrompt && { negativePrompt: params.negativePrompt }),
        ...(options.veoImage && { inputImage: options.veoImage })
      }
    });
    console.log(`✓ Saved metadata: ${metadataPath}`);
  }

  console.log(`\n✓ All done! Generated ${prompts.length} video(s)\n`);
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

    // Ensure prompts is always an array
    const prompts = Array.isArray(options.prompt) ? options.prompt : [options.prompt];

    // ========================================================================
    // VEO VIDEO GENERATION MODE
    // ========================================================================
    if (options.veo) {
      await handleVeoMode(apiKey, prompts);
      return;
    }

    // ========================================================================
    // VIDEO ANALYSIS MODE
    // ========================================================================
    if (options.video) {
      await handleVideoMode(apiKey, prompts);
      return;
    }

    // ========================================================================
    // IMAGE MODE (Gemini / Imagen)
    // ========================================================================

    // Initialize API
    const api = new GoogleGenAIAPI(apiKey, options.logLevel);

    // Determine model
    let model;
    if (options.gemini3Pro) {
      model = MODELS.GEMINI_3_PRO;
    } else if (options.gemini) {
      model = MODELS.GEMINI;
    } else {
      model = MODELS.IMAGEN;
    }
    const modelDir = model; // Use model name as directory

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
        // Gemini generation (gemini-2.5-flash-image or gemini-3-pro-image-preview)
        // Convert input images to inlineData format if provided
        const inputImages = [];
        if (options.inputImage) {
          logger.info(`Loading input image: ${options.inputImage}`);
          const inlineData = await imageToInlineData(options.inputImage);
          inputImages.push(inlineData);
        }

        logger.info(`Generating with ${model} (inputImages: ${inputImages.length})`);

        const mode = inputImages.length > 0 ? 'image-to-image' : 'text-to-image';
        const modelName = options.gemini3Pro ? 'Gemini 3 Pro' : 'Gemini';
        const spinner = createSpinner(`Generating image with ${modelName} (${mode})...`);
        spinner.start();

        try {
          response = await api.generateWithGemini({
            prompt,
            inputImages,
            aspectRatio: options.aspectRatio,
            model
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
