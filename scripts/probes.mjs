#!/usr/bin/env node
// P0 live probes for the 2.0 spec (docs/specs/google-genai-api-2.0-spec-v0_1_0.md §7).
// PAID: ~10 image generations + up to 2 short Veo Lite jobs. Not part of `npm test`.
// Usage: node scripts/probes.mjs [--image-only] [--out <dir>]
// Key: GOOGLE_GENAI_API_KEY. Results print as JSON lines; images are written to --out.
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const imageOnly = args.includes('--image-only');
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'test-outputs/probes';
mkdirSync(outDir, { recursive: true });

const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY not set');
const ai = new GoogleGenAI({ apiKey });

// PNG/JPEG/WebP dimensions from header bytes.
function dims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), fmt: 'jpeg' };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.toString('ascii', 8, 12) === 'WEBP') return { fmt: 'webp' };
  return { fmt: 'unknown' };
}

const saved = [];
async function image(id, model, contents, config) {
  const t0 = Date.now();
  try {
    const res = await ai.models.generateContent({ model, contents, config });
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const imgs = parts.filter((p) => p.inlineData && !p.thought);
    const out = imgs.map((p, n) => {
      const buf = Buffer.from(p.inlineData.data, 'base64');
      const file = join(outDir, `${id}${n ? `-${n}` : ''}.${dims(buf).fmt}`);
      writeFileSync(file, buf);
      saved.push({ file, mimeType: p.inlineData.mimeType, data: p.inlineData.data });
      return { ...dims(buf), mimeType: p.inlineData.mimeType, file };
    });
    console.log(JSON.stringify({ id, model, ok: imgs.length > 0, images: out, thoughtParts: parts.filter((p) => p.thought).length, finish: res.candidates?.[0]?.finishReason, ms: Date.now() - t0 }));
  } catch (e) {
    console.log(JSON.stringify({ id, model, ok: false, status: e.status, error: String(e.message).slice(0, 300), ms: Date.now() - t0 }));
  }
}

const P = 'A lighthouse on a rocky coast at dusk, wide establishing shot';

// V2 — past-shutdown previews (paper date 2026-06-25) vs GA siblings
await image('v2-3-pro-preview', 'gemini-3-pro-image-preview', P, { imageConfig: { aspectRatio: '1:1' } });
await image('v2-3.1-flash-preview', 'gemini-3.1-flash-image-preview', P, { imageConfig: { aspectRatio: '1:1' } });

// V3 — control: the 1.x shape (flat aspectRatio, exactly what api.ts:181 sends) vs the 2.0 shape
await image('v3-control-1x-flat', 'gemini-3.1-flash-image', P, { aspectRatio: '16:9' });
await image('v3-imageConfig', 'gemini-3.1-flash-image', P, { imageConfig: { aspectRatio: '16:9' } });

// V10 — imageSize spelling and effect
await image('v10-512', 'gemini-3.1-flash-image', P, { imageConfig: { aspectRatio: '1:1', imageSize: '512' } });
await image('v10-2K', 'gemini-3.1-flash-image', P, { imageConfig: { aspectRatio: '1:1', imageSize: '2K' } });
await image('v10-lite-2K-expect-reject', 'gemini-3.1-flash-lite-image', P, { imageConfig: { aspectRatio: '1:1', imageSize: '2K' } });

// Lite + an extended ratio Lite's page does not list (the "14 ratios" ambiguity)
await image('lite-1:4', 'gemini-3.1-flash-lite-image', P, { imageConfig: { aspectRatio: '1:4' } });

// V11 — three input images (reuse outputs above)
const inputs = saved.slice(0, 3).map((s) => ({ inlineData: { mimeType: s.mimeType, data: s.data } }));
if (inputs.length === 3) {
  await image('v11-3-inputs', 'gemini-3.1-flash-image', [{ text: 'Combine these three scenes into one triptych panel' }, ...inputs], { imageConfig: { aspectRatio: '16:9' } });
} else {
  console.log(JSON.stringify({ id: 'v11-3-inputs', skipped: `only ${inputs.length} input images available` }));
}

if (!imageOnly) {
  // V8 — Veo Lite: references (docs ambiguous) should be rejected fast if unsupported; T2V 720p/4s should complete.
  const veo = async (id, req) => {
    const t0 = Date.now();
    try {
      let op = await ai.models.generateVideos(req);
      while (!op.done) {
        await new Promise((r) => setTimeout(r, 10000));
        op = await ai.operations.getVideosOperation({ operation: op });
      }
      const v = op.response?.generatedVideos?.[0]?.video;
      if (op.error || !v) throw Object.assign(new Error(JSON.stringify(op.error ?? op.response)), { status: 'op-error' });
      const file = join(outDir, `${id}.mp4`);
      await ai.files.download({ file: v, downloadPath: file });
      console.log(JSON.stringify({ id, ok: true, file, ms: Date.now() - t0 }));
    } catch (e) {
      console.log(JSON.stringify({ id, ok: false, status: e.status, error: String(e.message).slice(0, 300), ms: Date.now() - t0 }));
    }
  };
  const ref = saved[0];
  if (ref) {
    await veo('v8-lite-refs', {
      model: 'veo-3.1-lite-generate-preview',
      prompt: 'The lighthouse beam sweeps across the water',
      config: { durationSeconds: 8, referenceImages: [{ image: { imageBytes: ref.data, mimeType: ref.mimeType }, referenceType: 'asset' }] },
    });
  }
  await veo('v8-lite-t2v', {
    model: 'veo-3.1-lite-generate-preview',
    prompt: 'Waves crash against a lighthouse at dusk',
    config: { resolution: '720p', durationSeconds: 4, aspectRatio: '16:9' },
  });
}
