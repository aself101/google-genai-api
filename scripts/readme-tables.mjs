#!/usr/bin/env node
/**
 * README value tables, generated from the catalog (spec §8 P6).
 *
 * Two review rounds found README value lists that had drifted from the code —
 * retired versions, a missing `4k`, stale ratio lists. Every model/value table
 * in the README is therefore rendered from src/config.ts between markers:
 *
 *   <!-- generated:image-models -->  …  <!-- /generated:image-models -->
 *
 * and test/readme.test.ts fails if a marked block differs from a fresh render.
 * Prose and code comments do not repeat value lists; they link to the tables.
 *
 *   npm run readme:tables            rewrite the blocks in README.md
 *   npm run readme:tables -- --check exit 1 if any block is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const code = (v) => `\`${v}\``;
const list = (vs) => vs.map(code).join(', ');
const yesNo = (b) => (b ? 'yes' : '—');

/** @param {typeof import('../src/config.ts')} config */
export function renderTables(config) {
  const { MODELS, DEFAULT_IMAGE_MODEL, MODEL_CONSTRAINTS, OMNI_MODELS, OMNI_MODEL_CONSTRAINTS, IMAGE_SIZES, ASPECT_RATIOS } = config;
  const imageIds = [MODELS.GEMINI_NANO_BANANA_2_1, MODELS.GEMINI_3_1_FLASH, MODELS.GEMINI_3_1_FLASH_LITE, MODELS.GEMINI_3_PRO];

  const image = [
    '| Model | Aspect ratios | `imageSize` | Input images |',
    '|---|---|---|---|',
    ...imageIds.map((id) => {
      const c = MODEL_CONSTRAINTS[id];
      const name = id === DEFAULT_IMAGE_MODEL ? `${code(id)} (default)` : code(id);
      const ratios = c.aspectRatios.length === ASPECT_RATIOS.length ? `all ${c.aspectRatios.length}` : list(c.aspectRatios);
      const sizes = c.imageSizes ? list(c.imageSizes) : 'not accepted';
      return `| ${name} | ${ratios} | ${sizes} | up to ${c.inputImagesMax} |`;
    }),
    '',
    `All aspect ratios: ${list(ASPECT_RATIOS)}. All sizes: ${list(IMAGE_SIZES)} (uppercase K).`,
  ].join('\n');

  const omni = [
    '| Model | Aspect ratios | Resolutions | Duration (s) | First+last frame / extension (s) | Images | Edit | Extend | Audio |',
    '|---|---|---|---|---|---|---|---|---|',
    ...Object.values(OMNI_MODELS).map((id) => {
      const c = OMNI_MODEL_CONSTRAINTS[id];
      const d = c.durationSeconds;
      const name = id === OMNI_MODELS.OMNI_1_2_FLASH ? `${code(id)} (default)` : code(id);
      return `| ${name} | ${list(c.aspectRatios)} | ${list(c.resolutions)} | ${d.min}-${d.max} (default ${d.default}) | ${d.min}-${c.interpolationAndExtensionMaxSeconds}; extended up to ${c.extendedTotalMaxSeconds} total | up to ${c.maxImages} | ${yesNo(c.features.editing)} | ${yesNo(c.features.extension)} | ${yesNo(c.features.nativeAudio)} |`;
    }),
  ].join('\n');

  const video = `Video understanding uses ${code(MODELS.GEMINI_VIDEO)}.`;

  return { 'image-models': image, 'omni-models': omni, 'video-model': video };
}

// The body may be empty (a freshly inserted block): `(?:…\n)?`.
const BLOCK = /<!-- generated:([a-z-]+) -->\n(?:([\s\S]*?)\n)?<!-- \/generated:\1 -->/g;

/** The generated blocks found in a README, by name. */
export function readBlocks(readme) {
  const found = {};
  for (const m of readme.replace(/\r\n/g, '\n').matchAll(BLOCK)) found[m[1]] = m[2] ?? '';
  return found;
}

/** README with every marked block replaced by its fresh render. Unknown block names throw. */
export function applyTables(readme, tables) {
  const crlf = readme.includes('\r\n');
  const out = readme.replace(/\r\n/g, '\n').replace(BLOCK, (_, name) => {
    if (!(name in tables)) throw new Error(`README has a generated block "${name}" with no renderer`);
    return `<!-- generated:${name} -->\n${tables[name]}\n<!-- /generated:${name} -->`;
  });
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readmePath = path.join(root, 'README.md');
  const config = await import(path.join(root, 'src/config.ts'));
  const tables = renderTables(config);
  const readme = readFileSync(readmePath, 'utf8');
  const found = readBlocks(readme);
  const missing = Object.keys(tables).filter((n) => !(n in found));
  if (missing.length) {
    console.error(`readme-tables: README is missing generated block(s): ${missing.join(', ')}`);
    process.exit(1);
  }
  const next = applyTables(readme, tables);
  if (process.argv.includes('--check')) {
    if (next !== readme) {
      console.error('readme-tables: README tables are stale — run `npm run readme:tables`');
      process.exit(1);
    }
    console.log('readme-tables: README tables match the catalog');
  } else {
    writeFileSync(readmePath, next);
    console.log(`readme-tables: rendered ${Object.keys(tables).length} block(s)`);
  }
}
