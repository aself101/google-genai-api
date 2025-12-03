# Google GenAI API - TypeScript Migration Plan

## Overview

This plan outlines the migration of `google-genai-api` from JavaScript to TypeScript, following the patterns established in the `bfl-api` TypeScript migration.

## Current State

### Source Files to Migrate (6 files)
| File | Lines | Complexity | Dependencies |
|------|-------|------------|--------------|
| `api.js` | 331 | Medium | `@google/genai`, `winston`, `config.js` |
| `video-api.js` | 443 | High | `@google/genai`, `winston`, `axios`, `config.js`, `utils.js` |
| `veo-api.js` | 704 | High | `@google/genai`, `winston`, `fs/promises`, `config.js` |
| `config.js` | 829 | High | `dotenv`, `fs`, `os`, `path` |
| `utils.js` | 819 | High | `fs/promises`, `winston`, `axios`, `dns/promises`, `net`, `file-type` |
| `cli.js` | 855 | Very High | All modules, `commander`, `path`, `fs` |

### Test Files to Migrate (5 files)
| File | Test Count | Coverage |
|------|------------|----------|
| `test/api.test.js` | ~50 | api.js |
| `test/video-api.test.js` | ~60 | video-api.js |
| `test/veo-api.test.js` | ~80 | veo-api.js |
| `test/config.test.js` | ~100 | config.js |
| `test/utils.test.js` | ~80 | utils.js |

### Package Exports
- `.` (main): `api.js`
- `./api`: `api.js`
- `./video`: `video-api.js`
- `./veo`: `veo-api.js`
- `./utils`: `utils.js`
- `./config`: `config.js`

---

## Phase 1: Project Setup

### 1.1 Create TypeScript Configuration
Create `tsconfig.json` following the bfl-api pattern:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 1.2 Update package.json

Changes required:
```json
{
  "main": "dist/api.js",
  "types": "dist/api.d.ts",
  "bin": {
    "google-genai": "dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/api.js",
      "types": "./dist/api.d.ts"
    },
    "./api": {
      "import": "./dist/api.js",
      "types": "./dist/api.d.ts"
    },
    "./video": {
      "import": "./dist/video-api.js",
      "types": "./dist/video-api.d.ts"
    },
    "./veo": {
      "import": "./dist/veo-api.js",
      "types": "./dist/veo-api.d.ts"
    },
    "./utils": {
      "import": "./dist/utils.js",
      "types": "./dist/utils.d.ts"
    },
    "./config": {
      "import": "./dist/config.js",
      "types": "./dist/config.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "google": "tsx src/cli.ts",
    "google:help": "tsx src/cli.ts --help",
    "google:examples": "tsx src/cli.ts --examples",
    "google:gemini": "tsx src/cli.ts --gemini",
    "google:imagen": "tsx src/cli.ts --imagen",
    "google:veo": "tsx src/cli.ts --veo",
    "google:veo:fast": "tsx src/cli.ts --veo --veo-model veo-3.1-fast-generate-preview",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run build",
    "semantic-release": "semantic-release"
  }
}
```

### 1.3 Add TypeScript Dependencies

```bash
npm install -D typescript tsx @types/node
npm install -D @vitest/coverage-v8@^4.0.10 vitest@^4.0.10  # Upgrade vitest
```

Note: `@google/genai` package includes its own TypeScript types.

### 1.4 Create Source Directory Structure

```
google-genai-api/
├── src/
│   ├── types/
│   │   └── index.ts       # All type definitions
│   ├── api.ts             # GoogleGenAIAPI class
│   ├── video-api.ts       # GoogleGenAIVideoAPI class
│   ├── veo-api.ts         # GoogleGenAIVeoAPI class
│   ├── config.ts          # Configuration & validation
│   ├── utils.ts           # Utility functions
│   └── cli.ts             # CLI entry point
├── test/
│   ├── api.test.ts
│   ├── video-api.test.ts
│   ├── veo-api.test.ts
│   ├── config.test.ts
│   └── utils.test.ts
├── dist/                  # Compiled output (gitignored)
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Phase 2: Type Definitions

### 2.1 Create `src/types/index.ts`

Define comprehensive types for:

#### API Configuration Types
```typescript
export interface GoogleGenAIApiOptions {
  apiKey?: string | null;
  logLevel?: string;
}

export interface GoogleGenAIVideoApiOptions {
  apiKey?: string | null;
  logLevel?: string;
}

export interface GoogleGenAIVeoApiOptions {
  apiKey?: string | null;
  logLevel?: string;
}
```

#### Model Types
```typescript
export type GeminiModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' | 'gemini-2.5-flash';
export type ImagenModel = 'imagen-4.0-generate-001';
export type VeoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-generate-preview'
  | 'veo-3.0-generate-001'
  | 'veo-3.0-fast-generate-001'
  | 'veo-2.0-generate-001';
```

#### Generation Parameter Types
```typescript
export interface GeminiGenerateParams {
  prompt: string;
  inputImages?: InlineData[];
  aspectRatio?: AspectRatio;
  model?: GeminiModel;
  mode?: GeminiMode;
}

export interface ImagenGenerateParams {
  prompt: string;
  numberOfImages?: number;
  aspectRatio?: AspectRatio;
}

export interface VeoGenerateParams {
  prompt: string;
  model?: VeoModel;
  aspectRatio?: VeoAspectRatio;
  resolution?: VeoResolution;
  durationSeconds?: string;
  negativePrompt?: string;
  personGeneration?: VeoPersonGeneration;
  seed?: number;
}

export interface VeoImageToVideoParams extends VeoGenerateParams {
  image: VeoImage;
}
```

#### Response Types
```typescript
export interface GeminiPart {
  type: 'text' | 'image';
  content?: string;
  mimeType?: string;
  data?: string;
}

export interface InlineData {
  mimeType: string;
  data: string;
}

export interface VeoImage {
  imageBytes: string;
  mimeType: string;
}

export interface VeoOperation {
  name: string;
  done: boolean;
  response?: VeoResponse;
  error?: VeoError;
  metadata?: VeoMetadata;
}
```

#### Video API Types
```typescript
export interface VideoUploadResult {
  uri: string;
  name: string;
  mimeType: string;
  state: string;
  sizeBytes: number;
}

export interface VideoGenerateParams {
  prompt: string;
  fileUri: string;
  mimeType: string;
  videoMetadata?: VideoMetadata;
}

export interface VideoMetadata {
  startOffset?: string;
  endOffset?: string;
}

export interface VideoAnalysisResult {
  text: string;
  frames: VideoFrame[];
}
```

#### Constraint Types
```typescript
export interface ModelConstraint {
  aspectRatios?: string[];
  promptMaxLength?: number;
  numberOfImages?: { min: number; max: number; default: number };
  inputImagesMax?: number;
  supportedModes?: string[];
  features?: Record<string, boolean>;
  responseFormat?: string;
}

export interface VeoModelConstraint {
  aspectRatios: string[];
  resolutions: string[];
  durations: string[];
  features: VeoFeatures;
  referenceImages?: { max: number } | null;
  extension?: VeoExtensionConstraints | null;
  resolution1080p?: Veo1080pConstraints | null;
  promptMaxLength: number;
}
```

#### Validation Types
```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface VideoValidationResult {
  valid: boolean;
  mimeType: string;
  size: number;
}

export interface ParsedTimeOffsets {
  startSeconds?: number;
  endSeconds?: number;
}
```

#### Utility Types
```typescript
export interface SpinnerObject {
  start(): void;
  stop(finalMessage?: string | null): void;
  update(newMessage: string): void;
}

export interface VeoSpinnerObject extends SpinnerObject {
  updateElapsed(ms: number): void;
  updateMessage(newMessage: string): void;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type VeoAspectRatio = '16:9' | '9:16';
export type VeoResolution = '720p' | '1080p';
export type VeoPersonGeneration = 'allow_all' | 'allow_adult' | 'dont_allow';
export type GeminiMode = 'text-to-image' | 'image-to-image' | 'semantic-masking';
export type VeoMode = 'text-to-video' | 'image-to-video' | 'reference-images' | 'interpolation' | 'extension';
export type ErrorClassification = 'TRANSIENT' | 'PERMANENT' | 'USER_ACTIONABLE' | 'SAFETY_BLOCKED' | 'AUDIO_BLOCKED';
```

---

## Phase 3: Source File Migration

### Migration Order (Dependency-based)

1. **`src/types/index.ts`** - Type definitions (no dependencies)
2. **`src/config.ts`** - Configuration (depends on types)
3. **`src/utils.ts`** - Utilities (depends on types, config)
4. **`src/api.ts`** - Image API (depends on config)
5. **`src/video-api.ts`** - Video understanding API (depends on config, utils)
6. **`src/veo-api.ts`** - Video generation API (depends on config)
7. **`src/cli.ts`** - CLI (depends on all modules)

### 3.1 Migrate `config.ts`

Key changes:
- Add type annotations to all functions
- Type the MODEL_CONSTRAINTS and VEO_MODEL_CONSTRAINTS objects
- Type validation functions with proper return types
- Export types alongside constants

```typescript
// Example signature changes
export function getGoogleGenAIApiKey(cliApiKey?: string | null): string;
export function validateApiKeyFormat(apiKey: string): boolean;
export function validateModelParams(model: string, params: ModelValidationParams): void;
export function validateVeoParams(model: string, params: VeoValidationParams, mode?: VeoMode): boolean;
export function parseTimeOffset(offset: string | number): number;
export function validateVideoParams(params: VideoTimeParams): ParsedTimeOffsets;
export function detectGeminiMode(inputImages?: InlineData[]): GeminiMode;
```

### 3.2 Migrate `utils.ts`

Key changes:
- Type all function parameters and returns
- Type the logger instance
- Handle `file-type` ESM import correctly
- Add proper error type handling

```typescript
// Example signature changes
export async function validateImageUrl(url: string): Promise<string>;
export async function validateImagePath(filepath: string): Promise<string>;
export async function imageToInlineData(imagePathOrUrl: string): Promise<InlineData>;
export async function saveBase64Image(base64Data: string, outputPath: string, mimeType?: string): Promise<string>;
export function generateFilename(prompt: string, extension?: string, maxLength?: number): string;
export async function ensureDirectory(dirPath: string): Promise<string>;
export async function saveMetadata(metadataPath: string, metadata: Record<string, unknown>): Promise<string>;
export function pause(ms: number): Promise<void>;
export function createSpinner(message: string): SpinnerObject;
export async function validateVideoPath(filepath: string): Promise<VideoValidationResult>;
export function formatTimeOffset(seconds: number): string;
export function extractVideoMetadata(response: GeminiResponse): VideoAnalysisResult;
export async function imageToVeoInput(imagePath: string): Promise<VeoImage>;
export function generateVeoOutputPath(model: string, prompt: string, baseDir?: string): string;
export async function saveVeoMetadata(videoPath: string, metadata: VeoMetadataInput): Promise<string>;
export function createVeoSpinner(initialMessage: string): VeoSpinnerObject;
export async function parseVeoMetadata(metadataPath: string): Promise<VeoMetadata>;
```

### 3.3 Migrate `api.ts`

Key changes:
- Type the GoogleGenAIAPI class properties
- Type constructor options
- Type all method parameters and returns
- Handle @google/genai SDK types

```typescript
export class GoogleGenAIAPI {
  private client: GoogleGenAI;
  private apiKey: string;
  private logger: winston.Logger;

  constructor(apiKey: string, logLevel?: string);

  private _verifyApiKey(): void;
  private _buildGeminiContents(prompt: string, inputImages?: InlineData[]): string | GeminiPart[];

  async generateWithGemini(params: GeminiGenerateParams): Promise<GeminiResponse>;
  async generateWithImagen(params: ImagenGenerateParams): Promise<ImagenResponse>;
  setLogLevel(level: string): void;
}

export function extractGeminiParts(response: GeminiResponse): GeminiPart[];
export function extractImagenImages(response: ImagenResponse): GeminiPart[];
```

### 3.4 Migrate `video-api.ts`

Key changes:
- Type the GoogleGenAIVideoAPI class
- Type error classification returns
- Type polling functions

```typescript
export class GoogleGenAIVideoAPI {
  private apiKey: string;
  private client: GoogleGenAI;
  private model: string;
  private logger: winston.Logger;

  constructor(apiKey: string, logLevel?: string);

  private _verifyApiKey(): void;
  private _classifyError(error: Error): ErrorClassification;
  private _sanitizeError(error: Error): Error;
  private _pollFileStatus(fileName: string, maxAttempts?: number, intervalMs?: number): Promise<FileInfo>;

  async uploadVideoFile(videoPath: string, displayName?: string | null): Promise<VideoUploadResult>;
  async generateFromVideo(params: VideoGenerateParams): Promise<GeminiResponse>;
  async deleteVideoFile(fileUri: string): Promise<void>;
  setLogLevel(level: string): void;
}
```

### 3.5 Migrate `veo-api.ts`

Key changes:
- Type the GoogleGenAIVeoAPI class
- Type all Veo-specific operations
- Type completion polling and downloads

```typescript
export class GoogleGenAIVeoAPI {
  private apiKey: string;
  private client: GoogleGenAI;
  private defaultModel: VeoModel;
  private logger: winston.Logger;

  constructor(apiKey: string, logLevel?: string);

  private _verifyApiKey(): void;
  private _classifyError(error: Error): ErrorClassification;
  private _sanitizeError(error: Error): Error;

  async generateVideo(params: VeoGenerateParams): Promise<VeoOperation>;
  async generateFromImage(params: VeoImageToVideoParams): Promise<VeoOperation>;
  async generateWithReferences(params: VeoReferenceParams): Promise<VeoOperation>;
  async generateWithInterpolation(params: VeoInterpolationParams): Promise<VeoOperation>;
  async extendVideo(params: VeoExtendParams): Promise<VeoOperation>;
  async waitForCompletion(operation: VeoOperation, options?: WaitOptions): Promise<VeoOperation>;
  async downloadVideo(operation: VeoOperation, outputPath: string): Promise<DownloadResult>;
  extractVideo(operation: VeoOperation): ExtractedVideo;
  setLogLevel(level: string): void;
  getModelInfo(model?: string): VeoModelInfo;
}
```

### 3.6 Migrate `cli.ts`

Key changes:
- Type Commander options
- Type handler functions
- Add proper async/await typing

---

## Phase 4: Test Migration

### 4.1 Update `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        'datasets/**',
        '*.config.ts',
        '*.config.js',
        'src/cli.ts'
      ],
      include: ['src/api.ts', 'src/video-api.ts', 'src/veo-api.ts', 'src/utils.ts', 'src/config.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    },
    globals: false,
    reporter: 'verbose',
    testTimeout: 10000,
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'datasets/**'],
    watch: false,
    bail: process.env.CI ? 1 : 0
  }
});
```

### 4.2 Convert Test Files

- Rename `.test.js` to `.test.ts`
- Add type imports
- Type mock objects and assertions
- Update import paths to `.js` extension (ESM requirement)

---

## Phase 5: Cleanup & Verification

### 5.1 Update .gitignore

Add:
```
/dist
```

### 5.2 Remove Old Files

After migration verified:
```bash
rm api.js video-api.js veo-api.js config.js utils.js cli.js vitest.config.js
rm test/*.test.js
```

### 5.3 Verification Checklist

- [ ] `npm run build` compiles without errors
- [ ] `npm test` passes all tests
- [ ] `npm run test:coverage` meets thresholds (70%)
- [ ] `npm run google:help` works
- [ ] `npm run google:examples` works
- [ ] All exports work:
  - [ ] `import { GoogleGenAIAPI } from 'google-genai-api'`
  - [ ] `import { GoogleGenAIVideoAPI } from 'google-genai-api/video'`
  - [ ] `import { GoogleGenAIVeoAPI } from 'google-genai-api/veo'`
  - [ ] `import { validateImageUrl } from 'google-genai-api/utils'`
  - [ ] `import { MODELS } from 'google-genai-api/config'`
- [ ] Type declarations generated in `dist/`
- [ ] Binary `google-genai` works after npm pack/install

---

## Phase 6: Documentation Update

### 6.1 Update README.md

- Update import examples to show TypeScript usage
- Add type information to API documentation
- Update installation instructions

### 6.2 Update CLAUDE.md

- Update file structure to reflect src/ directory
- Update test commands
- Note TypeScript compilation step

---

## Task Checklist

### Setup
- [ ] Create `tsconfig.json`
- [ ] Create `src/` directory structure
- [ ] Update `package.json` (exports, scripts, dependencies)
- [ ] Install TypeScript dev dependencies
- [ ] Upgrade vitest to v4

### Type Definitions
- [ ] Create `src/types/index.ts` with all types

### Source Migration
- [ ] Migrate `config.js` → `src/config.ts`
- [ ] Migrate `utils.js` → `src/utils.ts`
- [ ] Migrate `api.js` → `src/api.ts`
- [ ] Migrate `video-api.js` → `src/video-api.ts`
- [ ] Migrate `veo-api.js` → `src/veo-api.ts`
- [ ] Migrate `cli.js` → `src/cli.ts`

### Test Migration
- [ ] Create `vitest.config.ts`
- [ ] Migrate `test/config.test.js` → `test/config.test.ts`
- [ ] Migrate `test/utils.test.js` → `test/utils.test.ts`
- [ ] Migrate `test/api.test.js` → `test/api.test.ts`
- [ ] Migrate `test/video-api.test.js` → `test/video-api.test.ts`
- [ ] Migrate `test/veo-api.test.js` → `test/veo-api.test.ts`

### Verification
- [ ] Build succeeds (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Coverage thresholds met
- [ ] CLI commands work
- [ ] Package exports work
- [ ] Type declarations generated

### Cleanup
- [ ] Remove old JS source files
- [ ] Remove old JS test files
- [ ] Update `.gitignore`
- [ ] Update documentation

---

## Estimated Complexity

| Component | Effort | Notes |
|-----------|--------|-------|
| Project Setup | Low | Standard TypeScript config |
| Type Definitions | High | ~200 types across 3 APIs |
| config.ts | High | 829 lines, many type exports |
| utils.ts | High | 819 lines, async/file operations |
| api.ts | Medium | 331 lines, @google/genai types |
| video-api.ts | High | 443 lines, polling logic |
| veo-api.ts | High | 704 lines, complex operations |
| cli.ts | Very High | 855 lines, all integrations |
| Test Migration | Medium | Mostly mechanical changes |

Total estimated lines to migrate: ~4,000+ lines
