#!/usr/bin/env node

/**
 * Google GenAI CLI
 *
 * Command-line tool for generating images using Google GenAI API.
 * Supports Gemini image models, video understanding, and Gemini Omni video generation.
 *
 * Usage:
 *   google-genai --gemini --prompt "a serene landscape"
 *   google-genai --gemini --prompt "make it sunset" --input-image photo.jpg
 *   google-genai --model gemini-3-pro-image --prompt "..." --image-size 2K
 *   google-genai --omni --prompt "waves at dusk" --omni-resolution 1080p
 *
 * Image models (current only; any other id is sent with a warning):
 *   gemini-nano-banana-2.1 (default), gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-3-pro-image
 */

import { Command } from 'commander';
import {
  GoogleGenAIAPI,
  extractGeminiParts,
  GoogleGenAIVideoAPI,
} from './api.js';
import { GoogleGenAIOmniAPI } from './omni-api.js';
import { errorMessage } from './errors.js';
import { noOutputReason } from './no-output.js';
import {
  getGoogleGenAIApiKey,
  validateVideoParams,
  MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_OUTPUT_DIR,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  VIDEO_MIME_TYPES,
  OMNI_MODELS,
  OMNI_ASPECT_RATIOS,
  OMNI_RESOLUTIONS,
  OMNI_TASKS,
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
  OmniDelivery,
  OmniGenerateParams,
  OmniResult,
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
  omni?: boolean;
  prompt?: string | string[];
  inputImage?: string[];
  aspectRatio?: string;
  imageSize?: string;
  capabilityValidation?: string;
  inputVideo?: string;
  videoStart?: string;
  videoEnd?: string;
  omniModel?: string;
  omniAspectRatio?: string;
  omniResolution?: string;
  omniDuration?: string;
  omniImage?: string[];
  omniVideo?: string;
  omniPrevious?: string;
  omniTask?: string;
  omniDelivery?: string;
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

VIDEO UNDERSTANDING (${MODELS.GEMINI_VIDEO})

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

OMNI VIDEO GENERATION (Gemini Omni Flash; replaces Veo, shut down 2026-10-22)

Omni picks the mode from the prompt and the inputs. Say how each image is
meant to be used ("first frame", "last frame", "the character in the
reference image"). Every run prints its interaction id; pass it to
--omni-previous to edit or extend that video.

15. Text-to-video
    $ google-genai --omni \\
        --prompt "Continuous shot: a paper airplane glides through a library" \\
        --omni-duration 8

16. Image-to-video (animate an image)
    $ google-genai --omni \\
        --prompt "Bring this drawing to life as realistic footage" \\
        --omni-image ./drawing.png

17. First and last frame (3-10 s)
    $ google-genai --omni \\
        --prompt "Transition from the first frame to the last frame" \\
        --omni-image ./start.png --omni-image ./end.png --omni-duration 6

18. Edit the video an earlier run produced (keep the rest the same)
    $ google-genai --omni \\
        --prompt "Make the violin invisible. Keep everything else the same." \\
        --omni-previous v1_abc123

19. Extend an earlier video by 3-10 s (up to 30 s total)
    $ google-genai --omni \\
        --prompt "Extend this video: the camera pans to the mountains" \\
        --omni-previous v1_abc123 --omni-duration 6

20. Edit your own video (uploaded through the Files API; up to 15 s)
    $ google-genai --omni \\
        --prompt "Make this video anime" \\
        --omni-video ./clip.mp4

OMNI MODELS: ${Object.values(OMNI_MODELS).join(', ')}
OMNI ASPECT RATIOS: ${OMNI_ASPECT_RATIOS.join(', ')}
OMNI RESOLUTIONS: ${OMNI_RESOLUTIONS.join(', ')} (1080p and 4k are upscaled)
OMNI DURATIONS: 3-15 s (default 10); 3-10 s with first+last frame or per extension

FEATURES:
  - All images include SynthID watermarking
  - Gemini supports natural language editing without masks
  - Gemini image models: up to 14 aspect ratios, sizes 512–4K, up to 14 input images (per model)
  - Video understanding with ${MODELS.GEMINI_VIDEO}
  - Video clipping with start/end offsets
  - Video generation and conversational editing with Gemini Omni (native audio)
${'='.repeat(70)}
  `);
}

/**
 * Main CLI program.
 */
const program = new Command();

program
  .name('google-genai')
  .description('Google GenAI API - Gemini image generation, video understanding, Omni video')
  .version(version);

// Model selection flags
program
  .option('--gemini', `Image generation/editing (model: --model, default ${DEFAULT_IMAGE_MODEL})`)
  .option('--gemini-3-pro', `Image generation/editing with ${MODELS.GEMINI_3_PRO} (same as --model ${MODELS.GEMINI_3_PRO})`)
  .option(
    '--model <id>',
    `Image model (implies image mode): ${[MODELS.GEMINI_NANO_BANANA_2_1, MODELS.GEMINI_3_1_FLASH, MODELS.GEMINI_3_1_FLASH_LITE, MODELS.GEMINI_3_PRO].join(', ')}; other ids are sent with a warning`
  )
  .option('--video', 'Analyze video content (requires --input-video)')
  .option('--omni', 'Generate or edit video with Gemini Omni');

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

// Omni video generation options
program
  .option('--omni-model <model>', `Omni model (${Object.values(OMNI_MODELS).join(', ')}); other ids are sent with a warning`)
  .option('--omni-aspect-ratio <ratio>', `Omni aspect ratio (${OMNI_ASPECT_RATIOS.join(', ')}; default 16:9)`)
  .option('--omni-resolution <res>', `Omni resolution (${OMNI_RESOLUTIONS.join(', ')}; default 720p)`)
  .option('--omni-duration <seconds>', 'Video duration in whole seconds, 3-15 (default 10)')
  .option(
    '--omni-image <path>',
    'Input image: to animate, a first/last frame, or a reference (repeatable, up to 6; order matters)',
    (value: string, previous: string[] = []) => [...previous, value]
  )
  .option('--omni-video <path>', 'Video to edit or extend (uploaded through the Files API; up to 15 s)')
  .option('--omni-previous <id>', 'Interaction id from an earlier run: edit or extend that video')
  .option('--omni-task <task>', `Mode fallback when the prompt does not select it (${OMNI_TASKS.join(', ')})`)
  .option('--omni-delivery <mode>', "'inline' (default) or 'uri' (Google recommends uri over 4 MB)");

// General options
program
  .option('-o, --output-dir <path>', 'Output directory for generated images', DEFAULT_OUTPUT_DIR)
  .option('--api-key <key>', 'Google GenAI API key')
  .option('--log-level <level>', 'Logging level (debug, info, warn, error)', 'info')
  .option('--examples', 'Show usage examples')
  .option('-h, --help', 'Display help');

// Veo was removed in 3.0 (Google shut its models down). Checked before parsing:
// commander would reject a 2.x flag such as --veo-duration as an unknown option
// and never reach a message that says what happened.
if (process.argv.slice(2).some((arg) => /^--veo(-|=|$)/.test(arg))) {
  console.error(
    'Error: --veo and the --veo-* flags were removed in 3.0. Google shut down every Veo model on the\n' +
      'Gemini API on 2026-10-22. Use --omni (Gemini Omni Flash): --veo-aspect-ratio, --veo-resolution,\n' +
      '--veo-duration and --veo-image become --omni-aspect-ratio, --omni-resolution, --omni-duration and\n' +
      '--omni-image. There is no negative prompt or person-generation setting: write negatives into the\n' +
      'prompt (e.g. "No dialogue").\n'
  );
  process.exit(1);
}

// Parse arguments
program.parse(process.argv);
const options = program.opts<CliOptions>();

// `-h, --help` is registered as a plain option (so it can sit in the option list),
// which replaces commander's own help handling; without this it fell through to
// the "no mode selected" exit 1 below. 1.x had the same bug.
if (options.help) {
  program.outputHelp();
  process.exit(0);
}

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
if (!imageMode && !options.video && !options.omni) {
  console.error('Error: no mode selected. Use --gemini (or --model <id>), --omni, or --video.\n');
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
const modesSelected = [imageMode, options.video, options.omni].filter(Boolean).length;

// Ensure only one mode is selected
if (modesSelected > 1) {
  if (options.video && (imageMode || options.omni)) {
    console.error(
      'Error: --video cannot be used with --gemini, --gemini-3-pro, --model, or --omni.'
    );
    console.error(`Video analysis uses ${MODELS.GEMINI_VIDEO} automatically.\n`);
  } else if (options.omni && imageMode) {
    console.error('Error: --omni cannot be used with --gemini, --gemini-3-pro, or --model.');
    console.error('Omni is for video generation; use --omni-model to choose an Omni model.\n');
  } else {
    console.error(
      'Error: Cannot use multiple model modes. Please choose one: --gemini, --gemini-3-pro, --video, or --omni.\n'
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
  console.error('Error: --prompt is required. Example: google-genai --gemini --prompt "a red apple"\n');
  program.outputHelp();
  process.exit(1);
}

// Prompts finished before a failure, for the summary in main()'s catch: a batch
// stops at the first failed prompt, and 1.x did not say which ones had landed.
let completedPrompts = 0;
let totalPrompts = 0;

/**
 * Handle video analysis mode.
 * Uploads video once and processes all prompts.
 *
 * @param apiKey - Google GenAI API key
 * @param prompts - Array of analysis prompts
 */
/** File extension for an image MIME type; `png` for anything unrecognised. */
function extensionFor(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

async function handleVideoMode(apiKey: string, prompts: string[], inputVideo: string): Promise<void> {
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
    logger.info(`Uploading video: ${inputVideo}`);

    const uploadSpinner = createSpinner('Uploading and processing video...');
    uploadSpinner.start();

    try {
      uploadedFile = await videoApi.uploadVideoFile(inputVideo);
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
      completedPrompts = i;
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
      } catch (error) {
        analyzeSpinner.stop('✗ Analysis failed\n');
        throw error;
      }
      if (!response.candidates?.[0]?.content?.parts) {
        analyzeSpinner.stop('✗ No analysis returned\n');
        throw new Error(`${MODELS.GEMINI_VIDEO} returned no analysis (${noOutputReason(response)})`);
      }
      analyzeSpinner.stop('✓ Analysis complete\n');

      // Extract analysis and metadata
      const { text: analysisText, frames } = extractVideoMetadata(response);

      // Generate filenames
      const baseFilename = generateFilename(prompt);
      const mdFilename = baseFilename.replace(/\.[^.]+$/, '.md');
      const jsonFilename = baseFilename.replace(/\.[^.]+$/, '.json');

      const mdPath = path.join(outputDir, mdFilename);
      const jsonPath = path.join(outputDir, jsonFilename);

      // Save analysis as markdown
      const videoBasename = path.basename(inputVideo);
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
        logger.warn(`Failed to delete video file: ${errorMessage(error)}`);
        // Best-effort cleanup - don't fail if deletion fails
      }
    }
  }
}

/**
 * Run one Omni generation behind a spinner that shows elapsed time: the call is
 * synchronous and can take minutes.
 */
async function generateWithSpinner(omniApi: GoogleGenAIOmniAPI, params: OmniGenerateParams): Promise<OmniResult> {
  const started = Date.now();
  const spinner = createSpinner('Generating video...');
  spinner.start();
  const tick = setInterval(() => spinner.update(`Generating video... (${Math.floor((Date.now() - started) / 1000)}s)`), 1000);
  try {
    const result = await omniApi.generate(params);
    spinner.stop(`✓ Video generated in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    return result;
  } catch (error) {
    spinner.stop('✗ Generation failed');
    throw error;
  } finally {
    clearInterval(tick);
  }
}

/**
 * Handle Omni video generation mode. Each prompt is its own interaction; with
 * --omni-previous every prompt continues that same earlier interaction.
 */
async function handleOmniMode(apiKey: string, prompts: string[]): Promise<void> {
  const omniApi = new GoogleGenAIOmniAPI(apiKey, options.logLevel, clientOptions);
  const model = options.omniModel || OMNI_MODELS.OMNI_1_2_FLASH;
  const outputDir = path.join(options.outputDir || DEFAULT_OUTPUT_DIR, 'omni', model.replace(/[^a-z0-9.-]/gi, '-'));
  await ensureDirectory(outputDir);

  // Inputs shared by every prompt: read (and uploaded) once.
  const images = [];
  for (const imagePath of options.omniImage ?? []) {
    logger.info(`Loading input image: ${imagePath}`);
    images.push(await imageToInlineData(imagePath));
  }
  let uploaded: VideoUploadResult | undefined;
  const videoApi = options.omniVideo ? new GoogleGenAIVideoAPI(apiKey, options.logLevel) : undefined;
  try {
    if (videoApi && options.omniVideo) {
      console.log(`Uploading video: ${options.omniVideo}`);
      uploaded = await videoApi.uploadVideoFile(options.omniVideo);
    }

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      completedPrompts = i;
      console.log(`\nProcessing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

      const params: OmniGenerateParams = { prompt, model };
      if (options.omniAspectRatio !== undefined) params.aspectRatio = options.omniAspectRatio;
      if (options.omniResolution !== undefined) params.resolution = options.omniResolution;
      if (options.omniDuration !== undefined) params.durationSeconds = options.omniDuration;
      if (images.length > 0) params.images = images;
      if (uploaded) params.video = { uri: uploaded.uri, mimeType: uploaded.mimeType };
      if (options.omniPrevious !== undefined) params.previousInteractionId = options.omniPrevious;
      if (options.omniTask !== undefined) params.task = options.omniTask;
      // SAFETY: raw CLI text; the client rejects anything but 'inline' / 'uri' (shape) before sending.
      if (options.omniDelivery !== undefined) params.delivery = options.omniDelivery as OmniDelivery;

      const result = await generateWithSpinner(omniApi, params);
      const videoPath = path.join(outputDir, generateFilename(prompt, 'mp4', 40));
      const saved = await omniApi.saveVideo(result, videoPath);
      console.log(`✓ Saved video: ${saved.path} (${(saved.bytes / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`  Interaction: ${result.interactionId}  (edit or extend it: --omni-previous ${result.interactionId})`);
      if (result.text) console.log(`  Model said: ${result.text}`);

      const metadataPath = videoPath.replace(/\.mp4$/i, '.json');
      await saveMetadata(metadataPath, {
        interaction_id: result.interactionId,
        model: result.model,
        timestamp: new Date().toISOString(),
        parameters: {
          prompt,
          ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
          ...(params.resolution && { resolution: params.resolution }),
          ...(params.durationSeconds !== undefined && { durationSeconds: params.durationSeconds }),
          ...(options.omniImage && { inputImages: options.omniImage }),
          ...(options.omniVideo && { inputVideo: options.omniVideo }),
          ...(params.previousInteractionId && { previousInteractionId: params.previousInteractionId }),
          ...(params.task && { task: params.task }),
        },
        result: { video_path: saved.path, bytes: saved.bytes, ...(result.text && { text: result.text }) },
      });
      console.log(`✓ Saved metadata: ${metadataPath}`);
    }
    console.log(`\n✓ All done! Generated ${prompts.length} video(s)\n`);
  } finally {
    if (videoApi && uploaded?.uri) {
      try {
        await videoApi.deleteVideoFile(uploaded.uri);
      } catch (error) {
        logger.warn(`Failed to delete uploaded video: ${errorMessage(error)}`);
      }
    }
  }
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

    // Checked at startup; repeated here because `options` is not narrowed across scopes.
    if (!options.prompt || options.prompt.length === 0) throw new Error('--prompt is required');
    const prompts = Array.isArray(options.prompt) ? options.prompt : [options.prompt];
    totalPrompts = prompts.length;

    // ========================================================================
    // OMNI VIDEO GENERATION MODE
    // ========================================================================
    if (options.omni) {
      await handleOmniMode(apiKey, prompts);
      return;
    }

    // ========================================================================
    // VIDEO ANALYSIS MODE
    // ========================================================================
    if (options.video) {
      // Checked at startup; repeated here because `options` is not narrowed across scopes.
      if (!options.inputVideo) throw new Error('--video requires --input-video <path>');
      await handleVideoMode(apiKey, prompts, options.inputVideo);
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
      completedPrompts = i;

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
      const totalImages = parts.filter((p) => p.type === 'image' && p.data).length;
      // One stem per prompt, so the metadata's name matches its images' (1.x made
      // a second timestamp, which could differ by a second).
      const stem = path.parse(generateFilename(prompt, 'json')).name;

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];

        if (part.type === 'image' && part.data) {
          imageCount++;

          // Extension from the bytes' MIME type: the current models return JPEG,
          // which 1.x wrote to `.png` files. Index suffix only when there are several.
          const suffix = totalImages > 1 ? `_${imageCount}` : '';
          const filename = `${stem}${suffix}.${extensionFor(part.mimeType)}`;

          const imagePath = path.join(outputDirPath, filename);

          // Save image
          await saveBase64Image(part.data, imagePath, part.mimeType);
          savedFiles.push(filename);

          console.log(`✓ Saved image: ${imagePath}`);
        } else if (part.type === 'text') {
          // Log text parts (Gemini may return text descriptions)
          logger.debug(`Text part: ${part.content}`);
        }
      }

      // Save metadata
      const metadataFilename = `${stem}.json`;
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
          `${model} returned no image (${noOutputReason(response)}). Metadata: ${metadataPath}`
        );
      }

      console.log(`✓ Generated ${imageCount} image(s) successfully\n`);
    }

    console.log(`\n✓ All done! Processed ${prompts.length} prompt(s)\n`);
  } catch (error) {
    console.error(`\n✗ Error: ${errorMessage(error)}\n`);
    if (totalPrompts > 1) {
      console.error(
        `Completed ${completedPrompts} of ${totalPrompts} prompts before this failure; ` +
          `their files are in ${options.outputDir || DEFAULT_OUTPUT_DIR}. Prompt ${completedPrompts + 1} failed.\n`
      );
    }
    logger.error(error instanceof Error && error.stack ? error.stack : errorMessage(error));
    process.exit(1);
  }
}

// Run main function (it catches everything and exits itself)
void main();
