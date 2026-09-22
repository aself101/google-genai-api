#!/usr/bin/env node

/**
 * Google GenAI CLI
 *
 * Command-line tool for generating images using Google GenAI API.
 * Supports Gemini image models, video understanding, and Veo video generation.
 *
 * Usage:
 *   google-genai --gemini --prompt "a serene landscape"
 *   google-genai --gemini --prompt "make it sunset" --input-image photo.jpg
 *   google-genai --model gemini-3-pro-image --prompt "..." --image-size 2K
 *   google-genai --veo --prompt "waves at dusk" --veo-resolution 4k
 *
 * Image models (current only; any other id is sent with a warning):
 *   gemini-3.1-flash-image (default), gemini-3.1-flash-lite-image, gemini-3-pro-image
 */

import { Command } from 'commander';
import {
  GoogleGenAIAPI,
  extractGeminiParts,
  GoogleGenAIVideoAPI,
} from './api.js';
import { GoogleGenAIVeoAPI, VEO_MODELS, VEO_MODES } from './veo-api.js';
import {
  getGoogleGenAIApiKey,
  validateVideoParams,
  MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_OUTPUT_DIR,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  VIDEO_MIME_TYPES,
  VEO_ASPECT_RATIOS,
  VEO_RESOLUTIONS,
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
  saveVeoMetadata,
  createVeoSpinner,
} from './utils.js';
import path from 'path';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type {
  GeminiPart,
  GeminiResponse,
  GoogleGenAIClientOptions,
  VideoUploadResult,
  VeoMode,
  VeoOperation,
  VeoPersonGeneration,
  VeoGenerateParams,
  VeoImageToVideoParams,
} from './types/index.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json dynamically
// Navigate up from dist/ to get package.json in root
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };

/**
 * CLI options interface.
 */
interface CliOptions {
  gemini?: boolean;
  gemini3Pro?: boolean;
  model?: string;
  video?: boolean;
  veo?: boolean;
  prompt?: string | string[];
  inputImage?: string[];
  aspectRatio?: string;
  imageSize?: string;
  capabilityValidation?: string;
  inputVideo?: string;
  videoStart?: string;
  videoEnd?: string;
  veoModel?: string;
  veoAspectRatio?: string;
  veoResolution?: string;
  veoDuration?: string;
  veoNegativePrompt?: string;
  veoImage?: string;
  veoPersonGeneration?: string;
  outputDir?: string;
  apiKey?: string;
  logLevel?: string;
  examples?: boolean;
  help?: boolean;
}

/**
 * Display usage examples.
 */
function showExamples(): void {
  console.log(`
${'='.repeat(70)}
GOOGLE GENAI - USAGE EXAMPLES
${'='.repeat(70)}

IMAGE GENERATION (default model: ${DEFAULT_IMAGE_MODEL})

1. Text-to-image generation
   $ google-genai --gemini \\
       --prompt "A serene mountain landscape at sunset" \\
       --aspect-ratio "16:9"

2. Image-to-image transformation
   $ google-genai --gemini \\
       --prompt "Transform into watercolor painting style" \\
       --input-image ./photo.jpg

3. Several reference images (repeat --input-image; up to 14 on current models)
   $ google-genai --gemini \\
       --prompt "Put the person from the first image in the room from the second" \\
       --input-image ./person.jpg \\
       --input-image ./room.jpg

4. Output size (512, 1K, 2K, 4K — per model)
   $ google-genai --gemini \\
       --prompt "Detailed botanical illustration of a fern" \\
       --image-size 2K

5. Choose a model
   $ google-genai --model gemini-3.1-flash-lite-image \\
       --prompt "A flat icon of a paper plane"

6. Gemini 3 Pro Image (--gemini-3-pro is shorthand for --model gemini-3-pro-image)
   $ google-genai --gemini-3-pro \\
       --prompt "A hyper-realistic photograph of a mountain lake" \\
       --image-size 4K

7. Send a value the model's constraint table does not list (warn, don't reject)
   $ google-genai --gemini \\
       --prompt "Tall banner" \\
       --aspect-ratio "1:8" \\
       --model gemini-3-pro-image \\
       --capability-validation warn

BATCH PROCESSING

8. Multiple prompts
   $ google-genai --gemini \\
       --prompt "a red apple" \\
       --prompt "a green apple" \\
       --prompt "a yellow apple" \\
       --aspect-ratio "1:1"

ADVANCED OPTIONS

9. Custom output directory
    $ google-genai --gemini \\
        --prompt "test generation" \\
        --output-dir ./my-outputs

10. Debug logging
    $ google-genai --gemini \\
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

11. Basic video analysis
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "Describe what happens in this video"

12. Video clipping (analyze specific segment)
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "What actions occur in this segment?" \\
        --video-start "30s" \\
        --video-end "1:30"

13. Ask about timestamps
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "List the key moments with timestamps"

14. Multiple analysis prompts (single upload)
    $ google-genai --video \\
        --input-video ./video.mp4 \\
        --prompt "Summarize this video" \\
        --prompt "Who are the main people shown?" \\
        --prompt "What objects are visible?"

SUPPORTED VIDEO FORMATS:
  ${VIDEO_MIME_TYPES.join(', ')}

TIME OFFSET FORMATS:
  - Seconds: "90s" or "90"
  - Minutes+seconds: "1m30s"
  - MM:SS: "1:30" or "01:30"
  - HH:MM:SS: "1:15:30"

ASPECT RATIOS (Image, per model): ${ASPECT_RATIOS.join(', ')}
IMAGE SIZES (per model): ${IMAGE_SIZES.join(', ')}

VEO VIDEO GENERATION (Veo 3.1)

15. Text-to-video generation
    $ google-genai --veo \\
        --prompt "A majestic lion walking through the savannah" \\
        --veo-aspect-ratio "16:9" \\
        --veo-duration 8

16. Image-to-video (animate an image)
    $ google-genai --veo \\
        --prompt "The cat wakes up and stretches" \\
        --veo-image ./cat.png \\
        --veo-duration 8

17. High resolution video (1080p, or 4k on Veo 3.1 / 3.1 Fast; both need 8s)
    $ google-genai --veo \\
        --prompt "Cinematic sunset over the ocean" \\
        --veo-resolution "4k" \\
        --veo-duration 8

18. Lower-cost generation (Veo 3.1 Lite: 720p/1080p, no reference images or extension)
    $ google-genai --veo \\
        --prompt "Waves crashing against a lighthouse" \\
        --veo-model "veo-3.1-lite-generate-preview"

19. Fast generation mode
    $ google-genai --veo \\
        --prompt "A butterfly landing on a flower" \\
        --veo-model "veo-3.1-fast-generate-preview"

20. Negative prompts (avoid certain content)
    $ google-genai --veo \\
        --prompt "A beautiful landscape" \\
        --veo-negative-prompt "blurry, low quality, cartoon"

VEO MODELS:
  - veo-3.1-generate-preview (default) - Full quality, native audio, up to 4k
  - veo-3.1-fast-generate-preview - Faster generation, up to 4k
  - veo-3.1-lite-generate-preview - Lowest cost; 720p/1080p; no reference images or extension

VEO ASPECT RATIOS: ${VEO_ASPECT_RATIOS.join(', ')}
VEO RESOLUTIONS: ${VEO_RESOLUTIONS.join(', ')} (1080p and 4k require 8s; no 4k on Lite)
VEO DURATIONS: 4s, 6s, 8s

FEATURES:
  - All images include SynthID watermarking
  - Gemini supports natural language editing without masks
  - Gemini image models: up to 14 aspect ratios, sizes 512–4K, up to 14 input images (per model)
  - Video understanding with Gemini 2.5 Flash
  - Video clipping with start/end offsets
  - Video generation with Veo 3.1 (native audio)
${'='.repeat(70)}
  `);
}

/**
 * Main CLI program.
 */
const program = new Command();

program
  .name('google-genai')
  .description('Google GenAI API - Gemini image generation, video understanding, Veo video')
  .version(version);

// Model selection flags
program
  .option('--gemini', `Image generation/editing (model: --model, default ${DEFAULT_IMAGE_MODEL})`)
  .option('--gemini-3-pro', `Image generation/editing with ${MODELS.GEMINI_3_PRO} (same as --model ${MODELS.GEMINI_3_PRO})`)
  .option(
    '--model <id>',
    `Image model (implies image mode): ${[MODELS.GEMINI_3_1_FLASH, MODELS.GEMINI_3_1_FLASH_LITE, MODELS.GEMINI_3_PRO].join(', ')}; other ids are sent with a warning`
  )
  .option('--video', 'Analyze video content (requires --input-video)')
  .option('--veo', 'Generate video with Veo 3.1 models');

// Generation options
program
  .option(
    '-p, --prompt <text...>',
    'Generation prompt(s) (can specify multiple for batch processing)'
  )
  .option(
    '-i, --input-image <path>',
    'Input image for editing/reference (repeatable; up to 14 on current models)',
    (value: string, previous: string[] = []) => [...previous, value]
  )
  .option('-a, --aspect-ratio <ratio>', `Aspect ratio, per model (${ASPECT_RATIOS.join(', ')}); omit for the model's default framing`)
  .option('--image-size <size>', `Output size, per model (${IMAGE_SIZES.join(', ')}; uppercase K)`)
  .option(
    '--capability-validation <mode>',
    "When a known model's constraint table rejects a value: 'error' or 'warn' (log and send anyway)",
    'error'
  );

// Video options
program
  .option('--input-video <path>', 'Path to video file for analysis (with --video)')
  .option('--video-start <offset>', 'Start offset for video clipping (e.g., "30s", "1:30")')
  .option('--video-end <offset>', 'End offset for video clipping (e.g., "60s", "2:00")');

// Veo video generation options
program
  .option('--veo-model <model>', `Veo model (${Object.values(VEO_MODELS).join(', ')})`, VEO_MODELS.VEO_3_1)
  .option(
    '--veo-aspect-ratio <ratio>',
    `Veo aspect ratio (${VEO_ASPECT_RATIOS.join(', ')})`,
    '16:9'
  )
  .option('--veo-resolution <res>', `Veo resolution (${VEO_RESOLUTIONS.join(', ')})`, '720p')
  .option('--veo-duration <seconds>', 'Video duration in seconds (4, 6, or 8)', '8')
  .option('--veo-negative-prompt <text>', 'What to avoid in the video')
  .option('--veo-image <path>', 'Image file to animate (image-to-video mode)')
  .option(
    '--veo-person-generation <value>',
    'Person generation (allow_all, allow_adult, dont_allow)'
  );

// General options
program
  .option('-o, --output-dir <path>', 'Output directory for generated images', DEFAULT_OUTPUT_DIR)
  .option('--api-key <key>', 'Google GenAI API key')
  .option('--log-level <level>', 'Logging level (debug, info, warn, error)', 'info')
  .option('--examples', 'Show usage examples')
  .option('-h, --help', 'Display help');

// Parse arguments
program.parse(process.argv);
const options = program.opts<CliOptions>();

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

// --model implies image mode
const imageMode = Boolean(options.gemini || options.gemini3Pro || options.model);

// Show help if no mode selected
if (!imageMode && !options.video && !options.veo) {
  program.outputHelp();
  process.exit(1);
}

if (options.gemini3Pro && options.model && options.model !== MODELS.GEMINI_3_PRO) {
  console.error(`Error: --gemini-3-pro selects ${MODELS.GEMINI_3_PRO}; it cannot be combined with --model ${options.model}.\n`);
  process.exit(1);
}

if (options.capabilityValidation !== 'error' && options.capabilityValidation !== 'warn') {
  console.error(`Error: --capability-validation must be 'error' or 'warn' (got '${options.capabilityValidation}').\n`);
  process.exit(1);
}
const clientOptions: GoogleGenAIClientOptions = { capabilityValidation: options.capabilityValidation };

// Count modes selected
const modesSelected = [imageMode, options.video, options.veo].filter(Boolean).length;

// Ensure only one mode is selected
if (modesSelected > 1) {
  if (options.video && (imageMode || options.veo)) {
    console.error(
      'Error: --video cannot be used with --gemini, --gemini-3-pro, --model, or --veo.'
    );
    console.error('Video analysis uses Gemini 2.5 Flash automatically.\n');
  } else if (options.veo && imageMode) {
    console.error('Error: --veo cannot be used with --gemini, --gemini-3-pro, or --model.');
    console.error('Veo is for video generation; use --veo-model to choose a Veo model.\n');
  } else {
    console.error(
      'Error: Cannot use multiple model modes. Please choose one: --gemini, --gemini-3-pro, --video, or --veo.\n'
    );
  }
  process.exit(1);
}

// Video-specific validation
if (options.video) {
  if (!options.inputVideo) {
    console.error('Error: --video requires --input-video <path>');
    console.error(
      'Example: google-genai --video --input-video ./video.mp4 --prompt "Describe this video"\n'
    );
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
 * @param apiKey - Google GenAI API key
 * @param prompts - Array of analysis prompts
 */
async function handleVideoMode(apiKey: string, prompts: string[]): Promise<void> {
  const videoApi = new GoogleGenAIVideoAPI(apiKey, options.logLevel);
  const outputDir = path.join(options.outputDir || DEFAULT_OUTPUT_DIR, 'video-analysis');
  await ensureDirectory(outputDir);

  let uploadedFile: VideoUploadResult | null = null;

  try {
    // Validate video time offsets if provided
    let videoMetadata: { startOffset?: string; endOffset?: string } | null = null;
    if (options.videoStart || options.videoEnd) {
      const validation = validateVideoParams({
        startOffset: options.videoStart,
        endOffset: options.videoEnd,
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
      uploadedFile = await videoApi.uploadVideoFile(options.inputVideo!);
      uploadSpinner.stop(
        `✓ Video uploaded and processed (${(uploadedFile.sizeBytes / 1024 / 1024).toFixed(1)}MB)\n`
      );
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
      console.log(
        `\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`
      );

      const analyzeSpinner = createSpinner('Analyzing video...');
      analyzeSpinner.start();

      let response;
      try {
        response = await videoApi.generateFromVideo({
          prompt,
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType,
          videoMetadata: videoMetadata || undefined,
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
      const videoBasename = path.basename(options.inputVideo!);
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
          ...(videoMetadata && { clipping: videoMetadata }),
        },
        prompt,
        analysis: {
          text: analysisText,
          frames,
        },
        outputs: [
          { type: 'markdown', filename: mdFilename },
          { type: 'metadata', filename: jsonFilename },
        ],
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
        const err = error as Error;
        logger.warn(`Failed to delete video file: ${err.message}`);
        // Best-effort cleanup - don't fail if deletion fails
      }
    }
  }
}

/**
 * Handle Veo video generation mode.
 *
 * @param apiKey - Google GenAI API key
 * @param prompts - Array of generation prompts
 */
async function handleVeoMode(apiKey: string, prompts: string[]): Promise<void> {
  const veoApi = new GoogleGenAIVeoAPI(apiKey, options.logLevel, clientOptions);

  const model = options.veoModel || VEO_MODELS.VEO_3_1;
  const outputDir = path.join(
    options.outputDir || DEFAULT_OUTPUT_DIR,
    'veo',
    model.replace(/[^a-z0-9.-]/gi, '-')
  );
  await ensureDirectory(outputDir);

  logger.info(`Starting Veo video generation with ${model}`);
  logger.info(`Processing ${prompts.length} prompt(s)`);

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    console.log(
      `\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`
    );

    // Build generation parameters
    const params: VeoGenerateParams = {
      prompt,
      model,
      aspectRatio: options.veoAspectRatio,
      resolution: options.veoResolution,
      durationSeconds: options.veoDuration,
    };

    if (options.veoNegativePrompt) {
      params.negativePrompt = options.veoNegativePrompt;
    }
    if (options.veoPersonGeneration) {
      params.personGeneration = options.veoPersonGeneration as VeoPersonGeneration;
    }

    // Determine generation mode
    let mode: VeoMode = VEO_MODES.TEXT_TO_VIDEO;
    let operation: VeoOperation;

    // Image-to-video mode
    if (options.veoImage) {
      mode = VEO_MODES.IMAGE_TO_VIDEO;
      logger.info(`Loading input image: ${options.veoImage}`);

      const image = await imageToVeoInput(options.veoImage);
      // Validated by the client before any network call (capabilityValidation applies)
      const imageParams: VeoImageToVideoParams = { ...params, image };

      const spinner = createVeoSpinner('Generating video from image...');
      spinner.start();

      try {
        operation = await veoApi.generateFromImage(imageParams);
        spinner.updateMessage('Video generation in progress...');

        operation = await veoApi.waitForCompletion(operation, {
          onProgress: (_op, elapsed) => {
            spinner.updateElapsed(elapsed);
          },
        });

        spinner.stop('✓ Video generated\n');
      } catch (error) {
        spinner.stop('✗ Generation failed\n');
        throw error;
      }
    } else {
      // Text-to-video mode (validated by the client before any network call)
      mode = VEO_MODES.TEXT_TO_VIDEO;

      const spinner = createVeoSpinner('Generating video...');
      spinner.start();

      try {
        operation = await veoApi.generateVideo(params);
        spinner.updateMessage('Video generation in progress...');

        operation = await veoApi.waitForCompletion(operation, {
          onProgress: (_op, elapsed) => {
            spinner.updateElapsed(elapsed);
          },
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
        ...(options.veoImage && { inputImage: options.veoImage }),
      },
    });
    console.log(`✓ Saved metadata: ${metadataPath}`);
  }

  console.log(`\n✓ All done! Generated ${prompts.length} video(s)\n`);
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  try {
    // Set log level
    setLogLevel(options.logLevel || 'info');

    // Get API key
    const apiKey = getGoogleGenAIApiKey(options.apiKey || null);

    // Ensure prompts is always an array
    const prompts = Array.isArray(options.prompt) ? options.prompt : [options.prompt!];

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
    // IMAGE MODE (Gemini)
    // ========================================================================

    // Initialize API (it validates every request before any network call)
    const api = new GoogleGenAIAPI(apiKey, options.logLevel, clientOptions);

    const model: string = options.model ?? (options.gemini3Pro ? MODELS.GEMINI_3_PRO : DEFAULT_IMAGE_MODEL);
    const modelDir = model.replace(/[^a-z0-9.-]/gi, '-'); // Use model name as directory

    logger.info(`Processing ${prompts.length} prompt(s) with ${model}`);

    // Process each prompt
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];

      logger.info(`\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt}"`);

      // Convert input images to inlineData format if provided
      const inputImages = [];
      for (const imagePath of options.inputImage ?? []) {
        logger.info(`Loading input image: ${imagePath}`);
        inputImages.push(await imageToInlineData(imagePath));
      }

      let parts: GeminiPart[] = [];
      let response: GeminiResponse;

      logger.info(`Generating with ${model} (inputImages: ${inputImages.length})`);

      const mode = inputImages.length > 0 ? 'image-to-image' : 'text-to-image';
      const spinner = createSpinner(`Generating image with ${model} (${mode})...`);
      spinner.start();

      try {
        response = await api.generateWithGemini({
          prompt,
          inputImages,
          aspectRatio: options.aspectRatio,
          imageSize: options.imageSize,
          model,
        });

        spinner.stop('✓ Generation complete\n');

        // Final output only: thought parts (e.g. Pro's draft images) are skipped,
        // so they never become `_2` files
        parts = extractGeminiParts(response);
      } catch (error) {
        spinner.stop('✗ Generation failed\n');
        throw error;
      }

      // Save outputs
      const outputDirPath = path.join(options.outputDir || DEFAULT_OUTPUT_DIR, modelDir);
      await ensureDirectory(outputDirPath);

      let imageCount = 0;
      const savedFiles: string[] = [];

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];

        if (part.type === 'image') {
          imageCount++;

          // Generate filename with unique suffix for multiple images
          const totalImages = parts.filter((p) => p.type === 'image').length;
          let filename: string;
          if (totalImages > 1) {
            // Multiple images: add index suffix to ensure unique filenames
            const baseFilename = generateFilename(prompt);
            const ext = baseFilename.split('.').pop();
            const nameWithoutExt = baseFilename.slice(0, -(ext!.length + 1));
            filename = `${nameWithoutExt}_${imageCount}.${ext}`;
          } else {
            // Single image: no index
            filename = generateFilename(prompt);
          }

          const imagePath = path.join(outputDirPath, filename);

          // Save image
          await saveBase64Image(part.data!, imagePath, part.mimeType);
          savedFiles.push(filename);

          console.log(`✓ Saved image: ${imagePath}`);
        } else if (part.type === 'text') {
          // Log text parts (Gemini may return text descriptions)
          logger.debug(`Text part: ${part.content}`);
        }
      }

      // Save metadata
      const metadataFilename = generateFilename(prompt, 'json');
      const metadataPath = path.join(outputDirPath, metadataFilename);

      const metadata = {
        model,
        timestamp: new Date().toISOString(),
        prompt,
        parameters: {
          ...(options.aspectRatio && { aspectRatio: options.aspectRatio }),
          ...(options.imageSize && { imageSize: options.imageSize }),
          ...(inputImages.length > 0 && { inputImages: options.inputImage }),
        },
        finishReason: response.candidates?.[0]?.finishReason,
        // The files actually written. 1.x regenerated names here with a fresh
        // timestamp, so they never matched what was saved.
        outputs: savedFiles.map((filename) => ({ type: 'image', filename })),
        text: parts.filter((p) => p.type === 'text').map((p) => p.content),
      };

      await saveMetadata(metadataPath, metadata);

      if (imageCount === 0) {
        throw new Error(
          `${model} returned no image (finishReason: ${response.candidates?.[0]?.finishReason ?? 'none'}). Metadata: ${metadataPath}`
        );
      }

      console.log(`✓ Generated ${imageCount} image(s) successfully\n`);
    }

    console.log(`\n✓ All done! Processed ${prompts.length} prompt(s)\n`);
  } catch (error) {
    const err = error as Error;
    console.error(`\n✗ Error: ${err.message}\n`);
    logger.error(err.stack || err.message);
    process.exit(1);
  }
}

// Run main function
main();
