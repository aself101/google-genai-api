/**
 * Preload for CLI subprocess tests (spec D8): `node --import ./fetch-replay.mjs dist/cli.js …`.
 *
 * A subprocess cannot see a fetch stub installed in the test process, so this
 * replaces `globalThis.fetch` inside the child before the CLI loads. The SDK
 * resolves the global per call (spec §1.5), so every request goes through here.
 *
 * WIRE_FIXTURE — JSON file: an array of responses served in order, each
 *                `{ status?, json }` or `{ status?, base64, contentType? }`.
 * WIRE_LOG     — file that receives one JSON line per request: { url, method, body }.
 *
 * A request beyond the last fixture exits the process with code 97, so a test
 * can never pass because an unexpected call happened to get a plausible answer.
 */

import { appendFileSync, readFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(process.env.WIRE_FIXTURE, 'utf8'));
let served = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  const body = typeof init.body === 'string' ? init.body : null;
  appendFileSync(process.env.WIRE_LOG, `${JSON.stringify({ url, method, body })}\n`);

  const fixture = fixtures[served++];
  if (!fixture) {
    process.stderr.write(`fetch-replay: unexpected request #${served}: ${method} ${url}\n`);
    process.exit(97);
  }
  if (fixture.base64 !== undefined) {
    return new Response(Buffer.from(fixture.base64, 'base64'), {
      status: fixture.status ?? 200,
      headers: { 'content-type': fixture.contentType ?? 'application/octet-stream' },
    });
  }
  return new Response(JSON.stringify(fixture.json), {
    status: fixture.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
};
