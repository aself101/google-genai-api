#!/usr/bin/env node
/**
 * Release gate, run by `prepublishOnly` (and by hand: `npm run check:release`).
 * Adapted from openai-image-api's check-release (spec D10).
 *
 * Refuses to publish when any of these is false:
 *   1. CHANGELOG.md has a `## [<version>] - YYYY-MM-DD` heading for package.json's version
 *   2. `## [Unreleased]` exists and holds no entries
 *   3. a fresh `npm run build` succeeds — dist/ is gitignored here, and the
 *      build script empties it first, so the tarball is built from the tree
 *      being published. (Until 3.0 the build did not empty it: tsc never deletes
 *      output, so a removed module — 3.0 removes veo-api.ts — would have shipped
 *      its stale dist/ files, and the dist/ allow-list below passed them.)
 *   4. `npm pack --dry-run` lists nothing outside package.json, dist/,
 *      README.md, LICENSE, CHANGELOG.md, and every dist/ file has a src/ module
 *   5. `check:lifecycle` passes — no cataloged model has an announced shutdown
 *      (spec D16). Needs network; `--offline` checks the committed snapshot
 *      instead, with a warning, for when Google's docs are unreachable.
 *
 * `--control` runs the same checks against a version that does not exist, with
 * a planted stray file, and must fail — proof the gate can fire. Exit 1 on any
 * failure.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const control = process.argv.includes('--control');
const offline = process.argv.includes('--offline');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = control ? '99.99.99' : pkg.version;
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const failures = [];

// 1. heading for this version
if (!new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog)) {
  failures.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" heading`);
}

// 2. [Unreleased] exists and is empty
const unreleased = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m.exec(changelog);
if (!unreleased) {
  failures.push('CHANGELOG.md has no "## [Unreleased]" heading');
} else if (unreleased[1].replace(/\s+/g, '') !== '') {
  failures.push('CHANGELOG.md [Unreleased] still holds entries; move them under the version heading');
}

// 3. fresh build
try {
  execSync('npm run build --silent', { cwd: root, stdio: 'ignore' });
} catch (error) {
  failures.push(`build failed: ${error.message}`);
}

// 4. tarball contents
const allowed = /^(package\.json$|dist\/|README\.md$|LICENSE$|CHANGELOG\.md$)/;
try {
  const json = execSync('npm pack --dry-run --json --silent', { cwd: root, encoding: 'utf8' });
  const files = JSON.parse(json)[0].files.map((f) => f.path);
  const stray = files.filter((f) => !allowed.test(f));
  if (control) stray.push('control/planted-file.txt');
  if (stray.length) failures.push(`npm pack would ship files outside the allow-list:\n    ${stray.join('\n    ')}`);
  // dist/ is allowed wholesale, so a stale build output would pass the allow-list:
  // every dist/ file must come from a module that exists in src/ now.
  const orphans = files.filter((f) => f.startsWith('dist/') && !existsSync(path.join(root, f.replace(/^dist\//, 'src/').replace(/\.(d\.ts\.map|d\.ts|js\.map|js)$/, '.ts'))));
  if (control) orphans.push('dist/control-removed-module.js');
  if (orphans.length) failures.push(`npm pack would ship dist/ file(s) with no src/ module (stale build output):\n    ${orphans.join('\n    ')}`);
  // The allow-list only stops extra files. The README's upgrade guide links to
  // CHANGELOG.md, which 2.0.0's first pack left out, so required files are checked too.
  const required = ['README.md', 'LICENSE', 'CHANGELOG.md', 'dist/api.js', 'dist/api.d.ts', 'dist/cli.js'];
  if (control) files.splice(files.indexOf('CHANGELOG.md'), 1);
  const missing = required.filter((f) => !files.includes(f));
  if (missing.length) failures.push(`npm pack would not ship required file(s): ${missing.join(', ')}`);
} catch (error) {
  failures.push(`npm pack --dry-run failed: ${error.message}`);
}

// 5. model lifecycle (skipped under --control: its own --control proves it can fire)
if (!control) {
  try {
    execSync(`npm run -s check:lifecycle${offline ? ' -- --offline' : ''}`, { cwd: root, stdio: 'inherit' });
  } catch {
    failures.push('check:lifecycle failed (see above) — a cataloged model has an announced shutdown or is missing from the page');
  }
}

if (failures.length) {
  console.error(`check-release: ${failures.length} failure(s) for ${version}${control ? ' (control)' : ''}`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(control ? 0 : 1);
}
if (control) {
  console.error('check-release --control: expected failures and saw none — the gate is inert');
  process.exit(1);
}
console.log(`check-release: ${version} ready (changelog heading, empty [Unreleased], fresh build, tarball clean, lifecycle clean)`);
