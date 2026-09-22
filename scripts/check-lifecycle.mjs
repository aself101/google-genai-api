#!/usr/bin/env node
/**
 * Model lifecycle gate (spec D16). The package catalogs only models Google has
 * announced no shutdown for (D2); this check is what keeps that true.
 *
 * Fails (exit 1) when, for any id in MODELS / VEO_MODELS:
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
const PAGE_URL = 'https://ai.google.dev/gemini-api/docs/deprecations.md.txt';
const SNAPSHOT = path.join(root, 'docs/api/deprecations.md');
const NO_SHUTDOWN = 'No shutdown date announced';

// Cataloged ids Google does not list on the deprecations page. Each entry is a
// judgment call recorded in the spec (D16); keep it short.
const NOT_LISTED_ALLOWLIST = new Set(['gemini-3.1-flash-lite-image']);

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

/** Rows of the form `| \`model-id\` | release | shutdown | replacement |`. */
function parseRows(text) {
  const rows = new Map();
  const row = /^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;
  for (const line of text.split('\n')) {
    const m = row.exec(line);
    if (!m) continue;
    const [, id, , shutdown, replacement] = m.map((s) => s.trim());
    if (!rows.has(id)) rows.set(id, []);
    rows.get(id).push({ shutdown, replacement });
  }
  return rows;
}

/** Model-id string values inside `export const MODELS…{…}` / `VEO_MODELS…{…}`. */
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
    ids: [...Object.values(config.MODELS), ...Object.values(config.VEO_MODELS)],
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
