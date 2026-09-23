/**
 * The download guard with REAL axios and a local HTTP server (ship review,
 * 2026-09-22). utils-download.test.ts proves imageToInlineData passes the guard
 * to axios; this proves axios actually calls it — at connect time for
 * `lookup`, and before each redirect for `beforeRedirect`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { checkRedirect, createGuardedLookup, guardedLookup, isBlockedAddress } from '../src/download-guard.js';

let server: http.Server;
let port: number;
let hits: string[];
let location = '';

beforeAll(async () => {
  hits = [];
  server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(302, { location });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const redirectError = async (to: string): Promise<string> => {
  location = to;
  hits = [];
  const err = await axios
    .get(`http://127.0.0.1:${port}/start`, { beforeRedirect: checkRedirect, maxRedirects: 5, timeout: 3000 })
    .then(() => 'no error', (e: Error) => e.message);
  return err;
};

describe('checkRedirect, called by axios before following a redirect', () => {
  it('refuses a downgrade to http (the 1.x download followed it)', async () => {
    expect(await redirectError('http://169.254.169.254/latest/meta-data/')).toMatch(/non-HTTPS/);
    expect(hits).toEqual(['/start']);
  });

  it('refuses an https redirect to an IP-literal internal host (DNS lookup never runs for these)', async () => {
    expect(await redirectError('https://[::ffff:a9fe:a9fe]/latest/meta-data/')).toMatch(/internal\/private/);
    expect(await redirectError('https://10.1.2.3/x.png')).toMatch(/internal\/private/);
    expect(await redirectError('https://localhost/x.png')).toMatch(/internal\/private/);
  });
});

describe('guardedLookup, called by the socket at connect time', () => {
  it('axios refuses to connect to a blocked hostname through it', async () => {
    const err = await axios
      .get(`http://localhost:${port}/`, { lookup: guardedLookup, maxRedirects: 0, timeout: 3000 })
      .then(() => 'no error', (e: Error) => e.message);
    expect(err).toMatch(/not allowed/);
  });

  it('refuses a name whose answers include a private address', async () => {
    const lookup = createGuardedLookup((_host, _options, cb) =>
      cb(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ])
    );
    const result = await new Promise<{ err: Error | null; count: number }>((resolve) =>
      lookup('two-faced.example', {}, (err, addresses) => resolve({ err, count: addresses.length }))
    );
    expect(result.err?.message).toMatch(/resolves to internal\/private/);
    expect(result.count).toBe(0);
  });
});

describe('isBlockedAddress', () => {
  it.each(['127.0.0.1', '::1', '::ffff:7f00:1', '::ffff:169.254.169.254', 'fd12::1', 'fe80::1', '100.64.0.1', '255.255.255.255', '[::1]'])(
    'blocks %s',
    (a) => expect(isBlockedAddress(a)).toBe(true)
  );
  it.each(['8.8.8.8', '93.184.216.34', '2606:4700::1111', '::ffff:808:808', 'example.com'])('allows %s', (a) =>
    expect(isBlockedAddress(a)).toBe(false)
  );
});
