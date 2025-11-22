#!/usr/bin/env node
/**
 * Video Understanding Live Test
 *
 * Tests the GoogleGenAIVideoAPI with 4 generated videos,
 * each with progressively more complex prompts.
 *
 * Usage: GOOGLE_GENAI_API_KEY=your-key node examples/video-understanding-test.js
 */

import { GoogleGenAIVideoAPI } from '../video-api.js';
import { getGoogleGenAIApiKey } from '../config.js';
import fs from 'fs/promises';
import path from 'path';

async function runTests() {
  console.log('='.repeat(60));
  console.log('Video Understanding Live Test');
  console.log('='.repeat(60));
  console.log();

  // Get API key
  let apiKey;
  try {
    apiKey = getGoogleGenAIApiKey();
    console.log('API key found');
  } catch (error) {
    console.error('Error: No API key found.');
    console.error('Set GOOGLE_GENAI_API_KEY environment variable');
    process.exit(1);
  }

  // Initialize API
  const api = new GoogleGenAIVideoAPI(apiKey, 'info');

  // Find our generated videos
  const veoDir = './datasets/google/veo';
  const liveTestDir = './datasets/google/veo-live-test';

  // Collect video files
  const videos = [];

  // Check veo directories
  for (const dir of [veoDir, liveTestDir]) {
    try {
      const subDirs = await fs.readdir(dir);
      for (const subDir of subDirs) {
        const fullPath = path.join(dir, subDir);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          const files = await fs.readdir(fullPath);
          for (const file of files) {
            if (file.endsWith('.mp4')) {
              videos.push(path.join(fullPath, file));
            }
          }
        } else if (fullPath.endsWith('.mp4')) {
          videos.push(fullPath);
        }
      }
    } catch (e) {
      // Directory doesn't exist, skip
    }
  }

  if (videos.length === 0) {
    console.error('No videos found in datasets/google/veo or datasets/google/veo-live-test');
    process.exit(1);
  }

  // Select up to 4 videos
  const selectedVideos = videos.slice(0, 4);
  console.log(`Found ${videos.length} videos, testing ${selectedVideos.length}`);
  console.log();

  // Define test prompts with increasing complexity
  const testPrompts = [
    {
      name: 'Basic Description',
      prompt: 'Describe what is happening in this video in 2-3 sentences.'
    },
    {
      name: 'Detailed Analysis',
      prompt: 'Analyze this video in detail. Describe the main subject, the action taking place, the visual style, and the overall mood or atmosphere.'
    },
    {
      name: 'Technical Analysis',
      prompt: 'Provide a technical analysis of this video: camera movement, lighting, color palette, composition, and any notable visual effects or editing techniques.'
    },
    {
      name: 'Creative Interpretation',
      prompt: 'Watch this video and provide: 1) A factual description, 2) The emotional tone it conveys, 3) A creative title for it, and 4) What story or message it might be trying to tell.'
    }
  ];

  const results = [];

  for (let i = 0; i < selectedVideos.length; i++) {
    const videoPath = selectedVideos[i];
    const test = testPrompts[i % testPrompts.length];

    console.log('-'.repeat(60));
    console.log(`Test ${i + 1}: ${test.name}`);
    console.log(`Video: ${path.basename(videoPath)}`);
    console.log(`Prompt: "${test.prompt.substring(0, 60)}..."`);
    console.log();

    const startTime = Date.now();

    try {
      // Upload video
      console.log('Uploading video...');
      const file = await api.uploadVideoFile(videoPath);
      console.log(`Uploaded: ${file.name} (${file.state})`);

      // Generate content
      console.log('Analyzing video...');
      const response = await api.generateFromVideo({
        prompt: test.prompt,
        fileUri: file.uri,
        mimeType: file.mimeType
      });

      // Extract text from response
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Save analysis as markdown
      const videoBasename = path.basename(videoPath, '.mp4');
      const mdPath = videoPath.replace('.mp4', '-analysis.md');
      const mdContent = `# Video Analysis: ${videoBasename}

## Prompt
${test.prompt}

## Analysis
${text}

---
*Generated: ${new Date().toISOString()}*
*Duration: ${duration}s*
`;
      await fs.writeFile(mdPath, mdContent);

      console.log();
      console.log('Response:');
      console.log('-'.repeat(40));
      console.log(text);
      console.log('-'.repeat(40));
      console.log(`Duration: ${duration}s`);
      console.log(`Saved: ${mdPath}`);
      console.log();

      // Cleanup - delete uploaded file
      await api.deleteVideoFile(file.uri);

      results.push({
        test: test.name,
        video: path.basename(videoPath),
        status: 'SUCCESS',
        duration: `${duration}s`,
        responseLength: text.length
      });

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Error: ${error.message}`);
      console.log();

      results.push({
        test: test.name,
        video: path.basename(videoPath),
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
    console.log(`    Video: ${result.video}`);
    if (result.status === 'SUCCESS') {
      console.log(`    Response: ${result.responseLength} chars`);
    } else {
      console.log(`    Error: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  console.log();
  console.log(`Results: ${successCount}/${results.length} analyses completed successfully`);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
