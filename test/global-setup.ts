/**
 * Build dist/ before the suite: test/cli.test.ts spawns `node dist/cli.js`,
 * and a bare `npm test` must never pass against a stale build (spec D8).
 */

import { execSync } from 'node:child_process';

export default function setup(): void {
  execSync('npm run build --silent', { stdio: 'inherit' });
}
