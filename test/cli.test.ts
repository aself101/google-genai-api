/**
 * CLI subprocess tests (spec D8). The CLI had no tests in 1.x.
 *
 * Each test spawns the built CLI with the fetch-replay preload, a throwaway
 * HOME and working directory (so no real ~/.google-genai/.env or ./.env is
 * read), a fake API key, and an output directory it inspects afterwards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(root, 'dist/cli.js');
const PRELOAD = path.join(root, 'test/helpers/fetch-replay.mjs');

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const imageResponse = (parts: unknown[], finishReason = 'STOP') => ({
  json: { candidates: [{ content: { role: 'model', parts }, finishReason }] },
});

let dir: string;
let out: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'genai-cli-'));
  out = path.join(dir, 'out');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  requests: Array<{ url: string; method: string; body: string | null }>;
}

function cli(args: string[], fixtures: unknown[] = []): Run {
  const fixtureFile = path.join(dir, 'fixtures.json');
  const log = path.join(dir, 'wire.log');
  writeFileSync(fixtureFile, JSON.stringify(fixtures));
  writeFileSync(log, '');
  const r = spawnSync(process.execPath, ['--import', PRELOAD, CLI, ...args, '--output-dir', out, '--log-level', 'error'], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      GOOGLE_GENAI_API_KEY: 'AIzaSyTest1234567890123456789012345678',
      WIRE_FIXTURE: fixtureFile,
      WIRE_LOG: log,
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  const requests = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, requests };
}

function files(sub: string): string[] {
  const d = path.join(out, sub);
  return existsSync(d) ? readdirSync(d).sort() : [];
}

describe('CLI — help', () => {
  // `-h, --help` is a plain option, which replaces commander's own handling; 1.x
  // fell through to the "no mode selected" branch and exited 1.
  it.each([['--help'], ['-h']])('%s prints usage and exits 0', (flag) => {
    const r = cli([flag]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.requests).toHaveLength(0);
  });

  it('no mode selected is still an error (exit 1)', () => {
    expect(cli(['--prompt', 'x']).status).toBe(1);
  });
});

describe('CLI — validation exits (no network)', () => {
  it('rejects --image-size a model does not take, before any request', () => {
    const r = cli(['--model', 'gemini-3.1-flash-lite-image', '--prompt', 'x', '--image-size', '2K']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid imageSize '2K'");
    expect(r.requests).toHaveLength(0);
  });

  it('rejects a lowercase size as malformed', () => {
    const r = cli(['--gemini', '--prompt', 'x', '--image-size', '2k']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('uppercase K');
    expect(r.requests).toHaveLength(0);
  });

  it('rejects an unknown --capability-validation value', () => {
    const r = cli(['--gemini', '--prompt', 'x', '--capability-validation', 'maybe']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--capability-validation must be 'error' or 'warn'");
  });

  it('rejects --gemini-3-pro combined with a different --model', () => {
    const r = cli(['--gemini-3-pro', '--model', 'gemini-3.1-flash-image', '--prompt', 'x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('cannot be combined with --model');
  });

  it('rejects the removed --imagen flag', () => {
    const r = cli(['--imagen', '--prompt', 'x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown option '--imagen'");
  });

  it('Veo: rejects 4k on Lite before any request', () => {
    const r = cli(['--veo', '--veo-model', 'veo-3.1-lite-generate-preview', '--prompt', 'x', '--veo-resolution', '4k']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid resolution '4k'");
    expect(r.requests).toHaveLength(0);
  });
});

describe('CLI — image generation', () => {
  it('--gemini: default model, no aspect ratio sent unless given, image and metadata written', () => {
    const r = cli(['--gemini', '--prompt', 'a red apple'], [imageResponse([{ inlineData: { mimeType: 'image/png', data: PNG } }])]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0].url).toContain('/models/gemini-3.1-flash-image:generateContent');
    const body = JSON.parse(r.requests[0].body!);
    expect(body.generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'] });

    const written = files('gemini-3.1-flash-image');
    const png = written.filter((f) => f.endsWith('.png'));
    const json = written.filter((f) => f.endsWith('.json'));
    expect(png).toHaveLength(1);
    expect(json).toHaveLength(1);
    const metadata = JSON.parse(readFileSync(path.join(out, 'gemini-3.1-flash-image', json[0]), 'utf8'));
    // 1.x regenerated filenames here, so they never matched the saved files
    expect(metadata.outputs).toEqual([{ type: 'image', filename: png[0] }]);
    expect(metadata.finishReason).toBe('STOP');
  });

  it('--model, --aspect-ratio, --image-size and repeated --input-image all reach the wire', () => {
    const a = path.join(dir, 'a.png');
    const b = path.join(dir, 'b.png');
    writeFileSync(a, Buffer.from(PNG, 'base64'));
    writeFileSync(b, Buffer.from(PNG, 'base64'));
    const r = cli(
      ['--model', 'gemini-3-pro-image', '--prompt', 'combine', '--aspect-ratio', '4:5', '--image-size', '2K', '-i', a, '-i', b],
      [imageResponse([{ inlineData: { mimeType: 'image/png', data: PNG } }])]
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.requests[0].url).toContain('/models/gemini-3-pro-image:generateContent');
    const body = JSON.parse(r.requests[0].body!);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '4:5', imageSize: '2K' });
    expect(body.contents[0].parts).toHaveLength(3); // prompt + 2 images
  });

  it('thought images are not saved; two final images get _1/_2 names', () => {
    const r = cli(
      ['--gemini-3-pro', '--prompt', 'variations'],
      [
        imageResponse([
          { thought: true, inlineData: { mimeType: 'image/png', data: PNG } },
          { inlineData: { mimeType: 'image/png', data: PNG } },
          { inlineData: { mimeType: 'image/png', data: PNG } },
        ]),
      ]
    );
    expect(r.status, r.stderr).toBe(0);
    const png = files('gemini-3-pro-image').filter((f) => f.endsWith('.png'));
    expect(png).toHaveLength(2);
    expect(png.some((f) => f.endsWith('_1.png'))).toBe(true);
    expect(png.some((f) => f.endsWith('_2.png'))).toBe(true);
    // Where 1.x's metadata bug always showed: it listed unsuffixed names
    const [json] = files('gemini-3-pro-image').filter((f) => f.endsWith('.json'));
    const metadata = JSON.parse(readFileSync(path.join(out, 'gemini-3-pro-image', json), 'utf8'));
    expect(metadata.outputs.map((o: { filename: string }) => o.filename).sort()).toEqual(png);
  });

  it('no image returned → exit 1, naming the finishReason; metadata still written', () => {
    const r = cli(['--gemini', '--prompt', 'x'], [imageResponse([], 'IMAGE_SAFETY')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('returned no image (finishReason: IMAGE_SAFETY)');
    expect(files('gemini-3.1-flash-image').filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it("--capability-validation warn sends a value the table rejects", () => {
    const r = cli(
      ['--model', 'gemini-3-pro-image', '--prompt', 'x', '--aspect-ratio', '1:8', '--capability-validation', 'warn'],
      [imageResponse([{ inlineData: { mimeType: 'image/png', data: PNG } }])]
    );
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.requests[0].body!).generationConfig.imageConfig).toEqual({ aspectRatio: '1:8' });
  });

  it('an unknown --model id is sent (spec D3)', () => {
    const r = cli(['--model', 'gemini-9-imaginary', '--prompt', 'x'], [imageResponse([{ inlineData: { mimeType: 'image/png', data: PNG } }])]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.requests[0].url).toContain('/models/gemini-9-imaginary:generateContent');
  });

  it('a vendor 400 exits 1 with the vendor message', () => {
    const r = cli(
      ['--gemini', '--prompt', 'x'],
      [{ status: 400, json: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Prompt was rejected upstream' } } }]
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Prompt was rejected upstream');
  });
});

describe('CLI — Veo generation', () => {
  it('submits with source shape, downloads the video, writes metadata', () => {
    const doneOp = {
      name: 'models/veo-3.1-lite-generate-preview/operations/op1',
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media' } }],
        },
      },
    };
    const r = cli(
      ['--veo', '--veo-model', 'veo-3.1-lite-generate-preview', '--prompt', 'waves', '--veo-resolution', '1080p', '--veo-duration', '8'],
      [{ json: doneOp }, { base64: Buffer.from('fake-mp4-bytes').toString('base64'), contentType: 'video/mp4' }]
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.requests).toHaveLength(2);
    expect(r.requests[0].url).toContain('/models/veo-3.1-lite-generate-preview:predictLongRunning');
    const body = JSON.parse(r.requests[0].body!);
    expect(body.instances[0]).toEqual({ prompt: 'waves' });
    expect(body.parameters).toMatchObject({ resolution: '1080p', durationSeconds: 8 });
    expect(r.requests[1].url).toContain('files/abc123:download');

    const written = files('veo/veo-3.1-lite-generate-preview');
    const mp4 = written.filter((f) => f.endsWith('.mp4'));
    expect(mp4).toHaveLength(1);
    expect(readFileSync(path.join(out, 'veo/veo-3.1-lite-generate-preview', mp4[0]), 'utf8')).toBe('fake-mp4-bytes');
  });

  it('--veo-image: the image goes in instances[0].image', () => {
    const png = path.join(dir, 'first.png');
    writeFileSync(png, Buffer.from(PNG, 'base64'));
    const doneOp = {
      name: 'models/veo-3.1-generate-preview/operations/op2',
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/def456:download?alt=media' } }],
        },
      },
    };
    const r = cli(
      ['--veo', '--prompt', 'the cat stretches', '--veo-image', png],
      [{ json: doneOp }, { base64: Buffer.from('fake-mp4-bytes').toString('base64'), contentType: 'video/mp4' }]
    );
    expect(r.status, r.stderr).toBe(0);
    const body = JSON.parse(r.requests[0].body!);
    expect(body.instances[0]).toEqual({ prompt: 'the cat stretches', image: { bytesBase64Encoded: PNG, mimeType: 'image/png' } });
    expect(files('veo/veo-3.1-generate-preview').filter((f) => f.endsWith('.mp4'))).toHaveLength(1);
  });
});
