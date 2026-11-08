/**
 * Google GenAI Omni Video Generation API (3.0)
 *
 * Video generation and conversational video editing with Gemini Omni Flash,
 * through the Interactions API. Replaces the Veo client: every Veo model this
 * package shipped was shut down on 2026-10-22, and Google names
 * gemini-omni-1.2-flash as the replacement (spec 3.0 D18).
 *
 * One call does every mode. Omni reads the mode from the prompt and the
 * inputs: text only, one image to animate, two images as first and last frame,
 * up to six reference images, or an earlier interaction / an uploaded video to
 * edit or extend.
 *
 * @module omni-api
 */

import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';
import {
  OMNI_MODELS,
  OMNI_MODEL_CONSTRAINTS,
  OMNI_TIMEOUTS,
  getGoogleGenAIApiKey,
  getOmniViolations,
  redactApiKey,
} from './config.js';
import { ValidationError, errorMessage, thrownFields, toPublicError } from './errors.js';
import type {
  GoogleGenAIClientOptions,
  OmniGenerateParams,
  OmniImageInput,
  OmniModel,
  OmniModelInfo,
  OmniResult,
  OmniSaveResult,
  OmniVideo,
  OmniVideoInput,
} from './types/index.js';

type CreateParams = Interactions.InteractionCreateParams.CreateModelInteractionParamsNonStreaming;
type Interaction = Interactions.Interaction;

/** An error carrying the interaction it came from, so a caller can report or retry it. */
interface InteractionError extends Error {
  interactionId?: string;
  operationError?: { message?: string; code?: number };
}

/** `files/<id>` from a Files API URI (`…/v1beta/files/<id>:download?alt=media`). */
function fileNameFromUri(uri: string): string | undefined {
  const id = /\/files\/([A-Za-z0-9_-]+)/.exec(uri)?.[1];
  return id ? `files/${id}` : undefined;
}

function toImageContent(img: OmniImageInput): Interactions.ImageContent {
  return 'data' in img
    ? { type: 'image', data: img.data, mime_type: img.mimeType }
    : { type: 'image', uri: img.uri, ...(img.mimeType && { mime_type: img.mimeType }) };
}

function toVideoContent(video: OmniVideoInput): Interactions.VideoContent {
  return 'data' in video
    ? { type: 'video', data: video.data, mime_type: video.mimeType }
    : { type: 'video', uri: video.uri, ...(video.mimeType && { mime_type: video.mimeType }) };
}

/**
 * The output video: the SDK's `output_video` convenience field, or — for a
 * response built without it — the video block of the last `model_output` step
 * (the REST shape in Google's guide).
 */
function findVideo(interaction: Interaction): Interactions.VideoContent | undefined {
  if (interaction.output_video) return interaction.output_video;
  for (const step of [...(interaction.steps ?? [])].reverse()) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type === 'video') return block;
    }
  }
  return undefined;
}

/** Text the model wrote in its `model_output` steps (a refusal or a remark), joined. */
function findText(interaction: Interaction): string | undefined {
  const texts: string[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') texts.push(block.text.trim());
    }
  }
  return texts.length > 0 ? texts.join('\n') : undefined;
}

/**
 * Google GenAI Omni video generation client.
 *
 * @example
 * const omni = new GoogleGenAIOmniAPI(apiKey);
 * const first = await omni.generate({ prompt: 'A woman playing violin outdoors.', durationSeconds: 8 });
 * await omni.saveVideo(first, './violin.mp4');
 *
 * // Edit the same video in a second turn
 * const edited = await omni.generate({ prompt: 'Make the violin invisible.', previousInteractionId: first.interactionId });
 * await omni.saveVideo(edited, './violin-edited.mp4');
 */
export class GoogleGenAIOmniAPI {
  private apiKey: string;
  private client: GoogleGenAI;
  private defaultModel: OmniModel;
  private logger: winston.Logger;
  private capabilityValidation: 'error' | 'warn';
  /** Unknown model ids already warned about by this instance (spec D3: once per id). */
  private warnedUnknownModels = new Set<string>();

  /**
   * @param apiKey - Google GenAI API key
   * @param logLevel - Logging level (debug, info, warn, error)
   * @param options - `capabilityValidation: 'warn'` to log, not throw, when a
   *   known model's constraint table rejects a parameter
   * @throws Error if API key is not provided
   */
  constructor(apiKey: string, logLevel = 'info', options: GoogleGenAIClientOptions = {}) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    this.apiKey = apiKey;
    // Pinned to the Gemini Developer API (spec D5; see api.ts).
    this.client = new GoogleGenAI({ apiKey, vertexai: false });
    this.defaultModel = OMNI_MODELS.OMNI_1_2_FLASH;
    this.capabilityValidation = options.capabilityValidation ?? 'error';
    this.logger = winston.createLogger({
      level: logLevel.toLowerCase(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - ${level.toUpperCase()} - [OmniAPI] ${message}`;
        })
      ),
      transports: [new winston.transports.Console()],
    });
    this.logger.debug(`GoogleGenAIOmniAPI initialized (key: ${redactApiKey(apiKey)})`);
  }

  /**
   * Spec D3/D5 before any network call: warn once per unknown model id; throw
   * on shape violations; throw or warn on capability violations per
   * `capabilityValidation`.
   */
  private _checkParams(model: string, params: OmniGenerateParams): void {
    if (!Object.prototype.hasOwnProperty.call(OMNI_MODEL_CONSTRAINTS, model) && !this.warnedUnknownModels.has(model)) {
      this.warnedUnknownModels.add(model);
      this.logger.warn(`Model '${model}' is not in this package's catalog; sending without capability validation`);
    }
    const violations = getOmniViolations(model, params);
    const shape = violations.filter((v) => v.kind === 'shape');
    if (shape.length > 0) throw new ValidationError(shape);
    if (violations.length === 0) return;
    if (this.capabilityValidation === 'error') throw new ValidationError(violations);
    for (const v of violations) this.logger.warn(`${v.message} (sending anyway: capabilityValidation is 'warn')`);
  }

  /** The `interactions.create` body for these params. Exposed to the wire tests only through `generate`. */
  private _request(model: string, params: OmniGenerateParams): CreateParams {
    const media: Interactions.Content[] = [];
    if (params.video) media.push(toVideoContent(params.video));
    for (const img of params.images ?? []) media.push(toImageContent(img));
    const request: CreateParams = {
      model,
      // A bare prompt is sent as a string, as in Google's text-to-video example.
      input: media.length > 0 ? [...media, { type: 'text', text: params.prompt }] : params.prompt,
    };
    const format: Interactions.VideoResponseFormat = { type: 'video' };
    if (params.aspectRatio !== undefined) format.aspect_ratio = params.aspectRatio;
    if (params.resolution !== undefined) format.resolution = params.resolution;
    // `!== undefined`, not truthiness: 0 must reach validation's rejection, never become the default.
    if (params.durationSeconds !== undefined) format.duration = `${Number(params.durationSeconds)}s`;
    if (params.delivery !== undefined) format.delivery = params.delivery;
    if (Object.keys(format).length > 1) request.response_format = format;
    if (params.task !== undefined) request.generation_config = { video_config: { task: params.task } };
    if (params.previousInteractionId !== undefined) request.previous_interaction_id = params.previousInteractionId;
    if (params.store !== undefined) request.store = params.store;
    return request;
  }

  /**
   * Generate a video, or edit / extend an earlier one.
   *
   * Synchronous: resolves when the video is done (typically tens of seconds to
   * minutes), bounded by `timeoutMs`. Never retried automatically — every
   * attempt is a billed generation, and one that times out may still be billed.
   *
   * @param params - `prompt` (required) plus optional inputs (`images`, `video`),
   *   output settings (`aspectRatio`, `resolution`, `durationSeconds`, `delivery`),
   *   and `previousInteractionId` to edit or extend an earlier result. `task`
   *   cannot be combined with `previousInteractionId`; pass the video as `video`.
   * @returns The interaction id (pass it as `previousInteractionId` to continue),
   *   the model, and the video as inline `data` or a Files API `uri` (per
   *   `delivery`); pass the whole result to {@link saveVideo}.
   * @throws ValidationError before any network call when params are invalid
   * @throws Error with `classification` and `surface` when the API fails, the
   *   interaction fails, or it completes without a video; the last two also
   *   carry `interactionId`
   *
   * @example
   * const clip = await omni.generate({ prompt: 'a cat playing piano', durationSeconds: 8 });
   * const longer = await omni.generate({ prompt: 'Extend this video: the cat bows.', previousInteractionId: clip.interactionId });
   */
  async generate(params: OmniGenerateParams): Promise<OmniResult> {
    if (!this.apiKey) throw new Error('API key is not set. Please provide a valid API key.');
    const model: string = params.model || this.defaultModel;
    this._checkParams(model, params);
    const request = this._request(model, params);

    const mode = params.previousInteractionId ? `continuing ${params.previousInteractionId}` : `${params.images?.length ?? 0} image(s)${params.video ? ', 1 video' : ''}`;
    this.logger.info(`Starting Omni generation with ${model} (${mode})`);
    this.logger.debug(`Prompt: "${params.prompt.substring(0, 100)}..."`);

    let interaction: Interaction;
    const started = Date.now();
    try {
      interaction = await this.client.interactions.create(request, {
        timeout_ms: params.timeoutMs ?? OMNI_TIMEOUTS.REQUEST,
        retries: { strategy: 'none' },
      });
    } catch (error) {
      // Converted first: outside production that puts the vendor error in the message (3.0 D27).
      const publicError = toPublicError(error, { surface: 'video' });
      this.logger.error(`Omni generation failed: ${publicError.message}`);
      throw publicError;
    }
    this.logger.info(`Omni interaction ${interaction.id} ${interaction.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    if (interaction.status !== 'completed') {
      const detail = interaction.errors?.map((e) => e.message).filter(Boolean).join('; ');
      const error: InteractionError = new Error(
        `Omni interaction ${interaction.id} ended with status '${interaction.status}'${detail ? `: ${detail}` : ''}`
      );
      error.interactionId = interaction.id;
      if (detail) error.operationError = { message: detail };
      throw toPublicError(error, { surface: 'video' });
    }

    const video = findVideo(interaction);
    const text = findText(interaction);
    if (!video || (!video.data && !video.uri)) {
      const error: InteractionError = new Error(
        `Omni interaction ${interaction.id} completed without a video${text ? `. Model said: ${text}` : ''}`
      );
      error.interactionId = interaction.id;
      // Our own message, carrying the model's text: read as the operation's
      // message so a refusal that names safety or policy classifies SAFETY_BLOCKED.
      // Nothing in our prefix matches that pattern (wire test control).
      if (text) error.operationError = { message: error.message };
      throw toPublicError(error, { surface: 'video' });
    }

    const out: OmniVideo = { mimeType: video.mime_type ?? 'video/mp4' };
    if (video.data) out.data = video.data;
    else if (video.uri) out.uri = video.uri;
    return {
      interactionId: interaction.id,
      model: interaction.model ?? model,
      status: interaction.status,
      video: out,
      ...(text && { text }),
    };
  }

  /**
   * Write a generated video to disk. Inline videos are decoded; `uri` videos
   * are polled until the Files API marks them ACTIVE, then downloaded.
   *
   * @param result - What {@link generate} returned.
   * @param outputPath - File to write; parent directories are created.
   * @returns The path written, its size in bytes, and the interaction id.
   * @throws Error when the result has no video, the file FAILED processing, or
   *   the download fails (with `classification` and `surface`)
   * @throws Error with `isTimeout: true` when a `uri` video never became ACTIVE,
   *   thrown as is in every environment
   */
  async saveVideo(result: OmniResult, outputPath: string): Promise<OmniSaveResult> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    if (result.video.data) {
      const bytes = Buffer.from(result.video.data, 'base64');
      await fs.writeFile(outputPath, bytes);
      this.logger.info(`Video saved: ${outputPath} (${bytes.length} bytes)`);
      return { path: outputPath, bytes: bytes.length, interactionId: result.interactionId };
    }
    if (!result.video.uri) {
      throw new Error(`Interaction ${result.interactionId} has no video data or URI to save`);
    }
    const name = fileNameFromUri(result.video.uri);
    if (!name) throw new Error(`Cannot read a Files API name from video URI: ${result.video.uri}`);
    try {
      await this._waitForFile(name);
      await this.client.files.download({ file: name, downloadPath: outputPath });
    } catch (error) {
      this.logger.error(`Download failed: ${errorMessage(error)}`);
      // The poll timeout is this package's own error and carries no vendor data:
      // thrown as is, with `isTimeout: true`, as video understanding does.
      if (thrownFields(error).isTimeout === true) throw error;
      throw toPublicError(error, { surface: 'video' });
    }
    const { size } = await fs.stat(outputPath);
    this.logger.info(`Video downloaded: ${outputPath} (${size} bytes)`);
    return { path: outputPath, bytes: size, interactionId: result.interactionId };
  }

  /** Poll a Files API file until ACTIVE. FAILED and timeout throw. */
  private async _waitForFile(name: string): Promise<void> {
    for (let attempt = 1; attempt <= OMNI_TIMEOUTS.FILE_POLL_MAX_ATTEMPTS; attempt++) {
      const file = await this.client.files.get({ name });
      if (file.state === 'ACTIVE') return;
      if (file.state === 'FAILED') throw new Error(`Video file ${name} failed processing`);
      this.logger.debug(`Video file ${name} is ${file.state ?? 'pending'} (check ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, OMNI_TIMEOUTS.FILE_POLL_INTERVAL));
    }
    const error: Error & { isTimeout?: boolean } = new Error(
      `Video file ${name} was not ready after ${OMNI_TIMEOUTS.FILE_POLL_MAX_ATTEMPTS} checks`
    );
    error.isTimeout = true;
    throw error;
  }

  /** Set the logging level. */
  setLogLevel(level: string): void {
    this.logger.level = level.toLowerCase();
  }

  /**
   * Model information and constraints.
   * @throws Error for a model this package does not catalog
   */
  getModelInfo(model?: string): OmniModelInfo {
    const id = model || this.defaultModel;
    if (!Object.prototype.hasOwnProperty.call(OMNI_MODEL_CONSTRAINTS, id)) throw new Error(`Unknown model: ${id}`);
    return { model: id, ...OMNI_MODEL_CONSTRAINTS[id] };
  }
}

export { getGoogleGenAIApiKey, OMNI_MODELS, OMNI_TIMEOUTS };
