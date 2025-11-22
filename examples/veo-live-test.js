#!/usr/bin/env node
/**
 * Veo Video Generation Live Test
 *
 * Creates 4 videos with progressively more parameters:
 * 1. Basic text-to-video (prompt only)
 * 2. + aspect ratio and duration
 * 3. + resolution and negative prompt
 * 4. + person generation option
 *
 * Usage: GOOGLE_GENAI_API_KEY=your-key node examples/veo-live-test.js
 */

import { GoogleGenAIVeoAPI, VEO_MODELS } from '../veo-api.js';
import { getGoogleGenAIApiKey } from '../config.js';
import { ensureDirectory } from '../utils.js';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = './datasets/google/veo-live-test';

async function runTests() {
  console.log('='.repeat(60));
  console.log('Veo Video Generation Live Test');
  console.log('='.repeat(60));
  console.log();

  // Get API key
  let apiKey;
  try {
    apiKey = getGoogleGenAIApiKey();
    console.log('API key found');
  } catch (error) {
    console.error('Error: No API key found.');
    console.error('Set GOOGLE_GENAI_API_KEY environment variable or create .env file');
    process.exit(1);
  }

  // Initialize API
  const api = new GoogleGenAIVeoAPI(apiKey, 'info');

  // Ensure output directory
  await ensureDirectory(OUTPUT_DIR);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log();

  // Define test cases with progressive complexity
  const testCases = [
    {
      name: 'Video 1: Basic Text-to-Video',
      description: 'Minimal parameters - just a prompt',
      params: {
        prompt: 'A golden retriever running through a field of sunflowers on a sunny day'
      }
    },
    {
      name: 'Video 2: With Aspect Ratio & Duration',
      description: 'Adding aspectRatio (9:16 vertical) and duration (6s)',
      params: {
        prompt: 'A cup of coffee with steam rising, camera slowly zooms in, cozy cafe atmosphere',
        aspectRatio: '9:16',
        durationSeconds: 6
      }
    },
    {
      name: 'Video 3: With Resolution & Negative Prompt',
      description: 'Adding 1080p resolution (requires 8s) and negative prompt',
      params: {
        prompt: 'Aerial drone shot flying over a misty mountain forest at sunrise, cinematic',
        aspectRatio: '16:9',
        resolution: '1080p',
        durationSeconds: 8,  // Required for 1080p
        negativePrompt: 'blurry, low quality, distorted, watermark'
      }
    },
    {
      name: 'Video 4: Fast Model with Parameters',
      description: 'Using fast model for quicker generation with custom aspect ratio',
      params: {
        prompt: 'A chef preparing sushi in a traditional Japanese restaurant, skilled hands cutting fish',
        model: VEO_MODELS.VEO_3_1_FAST,  // Use fast model for quicker generation
        aspectRatio: '16:9',
        durationSeconds: 6,
        negativePrompt: 'cartoon, animated, cgi, fake'
      }
    }
  ];

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log('-'.repeat(60));
    console.log(`${test.name}`);
    console.log(`Description: ${test.description}`);
    console.log(`Parameters: ${JSON.stringify(test.params, null, 2)}`);
    console.log();

    const startTime = Date.now();

    try {
      // Generate video
      console.log('Starting video generation...');
      const operation = await api.generateVideo(test.params);
      console.log(`Operation started: ${operation.name}`);

      // Wait for completion with progress updates
      console.log('Waiting for video generation to complete...');
      const result = await api.waitForCompletion(operation, {
        pollInterval: 5000,  // Check every 5 seconds
        timeout: 600000      // 10 minute timeout
      });

      // Extract video
      const video = api.extractVideo(result);

      if (!video) {
        throw new Error('No video returned in result');
      }

      // Download video
      const outputPath = path.join(OUTPUT_DIR, `video-${i + 1}-${Date.now()}.mp4`);
      console.log(`Downloading video to: ${outputPath}`);

      await api.downloadVideo(result, outputPath);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Save metadata
      const metadata = {
        testCase: test.name,
        description: test.description,
        params: test.params,
        operation: operation.name,
        outputPath,
        duration: `${duration}s`,
        timestamp: new Date().toISOString()
      };

      const metadataPath = outputPath.replace('.mp4', '.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`Video saved successfully!`);
      console.log(`Duration: ${duration}s`);
      console.log();

      results.push({
        test: test.name,
        status: 'SUCCESS',
        outputPath,
        duration: `${duration}s`
      });

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Error: ${error.message}`);
      console.log();

      results.push({
        test: test.name,
        status: 'FAILED',
        error: error.message,
        duration: `${duration}s`
      });
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    const icon = result.status === 'SUCCESS' ? '[OK]' : '[FAIL]';
    console.log(`${icon} ${result.test} (${result.duration})`);
    if (result.status === 'SUCCESS') {
      console.log(`    Output: ${result.outputPath}`);
    } else {
      console.log(`    Error: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  console.log();
  console.log(`Results: ${successCount}/${results.length} videos generated successfully`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
