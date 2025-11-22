# Google GenAI Image & Video Generation Service

[![npm version](https://img.shields.io/npm/v/google-genai-api.svg)](https://www.npmjs.com/package/google-genai-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/google-genai-api)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-354%20passing-brightgreen)](test/)

A Node.js wrapper for the [Google GenAI API](https://ai.google.dev/gemini-api/docs) that provides easy access to Gemini 2.5 Flash Image, Imagen 4, and Veo 3.1 models. Generate stunning AI images and videos with advanced editing capabilities through a simple command-line interface.

This service follows the data-collection architecture pattern with organized data storage, comprehensive logging, and CLI orchestration.

## Quick Start

### CLI Usage
```bash
# Install globally
npm install -g google-genai-api

export GOOGLE_GENAI_API_KEY="your-api-key"

# Generate images with Gemini
google-genai --gemini --prompt "a serene mountain landscape"

# Generate images with Imagen
google-genai --imagen --prompt "futuristic cityscape" --number-of-images 4

# Generate videos with Veo 3.1
google-genai veo --prompt "a cat playing piano" --duration 8
```

### Programmatic Usage
```javascript
import { GoogleGenAIAPI } from 'google-genai-api';
import { GoogleGenAIVeoAPI } from 'google-genai-api/veo';

const api = new GoogleGenAIAPI('your-api-key');
const veo = new GoogleGenAIVeoAPI('your-api-key');

// Text-to-image with Gemini
const response = await api.generateWithGemini({
  prompt: 'a serene mountain landscape',
  aspectRatio: '16:9'
});

// Text-to-video with Veo 3.1
const video = await veo.generateVideo({
  prompt: 'a cat playing piano in a jazz club',
  aspectRatio: '16:9',
  durationSeconds: 8
});
// video.generatedVideos[0].video contains the video file
```

## Table of Contents

- [Overview](#overview)
- [Public API](#public-api)
- [Models](#models)
- [Authentication Setup](#authentication-setup)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
- [API Methods](#api-methods)
- [Examples](#examples)
- [Data Organization](#data-organization)
- [Security Features](#security-features)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)

## Overview

The Google GenAI API provides access to cutting-edge image generation and editing models. This Node.js service implements:

- **3 Models** - Gemini 2.5 Flash Image, Imagen 4, Gemini 2.5 Flash (Video)
- **3 Generation Modes** - Text-to-image, image-to-image, semantic masking
- **Video Understanding** - Upload and analyze videos with natural language prompts
- **Multiple Outputs** - Generate 1-4 images per request with Imagen
- **SynthID Watermarking** - All images include built-in watermarking
- **Production Security** - API key redaction, error sanitization, HTTPS enforcement, comprehensive SSRF protection (including IPv4-mapped IPv6 bypass prevention)
- **DoS Prevention** - Request timeouts (30s API, 60s downloads), file size limits (50MB), redirect limits
- **Parameter Validation** - Pre-flight validation catches invalid parameters before API calls
- **API Key Authentication** - Multiple configuration methods with secure handling
- **Progress Indicators** - Custom spinner with status messages during generation
- **Batch Processing** - Generate multiple images sequentially from multiple prompts
- **Image Input Support** - Convert local files or URLs to inlineData format with validation
- **Organized Storage** - Structured directories with timestamped files and metadata
- **CLI Orchestration** - Command-line tool for easy batch generation
- **Comprehensive Testing** - 354 tests with Vitest for reliability

## Public API

When installed via npm, import from the package name:

### Main Exports (`google-genai-api`)

```javascript
import {
  GoogleGenAIAPI,       // Main API class for image generation
  GoogleGenAIVideoAPI,  // Video understanding API class
  extractGeminiParts,   // Extract parts from Gemini response
  extractImagenImages   // Extract images from Imagen response
} from 'google-genai-api';
```

### Veo Exports (`google-genai-api/veo`)

```javascript
import {
  GoogleGenAIVeoAPI,    // Veo video generation API class
  VEO_MODELS,           // Veo model names (3.1, 3.0, 2.0)
  VEO_MODES,            // Generation modes (text-to-video, image-to-video, etc.)
  VEO_TIMEOUTS          // Timeout configuration
} from 'google-genai-api/veo';
```

### Utility Exports (`google-genai-api/utils`)

```javascript
import {
  imageToInlineData,    // Convert local file/URL to inlineData format
  validateImageUrl,     // Validate and sanitize image URLs (SSRF protection)
  validateImagePath,    // Validate local image files (magic byte checking)
  validateVideoPath,    // Validate video files (format, size, magic bytes)
  saveBase64Image,      // Save base64 image data to file
  generateFilename,     // Generate timestamped filenames
  saveMetadata,         // Save generation metadata as JSON
  ensureDirectory,      // Create directories recursively
  pause,                // Async delay helper
  createSpinner,        // Create CLI spinner for progress
  setLogLevel,          // Set logging level
  logger,               // Winston logger instance
  formatTimeOffset,     // Format seconds to human-readable time
  extractVideoMetadata, // Extract metadata from video file
  // Veo-specific utilities
  imageToVeoInput,      // Convert image to Veo input format
  generateVeoOutputPath,// Generate output path for Veo videos
  saveVeoMetadata,      // Save Veo generation metadata
  createVeoSpinner,     // Create spinner for Veo operations
  parseVeoMetadata      // Parse Veo metadata from file
} from 'google-genai-api/utils';
```

### Config Exports (`google-genai-api/config`)

```javascript
import {
  getGoogleGenAIApiKey, // Get API key from environment/config
  validateApiKeyFormat, // Validate API key format (starts with AIzaSy)
  redactApiKey,         // Redact API key for logging (shows last 4 chars)
  MODELS,               // Model endpoint definitions
  MODEL_CONSTRAINTS,    // Model parameter constraints
  ASPECT_RATIOS,        // Valid aspect ratios array
  GEMINI_MODES,         // Generation mode constants
  DEFAULT_OUTPUT_DIR,   // Default output directory
  detectGeminiMode,     // Detect Gemini generation mode
  validateModelParams,  // Validate parameters before API calls
  // Video understanding exports
  VIDEO_MIME_TYPES,     // Supported video formats (mp4, webm, etc.)
  VIDEO_SIZE_LIMITS,    // File size limits (200MB max)
  VIDEO_TIMEOUTS,       // Upload/processing timeouts
  parseTimeOffset,      // Parse time offsets ("1:30", "90s", "1m30s")
  validateVideoParams,  // Validate video clipping parameters
  // Veo video generation exports
  VEO_MODELS,           // Veo model names
  VEO_ASPECT_RATIOS,    // Supported aspect ratios (16:9, 9:16)
  VEO_RESOLUTIONS,      // Supported resolutions (720p, 1080p)
  VEO_DURATIONS,        // Supported durations per model
  VEO_PERSON_GENERATION,// Person generation options
  VEO_TIMEOUTS,         // Veo timeout configuration
  VEO_MODES,            // Generation mode constants
  VEO_MODEL_CONSTRAINTS,// Model-specific constraints
  validateVeoParams     // Validate Veo parameters before API calls
} from 'google-genai-api/config';
```

**Note:** When running from source (development), use local path imports (`'./api.js'`, `'./utils.js'`, `'./config.js'`) as shown in the examples below.

## Models

### Gemini 2.5 Flash Image

Advanced image generation model with three powerful modes.

**Best for:** Versatile generation, natural language editing, semantic masking without explicit masks

**Features:**
- Text-to-image generation
- Image-to-image transformation
- Semantic masking (natural language editing)
- Automatic mode detection
- Mixed text and image outputs

**Parameters:**
- `prompt` - Generation or editing prompt (required)
- `aspectRatio` - Image proportions: 1:1, 3:4, 4:3, 9:16, 16:9 (default: 1:1)
- `inputImages` - Array of inlineData objects for editing (optional)

**Generation Modes:**

1. **Text-to-Image**: No input images
   ```bash
   google-genai --gemini --prompt "a serene mountain landscape" --aspect-ratio "16:9"
   ```

2. **Image-to-Image**: Transform existing images
   ```bash
   google-genai --gemini --prompt "Transform into watercolor painting" --input-image photo.jpg
   ```

3. **Semantic Masking**: Natural language editing without masks
   ```bash
   google-genai --gemini --prompt "Change the car to red" --input-image street_scene.jpg
   ```

### Imagen 4

High-quality photorealistic image generation with multiple outputs.

**Best for:** Production-quality images, photorealistic results, generating multiple variations

**Features:**
- Text-to-image generation only
- Generate 1-4 images per request
- Photorealistic quality
- SynthID watermarking

**Parameters:**
- `prompt` - Generation prompt (required)
- `numberOfImages` - Number of images to generate: 1-4 (default: 1)
- `aspectRatio` - Image proportions: 1:1, 3:4, 4:3, 9:16, 16:9 (default: 1:1)

**Example:**
```bash
google-genai --imagen --prompt "Professional product photography" --number-of-images 4
```

### Gemini 2.5 Flash (Video Understanding)

Video analysis and understanding using Gemini's multimodal capabilities.

**Best for:** Video content analysis, timestamp identification, summarization, Q&A about video content

**Features:**
- Upload videos via Files API (up to 200MB)
- Natural language video analysis
- Video clipping (analyze specific time ranges)
- Timestamp analysis
- Batch processing (multiple prompts per video)

**Supported Formats:**
- MP4, WebM, MOV, AVI, MPEG, FLV, MPG, WMV, 3GPP

**Parameters:**
- `prompt` - Analysis prompt (required)
- `fileUri` - Uploaded file URI (from uploadVideoFile)
- `mimeType` - Video MIME type
- `videoMetadata` - Optional clipping: `{ startOffset: "30s", endOffset: "1:30" }`

**Time Offset Formats:**
- Seconds: `"90s"` or `"90"`
- Minutes+seconds: `"1m30s"`
- MM:SS: `"1:30"`
- HH:MM:SS: `"1:15:30"`

**CLI Examples:**
```bash
# Basic video analysis
google-genai --video --input-video video.mp4 --prompt "What happens in this video?"

# Analyze specific time range
google-genai --video --input-video video.mp4 --prompt "Describe this scene" \
  --video-start "30s" --video-end "1:30"

# Multiple analysis prompts (single upload)
google-genai --video --input-video video.mp4 \
  --prompt "Summarize this video" \
  --prompt "List key moments with timestamps"
```

**Programmatic Example:**
```javascript
import { GoogleGenAIVideoAPI } from 'google-genai-api';

const api = new GoogleGenAIVideoAPI('your-api-key');

// Upload video (happens once)
const file = await api.uploadVideoFile('./video.mp4');

// Analyze video
const result = await api.generateFromVideo({
  prompt: 'What happens in this video?',
  fileUri: file.uri,
  mimeType: file.mimeType
});

// Analyze specific time range
const clip = await api.generateFromVideo({
  prompt: 'Describe this scene',
  fileUri: file.uri,
  mimeType: file.mimeType,
  videoMetadata: { startOffset: '30s', endOffset: '60s' }
});

// Clean up (best-effort)
await api.deleteVideoFile(file.uri);
```

## Authentication Setup

### 1. Get Your API Key

1. Visit [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API key" or use an existing key
4. Copy your API key (starts with `AIzaSy...`)

### 2. Configure Your API Key

You can provide your API key in multiple ways (listed in priority order):

#### Option A: CLI Flag (Highest Priority)
Pass the API key directly when running commands:

```bash
google-genai --api-key YOUR_API_KEY --gemini --prompt "a cat"
```

This is useful for one-off commands or testing.

#### Option B: Environment Variable
Set the `GOOGLE_GENAI_API_KEY` environment variable in your shell:

```bash
# Add to your ~/.bashrc, ~/.zshrc, or equivalent
export GOOGLE_GENAI_API_KEY=your_actual_api_key_here

# Or use it for a single command
GOOGLE_GENAI_API_KEY=your_key google-genai --gemini --prompt "a cat"
```

This is ideal for CI/CD pipelines and server environments.

#### Option C: Local .env File (Project-Specific)
Create a `.env` file in your project directory:

```bash
# In your project directory
echo "GOOGLE_GENAI_API_KEY=your_actual_api_key_here" > .env
```

This is best for project-specific configurations and when working on multiple projects.

#### Option D: Global Config (For Global npm Installs)
Create a global config file at `~/.google-genai/.env`:

```bash
# Create config directory
mkdir -p ~/.google-genai

# Add your API key
echo "GOOGLE_GENAI_API_KEY=your_actual_api_key_here" > ~/.google-genai/.env
```

This is perfect for global npm installations where you want the API key available everywhere.

**Security Note:** Never commit `.env` files or expose your API key publicly. The `.env` file is automatically ignored by git.

## Installation

### Option 1: Install from npm

```bash
# Install globally for CLI usage
npm install -g google-genai-api

# Or install locally in your project
npm install google-genai-api
```

### Option 2: Install from source

```bash
# Clone the repository
git clone https://github.com/aself101/google-genai-api.git
cd google-genai-api

# Install dependencies
npm install
```

Dependencies:
- `@google/genai` - Official Google GenAI SDK
- `axios` - HTTP client for image downloads
- `commander` - CLI argument parsing
- `dotenv` - Environment variable management
- `winston` - Logging framework

## CLI Usage

### Basic Command Structure

```bash
# Global install
google-genai [model] [options]

# Local install (use npx)
npx google-genai [model] [options]

# From source (development)
node cli.js [model] [options]
```

### Model Selection (Required)

Choose one model:

```bash
--gemini         # Gemini 2.5 Flash Image
--imagen         # Imagen 4
```

### Common Options

```bash
--prompt <text>               # Prompt (can specify multiple for batch)
--aspect-ratio <ratio>        # 1:1, 3:4, 4:3, 9:16, 16:9 (default: 1:1)
--output-dir <path>           # Custom output directory
--log-level <level>           # debug, info, warn, error (default: info)
--examples                    # Show usage examples
```

**Note**: All parameters are validated before making API calls. Invalid values (e.g., invalid aspect ratio) will produce clear error messages, saving API credits.

### Gemini Specific Options

```bash
--input-image <path>          # Input image for editing (file path or URL)
--aspect-ratio <ratio>        # Image aspect ratio (default: 1:1)
```

### Imagen Specific Options

```bash
--number-of-images <number>   # Number of images: 1-4 (default: 1)
--aspect-ratio <ratio>        # Image aspect ratio (default: 1:1)
```

**Note**: Imagen only supports text-to-image. The `--input-image` option is only available for Gemini.

### Utility Commands

```bash
--examples                    # Show usage examples with tips
--help                        # Display help information
```

## API Methods

### Core Generation Methods

#### `generateWithGemini(params)`

Generate or edit images using Gemini 2.5 Flash Image.

**Text-to-Image:**
```javascript
const response = await api.generateWithGemini({
  prompt: 'a serene mountain landscape',
  aspectRatio: '16:9'
});

// Extract parts (may include text and images)
const parts = extractGeminiParts(response);
```

**Image-to-Image:**
```javascript
import { imageToInlineData } from 'google-genai-api/utils';

const inputImage = await imageToInlineData('./photo.jpg');

const response = await api.generateWithGemini({
  prompt: 'Transform into watercolor painting',
  inputImages: [inputImage],
  aspectRatio: '1:1'
});
```

**Semantic Masking:**
```javascript
import { imageToInlineData } from 'google-genai-api/utils';

const inputImage = await imageToInlineData('./street_scene.jpg');

const response = await api.generateWithGemini({
  prompt: 'Change the car to red',
  inputImages: [inputImage]
});
```

**Parameters:**
- `prompt` (string, required) - Generation or editing prompt
- `inputImages` (array, optional) - Array of `{ mimeType, data }` objects
- `aspectRatio` (string, optional) - 1:1, 3:4, 4:3, 9:16, 16:9 (default: 1:1)
- `mode` (string, optional) - Override auto-detection: text-to-image, image-to-image, semantic-masking

**Returns:** Response object with `candidates[0].content.parts[]` array

#### `generateWithImagen(params)`

Generate high-quality images using Imagen 4.

```javascript
const response = await api.generateWithImagen({
  prompt: 'Professional product photography of a watch',
  numberOfImages: 4,
  aspectRatio: '1:1'
});

// Extract images
const images = extractImagenImages(response);
// images[0..3] contain image data
```

**Parameters:**
- `prompt` (string, required) - Generation prompt
- `numberOfImages` (number, optional) - 1-4 images (default: 1)
- `aspectRatio` (string, optional) - 1:1, 3:4, 4:3, 9:16, 16:9 (default: 1:1)

**Returns:** Response object with `generatedImages[]` array

### Utility Functions

#### `extractGeminiParts(response)`

Extract parts from Gemini response.

```javascript
import { extractGeminiParts } from 'google-genai-api';

const parts = extractGeminiParts(response);

parts.forEach(part => {
  if (part.type === 'text') {
    console.log('Text:', part.content);
  } else if (part.type === 'image') {
    console.log('Image:', part.mimeType, part.data.length);
  }
});
```

**Returns:** Array of parts with `{ type, content/mimeType/data }`

#### `extractImagenImages(response)`

Extract images from Imagen response.

```javascript
import { extractImagenImages } from 'google-genai-api';

const images = extractImagenImages(response);

images.forEach((img, idx) => {
  console.log(`Image ${idx}:`, img.mimeType, img.data.length);
});
```

**Returns:** Array of images with `{ type, mimeType, data }`

#### `imageToInlineData(imageSource)`

Convert local file or URL to inlineData format.

```javascript
import { imageToInlineData } from 'google-genai-api/utils';

// From local file
const data1 = await imageToInlineData('./photo.jpg');

// From URL
const data2 = await imageToInlineData('https://example.com/image.png');

// Returns: { mimeType: 'image/jpeg', data: 'base64...' }
```

### Logger Methods

#### `setLogLevel(level)`

Change logger verbosity.

```javascript
api.setLogLevel('debug');  // debug, info, warn, error
```

## Examples

**Note:** Examples use `google-genai` command (global install). For local install, use `npx google-genai` instead. For development from source, use `node cli.js`.

### Example 1: Basic Text-to-Image (Gemini)

```bash
google-genai --gemini \
  --prompt "A serene mountain landscape at sunset" \
  --aspect-ratio "16:9"
```

### Example 2: Image Transformation (Gemini)

```bash
google-genai --gemini \
  --prompt "Transform into watercolor painting style" \
  --input-image ./photo.jpg \
  --aspect-ratio "1:1"
```

### Example 3: Semantic Masking (Gemini)

```bash
google-genai --gemini \
  --prompt "Change the car to red" \
  --input-image ./street_scene.jpg
```

### Example 4: High-Quality Generation (Imagen)

```bash
google-genai --imagen \
  --prompt "Futuristic cityscape at night" \
  --aspect-ratio "16:9"
```

### Example 5: Multiple Image Generation (Imagen)

```bash
google-genai --imagen \
  --prompt "Character design concepts" \
  --number-of-images 4 \
  --aspect-ratio "1:1"
```

### Example 6: Batch Processing

```bash
google-genai --gemini \
  --prompt "a red apple" \
  --prompt "a green apple" \
  --prompt "a yellow apple" \
  --aspect-ratio "1:1"
```

### Example 7: Custom Output Directory

```bash
google-genai --gemini \
  --prompt "test generation" \
  --output-dir ./my-outputs
```

### Example 8: Debug Logging

```bash
google-genai --imagen \
  --prompt "debug test" \
  --log-level debug
```

### Example 9: Using API Class in Code

```javascript
// If installed via npm
import { GoogleGenAIAPI, extractGeminiParts } from 'google-genai-api';
import { imageToInlineData, saveBase64Image } from 'google-genai-api/utils';

// If running from source
import { GoogleGenAIAPI, extractGeminiParts } from './api.js';
import { imageToInlineData, saveBase64Image } from './utils.js';

const api = new GoogleGenAIAPI('your-api-key', 'debug');

// Text-to-image
const response = await api.generateWithGemini({
  prompt: 'a serene mountain landscape',
  aspectRatio: '16:9'
});

const parts = extractGeminiParts(response);

for (const part of parts) {
  if (part.type === 'image') {
    await saveBase64Image(part.data, './output.png', part.mimeType);
    console.log('Image saved!');
  }
}
```

### Example 10: Image-to-Image with Code

```javascript
import { GoogleGenAIAPI, extractGeminiParts } from './api.js';
import { imageToInlineData, saveBase64Image } from './utils.js';

const api = new GoogleGenAIAPI('your-api-key');

// Convert input image
const inputImage = await imageToInlineData('./photo.jpg');

// Generate
const response = await api.generateWithGemini({
  prompt: 'Make it sunset',
  inputImages: [inputImage],
  aspectRatio: '16:9'
});

// Save result
const parts = extractGeminiParts(response);
for (const part of parts) {
  if (part.type === 'image') {
    await saveBase64Image(part.data, './sunset.png', part.mimeType);
  }
}
```

## Data Organization

Generated images and metadata are organized by model:

```
datasets/
└── google/
    ├── gemini-2.5-flash-image/
    │   ├── 20251119_021155_a-red-sports-car.png
    │   ├── 20251119_021155_a-red-sports-car.json
    │   └── ...
    └── imagen-4.0-generate-001/
        ├── 20251119_022305_futuristic-cityscape-1.png
        ├── 20251119_022305_futuristic-cityscape-2.png
        ├── 20251119_022305_futuristic-cityscape.json
        └── ...
```

**Metadata Format:**

```json
{
  "model": "gemini-2.5-flash-image",
  "timestamp": "2025-11-19T02:11:55.123Z",
  "prompt": "a red sports car",
  "parameters": {
    "aspectRatio": "16:9"
  },
  "outputs": [
    {
      "type": "image",
      "filename": "20251119_021155_a-red-sports-car.png"
    }
  ]
}
```

## Security Features

This service implements production-ready security measures to protect your API keys and prevent common vulnerabilities:

### API Key Protection
- **Redacted Logging**: API keys are never logged in full. Logs show only the last 4 characters (e.g., `xxx...abc1234`)
- **Secure Storage**: API keys read from environment variables or `.env` files (never committed to version control)
- **Multiple Sources**: Supports CLI flags, environment variables, local `.env`, and global config

### Error Message Sanitization
- **Production Mode**: Set `NODE_ENV=production` to enable generic error messages
- **Development Mode**: Detailed error messages for debugging (default)
- **Information Disclosure Prevention**: Production errors don't reveal internal system details

```bash
# Enable production mode for sanitized errors
export NODE_ENV=production
google-genai --gemini --prompt "a cat"
```

### SSRF Protection (Server-Side Request Forgery)
When processing image URLs (for `--input-image`), the service validates and blocks:
- **Localhost Access**: `127.0.0.1`, `::1`, `localhost`
- **Private IP Ranges**: `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`
- **Link-Local Addresses**: `169.254.x.x` (AWS/Azure metadata endpoints)
- **Cloud Metadata**: `metadata.google.internal`, `169.254.169.254`
- **IPv4-Mapped IPv6 Bypass Prevention**: Detects and blocks `[::ffff:127.0.0.1]`, `[::ffff:10.0.0.1]`, etc.
- **DNS Rebinding Prevention**: Performs DNS resolution to block domains that resolve to internal/private IPs (prevents TOCTOU attacks via wildcard DNS services like nip.io)
- **HTTP URLs**: Only HTTPS URLs are accepted

This prevents attackers from using the service to access internal network resources, including sophisticated bypass attempts using IPv4-mapped IPv6 addresses and DNS rebinding attacks.

### Image File Validation
- **Magic Byte Checking**: Validates PNG, JPEG, WebP, and GIF formats by actual file headers (not just extensions)
- **File Size Limits**: 50MB maximum for downloaded images (prevents memory exhaustion)
- **Format Verification**: Rejects non-image files masquerading as images
- **Download Timeouts**: 60-second timeout for image downloads (prevents slowloris attacks)

### HTTPS Enforcement
- All image URLs must use HTTPS protocol
- HTTP URLs are rejected with clear error messages
- Prevents man-in-the-middle attacks

### Request Timeout & Size Protection
- **API Request Timeout**: 30-second timeout for all API calls
- **Download Timeout**: 60-second timeout for image downloads
- **Maximum File Size**: 50MB limit for downloaded images
- **Redirect Limits**: Maximum 5 redirects to prevent redirect loops
- **DoS Prevention**: Prevents resource exhaustion and slowloris-style attacks

### Parameter Validation
- Pre-flight validation using `validateModelParams()` before API calls
- Catches invalid parameters early (saves API credits)
- Validates:
  - Aspect ratios (must be from valid set: 1:1, 3:4, 4:3, 9:16, 16:9)
  - Number of images (1-4 for Imagen)
  - Input images (Gemini only, not supported by Imagen)
  - Prompt length (max 10,000 characters)

## Error Handling

The service includes comprehensive error handling:

### API Errors

- **Authentication (401)**: Invalid API key
  ```
  Error: Authentication failed. Check API key.
  ```

- **Invalid Parameters (422)**: Invalid request payload
  ```
  Error: Invalid parameters. Check request payload.
  ```

- **Rate Limit (429)**: Too many requests
  ```
  Error: Rate limit exceeded. Try again later.
  ```

- **Server Error (500/503)**: API service issues
  ```
  Error: API service error. Try again later.
  ```

### Validation Errors

Pre-flight validation catches errors before API calls:

```
Error: Invalid aspect ratio '5:4'. Must be one of: 1:1, 3:4, 4:3, 9:16, 16:9
```

```
Error: numberOfImages must be between 1 and 4 (got: 5)
```

```
Error: inputImages parameter is only supported by Gemini model
```

### Production Mode

In production (`NODE_ENV=production`), errors are sanitized:

```javascript
// Development mode
throw new Error('SDK API error: Invalid authentication credentials');

// Production mode
throw new Error('Image generation failed. Please try again.');
```

## Troubleshooting

### API Key Not Found

```
Error: GOOGLE_GENAI_API_KEY not found
```

**Solution:** Create `.env` file with your API key:
```bash
echo "GOOGLE_GENAI_API_KEY=your_api_key_here" > .env
```

Or use the `--api-key` flag:
```bash
google-genai --api-key YOUR_KEY --gemini --prompt "test"
```

### Authentication Failed

```
Error: Authentication failed. Check API key.
```

**Solution:**
1. Verify your API key is correct in `.env`
2. Get a new key at https://aistudio.google.com/apikey
3. Check your Google Cloud project is active
4. Ensure you have billing enabled (if required)

### Invalid Parameters

```
Error: Invalid aspect ratio '5:4'
```

**Solution:** Use a valid aspect ratio:
```bash
google-genai --gemini --prompt "test" --aspect-ratio "16:9"
```

Valid ratios: 1:1, 3:4, 4:3, 9:16, 16:9

### Input Images Not Supported

```
Error: inputImages parameter is only supported by Gemini model
```

**Solution:** Use Gemini for image-to-image:
```bash
# Incorrect (Imagen doesn't support input images)
google-genai --imagen --prompt "test" --input-image photo.jpg

# Correct (Gemini supports input images)
google-genai --gemini --prompt "test" --input-image photo.jpg
```

### Module Not Found

```
Error: Cannot find module '@google/genai'
```

**Solution:** Install dependencies:
```bash
cd google-genai-api
npm install
```

### Image File Too Large

```
Error: Image file size exceeds 50MB limit
```

**Solution:** Resize or compress your image before processing:
```bash
# Using ImageMagick
convert input.jpg -resize 50% output.jpg

# Then use the smaller image
google-genai --gemini --prompt "edit" --input-image output.jpg
```

### No Images Generated

If only JSON metadata is saved without images:

**Solution:** Check that you're using the correct model and parameters:
```bash
# Ensure aspect ratio is valid
google-genai --gemini --prompt "test" --aspect-ratio "16:9"

# Check logs for errors
google-genai --gemini --prompt "test" --log-level debug
```

## Development Scripts

**Note:** These npm scripts are only available when working from the source repository (cloned from GitHub). They are not available after installing via npm.

If you're using the installed package, use `google-genai` (global) or `npx google-genai` (local) instead.

### For Source Development
```bash
node cli.js --help                     # Show help
node cli.js --examples                 # Show examples
node cli.js --gemini --prompt "test"   # Generate with Gemini
node cli.js --imagen --prompt "test"   # Generate with Imagen
```

Pass additional flags as needed:

```bash
node cli.js --gemini \
  --prompt "a serene landscape" \
  --aspect-ratio "16:9" \
  --log-level debug
```

### Testing Commands
```bash
npm test                 # Run all tests with Vitest (354 tests)
npm run test:watch       # Watch mode for development
npm run test:ui          # Interactive UI in browser
npm run test:coverage    # Generate coverage report
```

### Running Individual Tests
```bash
npx vitest run test/api.test.js        # Run API tests
npx vitest run test/config.test.js     # Run config tests
npx vitest run test/utils.test.js      # Run utils tests
npx vitest run -t "Gemini"             # Run tests matching "Gemini"
```

## Rate Limits

Google GenAI API rate limits vary by account tier and model. The service:
- Handles rate limit errors (429) gracefully
- Shows clear error messages when limits are exceeded
- Logs all API interactions for debugging

Check your quota at: https://console.cloud.google.com/apis/dashboard

## Additional Resources

- [Google GenAI API Documentation](https://ai.google.dev/gemini-api/docs)
- [API Key Management](https://aistudio.google.com/apikey)
- [Gemini Models Overview](https://ai.google.dev/gemini-api/docs/models/gemini)
- [Imagen Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview)
- [SynthID Watermarking](https://deepmind.google/technologies/synthid/)

## Related Packages

This package is part of the img-gen ecosystem. Check out these other AI generation services:

- [`ideogram-api`](https://github.com/aself101/ideogram-api) - Ideogram API wrapper for image generation, editing, remixing, and manipulation
- [`bfl-api`](https://github.com/aself101/bfl-api) - Black Forest Labs API wrapper for FLUX and Kontext models
- [`stability-ai-api`](https://github.com/aself101/stability-ai-api) - Stability AI API wrapper for Stable Diffusion 3.5 and image upscaling
- [`openai-api`](https://github.com/aself101/openai-api) - OpenAI API wrapper for DALL-E and GPT Image generation

---

**Disclaimer:** This project is an independent community wrapper and is not affiliated with Google or Alphabet Inc.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

By using this software, you agree to generate at least one image of a dog performing a backflip (optional but encouraged).

---

**Note:** This service implements the official `@google/genai` SDK (v0.3.0) with comprehensive security features and testing.
