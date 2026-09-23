/**
 * Assertions that hide a type hole (ship review, 2026-09-22). Two review rounds
 * reported "no `!` left in src/" from a regex that missed `x!]`; the third found
 * one. This parses src/ with the TypeScript compiler instead of matching text.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** `file:line  text` for every non-null assertion and every `as X as Y`. */
function holes(fileName: string, text: string): string[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (n: ts.Node) => `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}  ${n.getText().slice(0, 60)}`;
  (function walk(n: ts.Node): void {
    if (ts.isNonNullExpression(n)) found.push(`non-null ${at(n)}`);
    if (ts.isAsExpression(n) && ts.isAsExpression(n.expression)) found.push(`double assertion ${at(n)}`);
    ts.forEachChild(n, walk);
  })(sf);
  return found;
}

const files = readdirSync(src, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.ts'));

describe('src/ has no non-null or double assertions', () => {
  it('scans every source file', () => {
    expect(files.length).toBeGreaterThanOrEqual(8); // api, cli, config, errors, utils, veo-api, video-api, types
  });

  it('finds none', () => {
    const found = files.flatMap((f) => holes(f, readFileSync(path.join(src, f), 'utf8')));
    expect(found).toEqual([]);
  });

  it('control: detects the shapes the old regex missed', () => {
    const found = holes('control.ts', 'const a = [x!];\nf(y!);\nz!.q;\nconst b = w as unknown as T;\n');
    expect(found).toHaveLength(4);
  });
});
