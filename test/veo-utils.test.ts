/**
 * Veo file utilities that had no tests (ship review, 2026-09-22): parseVeoMetadata
 * (exported and documented, never called by the package itself), saveVeoMetadata's
 * round trip, generateVeoOutputPath, and imageToVeoInput's format check.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateVeoOutputPath, imageToVeoInput, parseVeoMetadata, saveVeoMetadata } from '../src/utils.js';
import { VEO_MODES } from '../src/config.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'genai-veo-utils-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const VALID = {
  operation_name: 'models/veo-3.1-generate-preview/operations/op1',
  model: 'veo-3.1-generate-preview',
  mode: VEO_MODES.TEXT_TO_VIDEO,
  timestamp: '2026-09-22T00:00:00.000Z',
  parameters: { prompt: 'waves' },
  result: { video_path: '/tmp/v.mp4', status: 'completed' },
};

function file(name: string, content: string): string {
  const p = path.join(dir, name);
  writeFileSync(p, content);
  return p;
}

describe('parseVeoMetadata', () => {
  it('reads back what saveVeoMetadata wrote', async () => {
    const video = path.join(dir, 'clip.mp4');
    const written = await saveVeoMetadata(video, {
      operationName: VALID.operation_name,
      model: VALID.model,
      mode: VALID.mode,
      parameters: VALID.parameters,
    });
    const meta = await parseVeoMetadata(written);
    expect(meta.operation_name).toBe(VALID.operation_name);
    expect(meta.result).toEqual({ video_path: video, status: 'completed' });
  });

  it('returns a valid file unchanged', async () => {
    expect(await parseVeoMetadata(file('ok.json', JSON.stringify(VALID)))).toEqual(VALID);
  });

  it('keeps the 1.x message for a missing file', async () => {
    await expect(parseVeoMetadata(path.join(dir, 'nope.json'))).rejects.toThrow('Metadata file not found');
  });

  it('keeps the 1.x message for invalid JSON', async () => {
    await expect(parseVeoMetadata(file('bad.json', '{not json'))).rejects.toThrow('Invalid JSON in metadata file');
  });

  it('keeps the 1.x message for a missing operation_name', async () => {
    const { operation_name: _dropped, ...rest } = VALID;
    await expect(parseVeoMetadata(file('m.json', JSON.stringify(rest)))).rejects.toThrow(
      'Invalid Veo metadata: missing operation_name'
    );
  });

  // 1.x returned these under the full VeoSavedMetadata type; the caller found out on first use.
  it.each([
    ['a missing result', { ...VALID, result: undefined }, 'missing result'],
    ['a result without video_path', { ...VALID, result: { status: 'completed' } }, 'missing result.video_path'],
    ['an unknown mode', { ...VALID, mode: 'teleport' }, 'unknown mode "teleport"'],
    ['a missing model', { ...VALID, model: '' }, 'missing model'],
    ['an array', [VALID], 'not a JSON object'],
  ])('rejects %s', async (_case, value, message) => {
    await expect(parseVeoMetadata(file('m.json', JSON.stringify(value)))).rejects.toThrow(`Invalid Veo metadata: ${message}`);
  });
});

describe('generateVeoOutputPath', () => {
  it('builds <baseDir>/veo/<model>/<timestamp>_<prompt>.mp4', () => {
    const p = generateVeoOutputPath('veo-3.1-generate-preview', 'A cat playing piano', 'out');
    expect(path.dirname(p)).toBe(path.join('out', 'veo', 'veo-3.1-generate-preview'));
    expect(path.basename(p)).toMatch(/^\d{8}_\d{6}_a-cat-playing-piano\.mp4$/);
  });

  it('makes a model id safe as a directory name', () => {
    const p = generateVeoOutputPath('models/veo 3.1', 'x', 'out');
    expect(path.dirname(p)).toBe(path.join('out', 'veo', 'models-veo-3.1'));
  });

  it('defaults to datasets/google', () => {
    expect(generateVeoOutputPath('veo-3.1-generate-preview', 'x').startsWith(path.join('datasets', 'google', 'veo'))).toBe(true);
  });
});

describe('imageToVeoInput', () => {
  it('rejects a valid image in a format Veo does not take (GIF)', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const p = path.join(dir, 'a.gif');
    writeFileSync(p, gif);
    await expect(imageToVeoInput(p)).rejects.toThrow('Unsupported image format: .gif');
  });

  it('uses the type the bytes show: JPEG in a .png file is image/jpeg', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const p = path.join(dir, 'actually-jpeg.png');
    writeFileSync(p, jpeg);
    expect((await imageToVeoInput(p)).mimeType).toBe('image/jpeg');
  });

  it('returns base64 bytes and the MIME type for a PNG', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const p = path.join(dir, 'a.png');
    writeFileSync(p, png);
    expect(await imageToVeoInput(p)).toEqual({ imageBytes: png.toString('base64'), mimeType: 'image/png' });
  });
});
