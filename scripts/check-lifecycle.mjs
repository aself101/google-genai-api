#!/usr/bin/env node
/**
 * Model lifecycle gate (spec D16). The package catalogs only models Google has
 * announced no shutdown for (D2); this check is what keeps that true.
 *
 * Fails (exit 1) when, for any id in MODELS / OMNI_MODELS:
 *   - Google's deprecations page lists a shutdown date for it, or
 *   - the id is not on the page at all (unless allowlisted below), or
 *   - the id appears with conflicting shutdown values.
 * Also fails if the page parses to zero model rows — a check that reads
 * nothing must not pass.
 *
 * Usage (run under tsx so src/config.ts can be imported without a build):
 *   npm run check:lifecycle              live page, current catalog
 *   npm run check:lifecycle -- --offline committed snapshot, current catalog
 *   npm run check:lifecycle -- --control snapshot + the 1.x catalog; must FAIL,
 *                                        proving the gate can fire
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The ai.google.dev URL now redirects here (2026-11); fetch the canonical one.
const PAGE_URL = 'https://aistudio.google.com/docs/deprecations.md';
const SNAPSHOT = path.join(root, 'docs/api/deprecations.md');
// The page in its pre-2026-11 pipe-table format. --control also parses it, so
// neither format's parser can rot unnoticed while the live page uses the other.
const PIPE_FIXTURE = path.join(root, 'test/fixtures/deprecations-2026-09-22-pipe-format.md');
const NO_SHUTDOWN = 'No shutdown date announced';

// Cataloged ids Google does not list on the deprecations page. Each entry is a
// judgment call recorded in the spec (D16); keep it short.
const NOT_LISTED_ALLOWLIST = new Set([]);

// The last 1.x release. --control reads its catalog from git so the control
// does not depend on anything this release changes.
const V1_COMMIT = '3e52d92';

const args = new Set(process.argv.slice(2));
const control = args.has('--control');
const offline = args.has('--offline') || control;

async function loadPage() {
  if (offline) return { text: readFileSync(SNAPSHOT, 'utf8'), source: 'docs/api/deprecations.md (snapshot)' };
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`GET ${PAGE_URL} → HTTP ${res.status}`);
  return { text: await res.text(), source: PAGE_URL };
}

/**
 * Model rows, keyed by id. Two page formats are read:
 *   - pipe tables: `| \`model-id\` | release | shutdown | replacement |`
 *     (the page until 2026-11; still the format of older snapshots)
 *   - Markdoc tables: `{% table %}` blocks whose rows are separated by `---`
 *     lines and whose cells are `* value` list items (the page from 2026-11)
 * A row counts only when its first cell is a backticked id, so header rows
 * ("Model", "Release date", ...) are skipped in both formats.
 */
function parseRows(text) {
  const rows = new Map();
  const add = (cells) => {
    const id = /^`([^`]+)`$/.exec(cells[0] ?? '');
    if (!id || cells.length < 3) return;
    if (!rows.has(id[1])) rows.set(id[1], []);
    rows.get(id[1]).push({ shutdown: cells[2], replacement: cells[3] ?? '' });
  };

  const pipe = /^\|\s*(`[^`]+`)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;
  let inTable = false;
  let cells = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const p = pipe.exec(line);
    if (p) { add(p.slice(1).map((c) => c.trim())); continue; }
    if (trimmed.startsWith('{% table')) { inTable = true; cells = []; continue; }
    if (!inTable) continue;
    if (trimmed === '{% /table %}' || trimmed === '---') {
      add(cells);
      cells = [];
      if (trimmed === '{% /table %}') inTable = false;
      continue;
    }
    // A cell starts at a `*` list item; any other line continues the cell
    // (only the first line of a cell is kept — ids and dates are one-liners).
    const cell = /^\s*\*(?:\s(.*))?$/.exec(line);
    if (cell) cells.push((cell[1] ?? '').trim());
  }
  return rows;
}

/** Model-id string values inside `export const MODELS…{…}` / `VEO_MODELS…{…}` (the 1.x catalog). */
function idsFromSource(source) {
  const ids = [];
  for (const name of ['MODELS', 'VEO_MODELS']) {
    const block = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(source);
    if (!block) throw new Error(`could not find "export const ${name}" in the 1.x config`);
    for (const m of block[1].matchAll(/:\s*'([^']+)'/g)) ids.push(m[1]);
  }
  return ids;
}

async function loadCatalog() {
  if (control) {
    const source = execSync(`git show ${V1_COMMIT}:src/config.ts`, { cwd: root, encoding: 'utf8' });
    return { ids: idsFromSource(source), source: `1.x catalog (${V1_COMMIT}:src/config.ts)` };
  }
  const config = await import(path.join(root, 'src/config.ts'));
  return {
    ids: [...Object.values(config.MODELS), ...Object.values(config.OMNI_MODELS)],
    source: 'src/config.ts',
  };
}

const [page, catalog] = await Promise.all([loadPage(), loadCatalog()]);
const rows = parseRows(page.text);
const failures = [];

if (rows.size === 0) {
  failures.push(`parsed zero model rows from ${page.source} — the page format changed or the fetch returned something else`);
}

for (const id of new Set(catalog.ids)) {
  const entries = rows.get(id);
  if (!entries) {
    if (!NOT_LISTED_ALLOWLIST.has(id)) failures.push(`${id}: not listed on the deprecations page (allowlist it in this script if that is expected)`);
    continue;
  }
  const shutdowns = new Set(entries.map((e) => e.shutdown));
  if (shutdowns.size > 1) {
    failures.push(`${id}: conflicting shutdown values on the page: ${[...shutdowns].join(' / ')}`);
    continue;
  }
  const [{ shutdown, replacement }] = entries;
  if (shutdown !== NO_SHUTDOWN) {
    failures.push(`${id}: shutdown ${shutdown}${replacement ? ` → replacement ${replacement}` : ''} — drop it from the catalog (spec D2)`);
  }
}

const header = `check-lifecycle: ${catalog.ids.length} catalog ids (${catalog.source}) vs ${rows.size} page models (${page.source})`;
if (control) {
  const pipeRows = parseRows(readFileSync(PIPE_FIXTURE, 'utf8')).size;
  if (pipeRows === 0) {
    console.error(`${header}\ncheck-lifecycle --control: the pipe-format fixture parsed to zero rows — that parser is broken`);
    process.exit(1);
  }
  if (failures.length === 0) {
    console.error(`${header}\ncheck-lifecycle --control: the 1.x catalog passed — the gate is inert`);
    process.exit(1);
  }
  console.log(`${header}\ncheck-lifecycle --control: ${failures.length} expected failure(s), gate can fire:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(0);
}
if (failures.length) {
  console.error(`${header}\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
if (offline) console.warn('check-lifecycle: WARNING — checked against the committed snapshot, not the live page');
console.log(`${header}\ncheck-lifecycle: every cataloged model has no announced shutdown`);
