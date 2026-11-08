/**
 * README gates (spec V5, V15, V17). The README is checked mechanically because
 * two review rounds each found ~10 locations a hand-made list had missed.
 *
 * (a) every identifier imported from `google-genai-api…` in a README code block
 *     is exported by that subpath — runtime exports ∪ the subpath's .d.ts
 *     exports, since interfaces and type aliases exist only in the latter
 * (b) every <!-- generated:… --> block equals a fresh render from the catalog
 * (c) every #anchor link resolves to a heading
 * (V15) no 1.x value lists, no stale aspect default, no hardcoded test stats
 * (V5) retired model names appear only inside the upgrade guides ("Upgrading to
 *      3.0", "Upgrading to 2.0"), or on a line that links to the 3.0 guide
 *
 * Runs against dist/ (built by test/global-setup.ts).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as config from '../src/config.js';
// @ts-expect-error — plain .mjs script, no declarations
import { renderTables, readBlocks } from '../scripts/readme-tables.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, { import: string; types: string }>;
};

/** Exported names per public specifier, runtime ∪ declarations. */
const exportsBySpecifier = new Map<string, Set<string>>();

beforeAll(async () => {
  const dtsFiles = Object.values(pkg.exports).map((e) => path.join(root, e.types));
  const program = ts.createProgram(dtsFiles, { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const checker = program.getTypeChecker();
  for (const [sub, entry] of Object.entries(pkg.exports)) {
    const specifier = sub === '.' ? 'google-genai-api' : `google-genai-api/${sub.replace(/^\.\//, '')}`;
    const names = new Set<string>(Object.keys(await import(pathToFileURL(path.join(root, entry.import)).href)));
    const source = program.getSourceFile(path.join(root, entry.types));
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (moduleSymbol) for (const s of checker.getExportsOfModule(moduleSymbol)) names.add(s.getName());
    exportsBySpecifier.set(specifier, names);
  }
});

let namesChecked = 0;

/** Import problems in a README: named imports from google-genai-api… that do not exist. */
function importFailures(readme: string): string[] {
  const failures: string[] = [];
  namesChecked = 0;
  const blocks = [...readme.matchAll(/```(?:typescript|ts|js|javascript)\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const block of blocks) {
    for (const m of block.matchAll(/import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+'(google-genai-api[^']*)'/g)) {
      const specifier = m[2];
      const known = exportsBySpecifier.get(specifier);
      if (!known) {
        failures.push(`${specifier}: not a package export`);
        continue;
      }
      const names = m[1]
        .replace(/\/\/[^\n]*/g, '')
        .split(',')
        .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      for (const name of names) {
        namesChecked++;
        if (!known.has(name)) failures.push(`${specifier}: '${name}' is not exported`);
      }
    }
  }
  return failures;
}

/** GitHub's heading anchor: lowercase, drop punctuation except - and space, spaces → -. */
function anchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function anchorFailures(readme: string): string[] {
  const withoutCode = readme.replace(/```[\s\S]*?```/g, '');
  const anchors = new Set([...withoutCode.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => anchor(m[1])));
  return [...withoutCode.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]).filter((a) => !anchors.has(a)).map((a) => `#${a}`);
}

function section(readme: string, heading: string): string {
  const start = readme.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const next = readme.indexOf('\n## ', start + 3);
  return readme.slice(start, next < 0 ? undefined : next);
}

describe('README (V17 a): every documented import exists', () => {
  it('has no named import that the package does not export', () => {
    expect(importFailures(README)).toEqual([]);
    // Non-vacuous: the README's export blocks alone list ~70 names. A parser
    // that stopped matching code fences would check 0 and still "pass".
    expect(namesChecked).toBeGreaterThan(60);
  });

  it('checks type-only exports too (interfaces exist only in .d.ts)', () => {
    const root = exportsBySpecifier.get('google-genai-api')!;
    expect(root.has('GeminiGenerateParams')).toBe(true); // type
    expect(root.has('ValidationError')).toBe(true); // runtime
    expect(importFailures("```typescript\nimport type { GeminiGenerateParams } from 'google-genai-api';\n```")).toEqual([]);
  });

  it('control: the 1.x README fails (its export claims were wrong)', () => {
    // The 1.x README (3e52d92) as a fixture, not `git show`: CI checks out one commit.
    const v1 = readFileSync(path.join(root, 'test/fixtures/README-1.3.0.md'), 'utf8').replace(/\r\n/g, '\n');
    const failures = importFailures(v1);
    expect(failures).toContain("google-genai-api: 'extractImagenImages' is not exported");
    expect(failures).toContain("google-genai-api: 'GoogleGenAIVeoAPI' is not exported");
  });
});

describe('README (V17 b): generated tables match the catalog', () => {
  const tables = renderTables(config) as Record<string, string>;
  const found = readBlocks(README) as Record<string, string>;

  it('has every generated block', () => {
    expect(Object.keys(found).sort()).toEqual(Object.keys(tables).sort());
  });

  for (const name of ['image-models', 'omni-models', 'video-model']) {
    it(`block "${name}" equals a fresh render`, () => {
      expect(found[name]).toBe(tables[name]);
    });
  }

  it('control: a hand-edited cell is detected', () => {
    const edited = README.replace('| `360p`, `720p`, `1080p`, `4k` | 3-15', '| `360p`, `720p`, `1080p`, `4k`, `8k` | 3-15');
    expect(edited).not.toBe(README);
    expect((readBlocks(edited) as Record<string, string>)['omni-models']).not.toBe(tables['omni-models']);
  });
});

describe('README (V17 c): internal links resolve', () => {
  it('every #anchor points at a heading', () => {
    expect(anchorFailures(README)).toEqual([]);
  });

  it('control: a renamed heading is detected', () => {
    expect(anchorFailures(README.replace('## Model lifecycle', '## Lifecycle of models'))).toContain('#model-lifecycle');
  });
});

describe('README (V15, V5): no stale values, retired names only in the upgrade guide', () => {
  it('has no 1.x aspect-ratio list, no "default: 1:1", no hardcoded test stats', () => {
    expect(README).not.toMatch(/1:1, 3:4, 4:3, 9:16, 16:9/);
    expect(README).not.toMatch(/default: '?1:1/i);
    expect(README).not.toMatch(/\b358\b|88\.47/);
  });

  // Veo (every model shut down 2026-10-22) joined the retired set in 3.0.
  const retired = /imagen|\bveo\b|veo-|VEO_|GoogleGenAIVeoAPI|imageToVeoInput|gemini-2\.5-flash\b(?!-image)|gemini-3-pro-image-preview|3\.1-flash-image-preview/i;
  const offendingLines = (readme: string): string[] => {
    const up3 = section(readme, 'Upgrading to 3.0');
    const up2 = section(readme, 'Upgrading to 2.0');
    const outside = readme.replace(up3, '').replace(up2, '');
    return outside.split('\n').filter((l) => retired.test(l) && !l.includes('(#upgrading-to-30)'));
  };

  it('mentions retired models only inside the upgrade guides, or beside a link to one', () => {
    expect(section(README, 'Upgrading to 3.0')).not.toBe('');
    expect(section(README, 'Upgrading to 2.0')).not.toBe('');
    expect(offendingLines(README)).toEqual([]);
  });

  it('control: the 2.0 README fails it (Veo all over the page)', () => {
    const v2 = readFileSync(path.join(root, 'test/fixtures/README-2.0.0.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(offendingLines(v2).length).toBeGreaterThan(10);
  });
});
