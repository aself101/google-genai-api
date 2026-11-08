#!/usr/bin/env node
// Live battery for the 3.0 spec (docs/specs/google-genai-api-3.0-spec-v0_1_0.md §7).
// Runs THROUGH dist/ — the built package — so it tests what ships. `npm run build` first.
//
// PAID. Every parameter of the surfaces 3.0 adds or changes: the Nano Banana 2.1 grid
// (14 ratios × 3 sizes), the Omni grid (2 ratios × 4 resolutions), every Omni duration,
// every mode and task, both deliveries, store:false, the API's own rejections, video
// understanding on the new model, and the CLI. Estimated ≈ $18 at the 2026-11-08 price
// list; a running estimate stops the run at --budget (default $30). Not part of `npm test`.
//
//   node scripts/live-battery-3.0.mjs                  everything
//   node scripts/live-battery-3.0.mjs --free-only      checks that cost nothing
//   node scripts/live-battery-3.0.mjs --only F1,V-16x9-360p   a subset; list the checks it builds on too
//   node scripts/live-battery-3.0.mjs --budget 30
//
// Key: GOOGLE_GENAI_API_KEY. One JSON line per check goes to stdout and to
// docs/specs/live-3.0-<date>.jsonl; media goes to test-outputs/live-3.0/ (gitignored).
// HTTP 402 (prepaid credits depleted) stops the run. HTTP 429 (Google's spend-based rate
// limit; not billed) waits 60 s and tries once more.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { GoogleGenAIAPI, GoogleGenAIVideoAPI, extractGeminiParts } = await import(path.join(root, 'dist/api.js'));
const { GoogleGenAIOmniAPI } = await import(path.join(root, 'dist/omni-api.js'));
const { DEFAULT_IMAGE_MODEL, MODELS, ASPECT_RATIOS, MODEL_CONSTRAINTS, OMNI_ASPECT_RATIOS, OMNI_RESOLUTIONS, OMNI_TASKS } = await import(path.join(root, 'dist/config.js'));

const argv = process.argv.slice(2);
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const freeOnly = argv.includes('--free-only');
const only = flag('--only')?.split(',');
const budget = Number(flag('--budget') ?? 30);
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY not set');

const date = new Date().toISOString().slice(0, 10);
const out = path.join(root, 'test-outputs/live-3.0');
const record = path.join(root, `docs/specs/live-3.0-${date}.jsonl`);
mkdirSync(out, { recursive: true });

const images = new GoogleGenAIAPI(apiKey, 'error');
const imagesWarn = new GoogleGenAIAPI(apiKey, 'error', { capabilityValidation: 'warn' });
const omni = new GoogleGenAIOmniAPI(apiKey, 'error');
const omniWarn = new GoogleGenAIOmniAPI(apiKey, 'error', { capabilityValidation: 'warn' });
const video = new GoogleGenAIVideoAPI(apiKey, 'error');

// ---- price list, 2026-11-08 (docs/api pricing page) — estimates only ----
const OMNI_PER_SECOND = { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 };
const IMAGE_PRICE = { 'gemini-nano-banana-2.1': { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 }, 'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24 } };
const imageCost = (model, size = '1K') => IMAGE_PRICE[model]?.[size] ?? 0.0336;
const omniCost = (resolution = '720p', seconds = 10) => OMNI_PER_SECOND[resolution] * seconds;
let spent = 0;

// ---- media inspection ----
/** Duration (s) and the first video track's width × height, from the MP4 header boxes. */
function mp4Info(buf) {
  const info = {};
  const mvhd = buf.indexOf('mvhd');
  if (mvhd > 0) {
    const v = buf[mvhd + 4];
    const [scale, dur] = v === 1 ? [buf.readUInt32BE(mvhd + 24), Number(buf.readBigUInt64BE(mvhd + 28))] : [buf.readUInt32BE(mvhd + 16), buf.readUInt32BE(mvhd + 20)];
    if (scale) info.seconds = Math.round((dur / scale) * 100) / 100;
  }
  for (let i = buf.indexOf('tkhd'); i > 0; i = buf.indexOf('tkhd', i + 4)) {
    const off = i + 4 + (buf[i + 4] === 1 ? 88 : 76); // width/height: the box's last 8 bytes, 16.16 fixed
    const w = buf.readUInt32BE(off) >>> 16;
    const h = buf.readUInt32BE(off + 4) >>> 16;
    if (w && h) { info.width = w; info.height = h; break; }
  }
  info.audio = buf.indexOf('soun') > 0;
  return info;
}

/** JPEG/PNG dimensions from header bytes. */
function imageDims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i < buf.length; ) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), fmt: 'jpeg' };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { fmt: 'unknown' };
}

// ---- the check runner ----
const errorFields = (e) => ({ name: e?.name, message: String(e?.message ?? e).slice(0, 400), status: e?.status, classification: e?.classification, interactionId: e?.interactionId });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stopped = '';
const results = [];
const wanted = (id) => !only || only.includes(id);

/**
 * Run one check. `cost` is the estimate added to the budget before the call.
 * `expectError(e)` → the check passes only by failing in that way.
 */
async function check(id, what, fn, { cost = 0, expectError } = {}) {
  if (stopped) return undefined;
  if (!wanted(id)) return undefined;
  if (freeOnly && cost > 0) return undefined;
  if (spent + cost > budget) {
    stopped = `budget: ${id} would take the estimate to $${(spent + cost).toFixed(2)} > $${budget}`;
    console.error(`\n✗ ${stopped}\n`);
    return undefined;
  }
  spent += cost;
  const t0 = Date.now();
  let row;
  let value;
  for (let attempt = 1; ; attempt++) {
    try {
      value = await fn();
      row = expectError ? { ok: false, note: 'expected an error, got success', ...value?.row } : { ok: true, ...value?.row };
    } catch (e) {
      if (e?.status === 429 && attempt === 1) {
        console.error(`  ${id}: 429, waiting 60 s and trying once more`);
        await sleep(60000);
        continue;
      }
      row = expectError ? { ok: Boolean(expectError(e)), error: errorFields(e) } : { ok: false, error: errorFields(e) };
      if (e?.status === 402) stopped = `${id}: HTTP 402 — the key's project has no prepaid credits`;
    }
    break;
  }
  row = { id, what, ms: Date.now() - t0, estUsd: Math.round(cost * 1000) / 1000, ...row };
  results.push(row);
  const line = JSON.stringify(row);
  console.log(line);
  appendFileSync(record, `${line}\n`);
  if (stopped) console.error(`\n✗ ${stopped}. Stopping.\n`);
  return row.ok ? value : undefined;
}

async function genImage(id, client, params) {
  const response = await client.generateWithGemini(params);
  const parts = extractGeminiParts(response).filter((p) => p.type === 'image');
  if (parts.length === 0) throw new Error(`no image (finishReason ${response.candidates?.[0]?.finishReason})`);
  const buf = Buffer.from(parts[0].data, 'base64');
  const file = path.join(out, `${id}.${parts[0].mimeType === 'image/png' ? 'png' : 'jpg'}`);
  writeFileSync(file, buf);
  return {
    inline: { mimeType: parts[0].mimeType, data: parts[0].data },
    row: { model: params.model ?? DEFAULT_IMAGE_MODEL, modelVersion: response.modelVersion, aspectRatio: params.aspectRatio, imageSize: params.imageSize, ...imageDims(buf), bytes: buf.length, file: path.relative(root, file) },
  };
}

async function genVideo(id, params, client = omni) {
  const result = await client.generate(params);
  const file = path.join(out, `${id}.mp4`);
  const saved = await client.saveVideo(result, file);
  const info = mp4Info(readFileSync(file));
  return {
    result,
    file,
    row: { interactionId: result.interactionId, model: result.model, asked: { resolution: params.resolution, durationSeconds: params.durationSeconds, aspectRatio: params.aspectRatio, task: params.task, delivery: params.delivery }, delivery: result.video.uri ? 'uri' : 'inline', bytes: saved.bytes, ...info, text: result.text?.slice(0, 200), file: path.relative(root, file) },
  };
}

const P = 'Continuous single shot: a red ball bounces once on a wooden floor. No dialogue.';
const NB = MODELS.GEMINI_NANO_BANANA_2_1;
const BAD_KEY = 'AIzaBOGUSBOGUSBOGUSBOGUSBOGUSBOGUS12345';
const isValidation = (e) => e?.name === 'ValidationError';
const is4xx = (e) => typeof e?.status === 'number' && e.status >= 400 && e.status < 500;

// =====================================================================
// FREE — rejected before the network, or by auth
// =====================================================================
await check('F1', 'Nano Banana 2.1 rejects imageSize 512 before the network', () => images.generateWithGemini({ prompt: 'x', imageSize: '512' }), { expectError: isValidation });
await check('F2', 'Omni rejects negativePrompt before the network', () => omni.generate({ prompt: 'x', negativePrompt: 'blur' }), { expectError: (e) => isValidation(e) && /not supported by Gemini Omni/.test(e.message) });
await check('F3', 'Omni rejects personGeneration and seed before the network', () => omni.generate({ prompt: 'x', personGeneration: 'allow_all', seed: 1 }), { expectError: isValidation });
await check('F4', 'Omni rejects a 20 s duration before the network', () => omni.generate({ prompt: 'x', durationSeconds: 20 }), { expectError: isValidation });
await check('F5', 'Omni rejects 7 images before the network', () => omni.generate({ prompt: 'x', images: Array(7).fill({ data: 'aGk=', mimeType: 'image/png' }) }), { expectError: isValidation });
await check('F6', 'Omni rejects aspect ratio 1:1 before the network', () => omni.generate({ prompt: 'x', aspectRatio: '1:1' }), { expectError: isValidation });
await check('F7', 'Omni rejects resolution 8k before the network', () => omni.generate({ prompt: 'x', resolution: '8k' }), { expectError: isValidation });
await check('F8', 'Omni rejects an unknown task before the network', () => omni.generate({ prompt: 'x', task: 'remix' }), { expectError: isValidation });
await check('F9', 'Omni with a bogus key: 4xx, classified, vendor message in the error', () => new GoogleGenAIOmniAPI(BAD_KEY, 'error').generate({ prompt: 'x' }), { expectError: (e) => is4xx(e) && /API key not valid/.test(e.message) });
await check('F10', 'Image with a bogus key: 4xx, classified', () => new GoogleGenAIAPI(BAD_KEY, 'error').generateWithGemini({ prompt: 'x' }), { expectError: is4xx });

// =====================================================================
// IMAGES — the Nano Banana 2.1 grid, edits, the 2.x models, warn mode
// =====================================================================
let firstImage;
let secondImage;
const nbRatios = MODEL_CONSTRAINTS[NB].aspectRatios;
const nbSizes = MODEL_CONSTRAINTS[NB].imageSizes;
for (const size of nbSizes) {
  for (const ratio of nbRatios) {
    const id = `I-${size}-${ratio.replace(':', 'x')}`;
    const got = await check(id, `${NB} ${size} ${ratio}`, () => genImage(id, images, { prompt: 'A lush green forest at sunrise, photographic', aspectRatio: ratio, imageSize: size }), { cost: imageCost(NB, size) });
    if (got && size === '1K' && ratio === '16:9') firstImage = got.inline;
  }
}
secondImage = (await check('I-night', `${NB} 1K 16:9, the second frame for interpolation`, () => genImage('I-night', images, { prompt: 'The same forest under a starry night sky, snow on the ground, photographic', aspectRatio: '16:9', imageSize: '1K' }), { cost: imageCost(NB) }))?.inline;
await check('I-nosize', `${NB}, no aspectRatio and no imageSize (model default framing)`, () => genImage('I-nosize', images, { prompt: 'A red apple on a table' }), { cost: imageCost(NB) });
if (firstImage) {
  await check('I-edit1', `${NB} edit, 1 input image`, () => genImage('I-edit1', images, { prompt: 'Make it autumn: orange and red leaves', inputImages: [firstImage], imageSize: '1K' }), { cost: imageCost(NB) });
  if (secondImage) await check('I-edit2', `${NB}, 2 input images combined`, () => genImage('I-edit2', images, { prompt: 'Combine these two scenes side by side as one diptych', inputImages: [firstImage, secondImage], aspectRatio: '16:9', imageSize: '1K' }), { cost: imageCost(NB) });
  await check('I-edit14', `${NB}, 14 input images (the documented maximum)`, () => genImage('I-edit14', images, { prompt: 'Arrange all of these images as a 7x2 contact sheet', inputImages: Array(14).fill(firstImage), aspectRatio: '21:9', imageSize: '1K' }), { cost: imageCost(NB) + 0.03 });
}
await check('I-warn512', `${NB} imageSize 512 sent anyway (capabilityValidation warn): what does Google say?`, () => genImage('I-warn512', imagesWarn, { prompt: 'A red apple', imageSize: '512' }), { cost: imageCost(NB), expectError: is4xx });
await check('I-31flash', 'gemini-3.1-flash-image (the 2.x default) 1K, and 512', async () => {
  const a = await genImage('I-31flash-1K', images, { prompt: 'A red apple on a table', model: MODELS.GEMINI_3_1_FLASH, imageSize: '1K' });
  const b = await genImage('I-31flash-512', images, { prompt: 'A red apple on a table', model: MODELS.GEMINI_3_1_FLASH, imageSize: '512' });
  return { row: { k1: a.row, k512: b.row } };
}, { cost: 0.07 });
await check('I-lite', 'gemini-3.1-flash-lite-image 1K', () => genImage('I-lite', images, { prompt: 'A flat paper-plane icon', model: MODELS.GEMINI_3_1_FLASH_LITE, imageSize: '1K' }), { cost: 0.02 });
await check('I-pro', 'gemini-3-pro-image 1K', () => genImage('I-pro', images, { prompt: 'A hyper-real mountain lake', model: MODELS.GEMINI_3_PRO, imageSize: '1K' }), { cost: imageCost(MODELS.GEMINI_3_PRO) });

// =====================================================================
// OMNI — grid, durations, modes, tasks, deliveries, store, rejections
// =====================================================================
let base; // a 3 s 360p clip other checks build on
for (const ratio of OMNI_ASPECT_RATIOS) {
  for (const res of OMNI_RESOLUTIONS) {
    const id = `V-${ratio.replace(':', 'x')}-${res}`;
    const got = await check(id, `Omni ${ratio} ${res} 3 s inline`, () => genVideo(id, { prompt: P, aspectRatio: ratio, resolution: res, durationSeconds: 3 }), { cost: omniCost(res, 3) });
    if (got && ratio === '16:9' && res === '360p') base = got;
  }
}
for (let d = 4; d <= 15; d++) {
  await check(`V-d${d}`, `Omni 360p ${d} s`, () => genVideo(`V-d${d}`, { prompt: P, resolution: '360p', durationSeconds: d }), { cost: omniCost('360p', d) });
}
await check('V-defaults', 'Omni with no settings (Google defaults: 16:9, 720p, 10 s)', () => genVideo('V-defaults', { prompt: P }), { cost: omniCost('720p', 10) });
await check('V-4k15', 'Omni 4k 15 s, delivery uri (wall time vs the 15-minute timeout)', () => genVideo('V-4k15', { prompt: P, resolution: '4k', durationSeconds: 15, delivery: 'uri' }), { cost: omniCost('4k', 15) });
await check('V-uri360', 'Omni delivery uri at 360p', () => genVideo('V-uri360', { prompt: P, resolution: '360p', durationSeconds: 3, delivery: 'uri' }), { cost: omniCost('360p', 3) });
await check('V-uri1080', 'Omni delivery uri at 1080p', () => genVideo('V-uri1080', { prompt: P, resolution: '1080p', durationSeconds: 3, delivery: 'uri' }), { cost: omniCost('1080p', 3) });
await check('V-inline', "Omni delivery 'inline' passed explicitly", () => genVideo('V-inline', { prompt: P, resolution: '360p', durationSeconds: 3, delivery: 'inline' }), { cost: omniCost('360p', 3) });

if (firstImage) {
  await check('V-i2v', 'Omni image-to-video (1 image)', () => genVideo('V-i2v', { prompt: 'Bring this forest to life: leaves move in a gentle breeze, single continuous shot.', images: [firstImage], resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 3) });
  await check('V-i2v15', 'Omni image-to-video at 15 s (single image allows 15)', () => genVideo('V-i2v15', { prompt: 'Bring this forest to life: leaves move in a gentle breeze, single continuous shot.', images: [firstImage], resolution: '360p', durationSeconds: 15 }), { cost: omniCost('360p', 15) });
  await check('V-refs6', 'Omni 6 reference images', () => genVideo('V-refs6', { prompt: 'A hiker walks through the forest shown in the reference images.', images: Array(6).fill(firstImage), resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 3) + 0.01 });
  if (secondImage) {
    await check('V-ff3', 'Omni first+last frame, 3 s', () => genVideo('V-ff3', { prompt: 'A smooth transition from the first frame to the last frame.', images: [firstImage, secondImage], resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 3) });
    await check('V-ff10', 'Omni first+last frame, 10 s (the documented maximum)', () => genVideo('V-ff10', { prompt: 'A smooth transition from the first frame to the last frame.', images: [firstImage, secondImage], resolution: '360p', durationSeconds: 10 }), { cost: omniCost('360p', 10) });
    await check('V-ff11', 'Omni first+last frame at 11 s → API rejects; message reaches the caller', () => genVideo('V-ff11', { prompt: 'A smooth transition from the first frame to the last frame.', images: [firstImage, secondImage], resolution: '360p', durationSeconds: 11 }), { cost: omniCost('360p', 11), expectError: is4xx });
  }
}
await check('V-d16warn', 'Omni 16 s sent anyway (warn mode) → API rejects', () => genVideo('V-d16warn', { prompt: P, resolution: '360p', durationSeconds: 16 }, omniWarn), { cost: omniCost('360p', 16), expectError: is4xx });
await check('V-sq', 'Omni 1:1 sent anyway (warn mode): what does Google say?', () => genVideo('V-sq', { prompt: P, resolution: '360p', durationSeconds: 3, aspectRatio: '1:1' }, omniWarn), { cost: omniCost('360p', 3) });

let ext10;
if (base) {
  await check('V-edit', 'Omni edit of a generated video (previousInteractionId)', () => genVideo('V-edit', { prompt: 'Make the ball blue. Keep everything else the same.', previousInteractionId: base.result.interactionId, resolution: '360p' }), { cost: omniCost('360p', 3) });
  await check('V-ext3', 'Omni extend by 3 s', () => genVideo('V-ext3', { prompt: 'Extend this video: the ball rolls out of frame.', previousInteractionId: base.result.interactionId, resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 6) });
  ext10 = await check('V-ext10', 'Omni extend by 10 s (per-turn maximum)', () => genVideo('V-ext10', { prompt: 'Extend this video: the ball rolls across the room.', previousInteractionId: base.result.interactionId, resolution: '360p', durationSeconds: 10 }), { cost: omniCost('360p', 13) });
  await check('V-ext11', 'Omni extend by 11 s → API rejects', () => genVideo('V-ext11', { prompt: 'Extend this video.', previousInteractionId: base.result.interactionId, resolution: '360p', durationSeconds: 11 }, omniWarn), { cost: omniCost('360p', 14), expectError: is4xx });
  for (const task of OMNI_TASKS) {
    const params = { prompt: P, resolution: '360p', durationSeconds: 3, task };
    if (task === 'image_to_video' && firstImage) Object.assign(params, { prompt: 'Bring this forest to life.', images: [firstImage] });
    if (task === 'reference_to_video' && firstImage) Object.assign(params, { prompt: 'A hiker walks through the forest in the reference image.', images: [firstImage] });
    if (task === 'edit') Object.assign(params, { prompt: 'Make the floor marble. Keep everything else the same.', previousInteractionId: base.result.interactionId });
    if (task === 'extend') Object.assign(params, { prompt: 'Extend this video.', previousInteractionId: base.result.interactionId });
    if (task === 'upscale') Object.assign(params, { prompt: 'Upscale this video.', previousInteractionId: base.result.interactionId, resolution: '1080p' });
    const cost = task === 'upscale' ? omniCost('1080p', 3) : omniCost('360p', 6);
    await check(`V-task-${task}`, `Omni task ${task}`, () => genVideo(`V-task-${task}`, params), { cost });
  }
}
if (ext10) {
  // base 3 s + 10 s = 13 s; two more 10 s turns would pass the 30 s total.
  const ext20 = await check('V-ext20', 'Omni extend again (+10 s → about 23 s total)', () => genVideo('V-ext20', { prompt: 'Extend this video: the ball stops by a wall.', previousInteractionId: ext10.result.interactionId, resolution: '360p', durationSeconds: 10 }), { cost: omniCost('360p', 23) });
  if (ext20) await check('V-ext30plus', 'Omni extend past 30 s total → what happens?', () => genVideo('V-ext30plus', { prompt: 'Extend this video.', previousInteractionId: ext20.result.interactionId, resolution: '360p', durationSeconds: 10 }), { cost: omniCost('360p', 33) });
}
const nostore = await check('V-nostore', 'Omni store:false', () => genVideo('V-nostore', { prompt: P, resolution: '360p', durationSeconds: 3, store: false }), { cost: omniCost('360p', 3) });
if (nostore) await check('V-nostore-edit', 'editing a store:false interaction → rejected', () => genVideo('V-nostore-edit', { prompt: 'Make the ball blue.', previousInteractionId: nostore.result.interactionId, resolution: '360p' }), { cost: omniCost('360p', 3), expectError: is4xx });
await check('V-badprev', 'Omni previousInteractionId that does not exist → 4xx', () => genVideo('V-badprev', { prompt: 'Make the ball blue.', previousInteractionId: 'v1_doesnotexist000000' }), { cost: 0.01, expectError: is4xx });

// ---- uploaded video: edit, extend, understanding ----
if (base) {
  const up = await check('U-upload', 'upload a generated clip through the Files API', async () => {
    const f = await video.uploadVideoFile(base.file);
    return { file: f, row: { uri: f.uri, state: f.state, mimeType: f.mimeType } };
  });
  if (up) {
    const v = { uri: up.file.uri, mimeType: up.file.mimeType };
    await check('U-edit', 'Omni edit of an uploaded video', () => genVideo('U-edit', { prompt: 'Make this video black and white. Keep everything else the same.', video: v, resolution: '360p' }), { cost: omniCost('360p', 3) });
    await check('U-ext', 'Omni extend an uploaded video by 3 s', () => genVideo('U-ext', { prompt: 'Extend this video: the ball rolls away.', video: v, resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 6) });
    if (firstImage) await check('U-ext-ref', 'Omni extend an uploaded video with a reference image', () => genVideo('U-ext-ref', { prompt: 'Extend this video: the forest in the reference image appears through a window.', video: v, images: [firstImage], resolution: '360p', durationSeconds: 3 }), { cost: omniCost('360p', 6) });
    await check('U-understand', `video understanding on ${MODELS.GEMINI_VIDEO}`, async () => {
      const r = await video.generateFromVideo({ prompt: 'What color is the ball, and what does it do? One sentence.', fileUri: up.file.uri, mimeType: up.file.mimeType });
      return { row: { modelVersion: r.modelVersion, text: r.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').slice(0, 200) } };
    }, { cost: 0.01 });
    await check('U-understand-clip', 'video understanding with clipping offsets (1s-2s)', async () => {
      const r = await video.generateFromVideo({ prompt: 'Describe this part of the clip in one sentence.', fileUri: up.file.uri, mimeType: up.file.mimeType, videoMetadata: { startOffset: '1s', endOffset: '2s' } });
      return { row: { modelVersion: r.modelVersion, text: r.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').slice(0, 200) } };
    }, { cost: 0.01 });
    await video.deleteVideoFile(up.file.uri).catch(() => {});
  }
}

// =====================================================================
// CLI — through dist/cli.js
// =====================================================================
const cliOut = path.join(out, 'cli');
const cli = (args) => spawnSync(process.execPath, [path.join(root, 'dist/cli.js'), ...args, '--output-dir', cliOut, '--log-level', 'error'], { encoding: 'utf8', env: process.env, timeout: 1200000 });
const cliCheck = (args, grab) => async () => {
  const r = cli(args);
  if (r.status !== 0) throw Object.assign(new Error(r.stderr.trim().slice(-400)), { status: /\b402\b/.test(r.stderr) ? 402 : /\b429\b/.test(r.stderr) ? 429 : undefined });
  return { row: { stdout: r.stdout.match(grab)?.[0] ?? r.stdout.trim().slice(-200) } };
};
let cliId;
await check('C-omni', 'CLI --omni 360p 3 s 9:16', async () => {
  const v = await cliCheck(['--omni', '--prompt', P, '--omni-resolution', '360p', '--omni-duration', '3', '--omni-aspect-ratio', '9:16'], /Interaction: \S+/)();
  cliId = v.row.stdout?.replace('Interaction: ', '');
  return v;
}, { cost: omniCost('360p', 3) });
if (cliId) await check('C-omni-prev', 'CLI --omni-previous (edit)', cliCheck(['--omni', '--prompt', 'Make the ball green. Keep everything else the same.', '--omni-previous', cliId, '--omni-resolution', '360p'], /Saved video: \S+/), { cost: omniCost('360p', 3) });
const firstImageFile = path.join(out, 'I-1K-16x9.jpg');
if (firstImage) await check('C-omni-image', 'CLI --omni-image', cliCheck(['--omni', '--prompt', 'Bring this forest to life.', '--omni-image', firstImageFile, '--omni-resolution', '360p', '--omni-duration', '3'], /Saved video: \S+/), { cost: omniCost('360p', 3) });
if (base) {
  await check('C-omni-video', 'CLI --omni-video (upload, edit, delete)', cliCheck(['--omni', '--prompt', 'Make this video sepia. Keep everything else the same.', '--omni-video', base.file, '--omni-resolution', '360p'], /Saved video: \S+/), { cost: omniCost('360p', 3) });
  await check('C-video', 'CLI --video (understanding)', cliCheck(['--video', '--input-video', base.file, '--prompt', 'One sentence: what happens?'], /Saved|✓.*/), { cost: 0.01 });
}
await check('C-omni-uri', 'CLI --omni-delivery uri --omni-task text_to_video', cliCheck(['--omni', '--prompt', P, '--omni-resolution', '360p', '--omni-duration', '3', '--omni-delivery', 'uri', '--omni-task', 'text_to_video'], /Saved video: \S+/), { cost: omniCost('360p', 3) });
await check('C-gemini', 'CLI --gemini (default model)', cliCheck(['--gemini', '--prompt', 'A small paper boat', '--image-size', '1K'], /Saved image: \S+/), { cost: imageCost(NB) });
await check('C-veo', 'CLI --veo → migration message, exit 1, nothing sent', async () => {
  const r = cli(['--veo', '--veo-duration', '8', '--prompt', 'x']);
  if (r.status !== 1 || !/removed in 3\.0/.test(r.stderr)) throw new Error(`status ${r.status}: ${r.stderr.slice(0, 200)}`);
  return { row: { status: r.status } };
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).map((r) => r.id);
console.error(`\nlive battery: ${passed}/${results.length} passed; estimated spend $${spent.toFixed(2)} of $${budget}${stopped ? `; stopped (${stopped})` : ''}${freeOnly ? ' (free checks only)' : ''}`);
if (failed.length) console.error(`failed: ${failed.join(', ')}`);
console.error(`record: ${path.relative(root, record)}`);
process.exit(failed.length === 0 && !stopped ? 0 : 1);
