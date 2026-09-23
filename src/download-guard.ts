/**
 * Where an image download may connect (SSRF defence). Internal: not a package
 * export.
 *
 * 1.x checked a URL once, before the download, with string prefixes, which
 * let through (ship review, 2026-09-22):
 * - IPv4-mapped IPv6 in hex form: `[::ffff:a9fe:a9fe]` is 169.254.169.254, the
 *   cloud metadata service. `new URL()` normalises the dotted form to hex, so
 *   only the dotted form was ever caught by the pre-parse regex.
 * - Most of fc00::/7: `/^fc00:/` and `/^fd00:/` are two addresses' prefixes,
 *   not the range.
 * - Every DNS answer after the first, and a second resolution by the
 *   download itself (DNS rebinding).
 * - Redirects: axios followed them unchecked, including https → http.
 *
 * Now the ranges are CIDR blocks in a `BlockList` (which matches IPv4-mapped
 * IPv6 against the IPv4 rules), `guardedLookup` checks every address at
 * connect time for every connection the download makes, and `checkRedirect`
 * checks each redirect before it is followed (IP-literal hosts skip DNS, so
 * they are checked there).
 */

import { lookup as dnsLookup } from 'dns';
import { BlockList, isIP } from 'net';

/** Loopback, private, link-local (incl. 169.254.169.254), CGNAT, and other special-purpose ranges. */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64: reaches IPv4 space through a gateway
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** Hostnames refused before any DNS lookup. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

/** Brackets removed, lowercased: `[::1]` → `::1`. */
export function bareHost(host: string): string {
  return host.replace(/^\[|\]$/g, '').toLowerCase();
}

/** True for an IP address in a blocked range; false for a public address or a hostname. */
export function isBlockedAddress(address: string): boolean {
  const bare = bareHost(address);
  const family = isIP(bare);
  if (family === 0) return false;
  return BLOCKED.check(bare, family === 6 ? 'ipv6' : 'ipv4');
}

/** True for a hostname refused by name (`localhost`, the metadata hosts). */
export function isBlockedHostname(host: string): boolean {
  return BLOCKED_HOSTNAMES.has(bareHost(host));
}

/** An address as axios's `lookup` contract takes it. */
interface LookupEntry {
  address: string;
  family: 4 | 6;
}

type LookupCallback = (err: Error | null, addresses: LookupEntry[]) => void;

/**
 * `lookup` for the download's sockets: resolves every address and refuses the
 * connection if any is blocked. Node calls it for each connection, redirects
 * included, so the address checked is the address connected to. Always
 * answers with the full list; axios picks the first when the socket did not
 * ask for all of them.
 */
export const guardedLookup = createGuardedLookup(dnsLookup);

/** The resolver `guardedLookup` wraps: `dns.lookup` with `all: true`. */
export type Resolver = (
  hostname: string,
  options: { family: number; all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void
) => void;

/** `guardedLookup` over a given resolver (tests pass a stub; production passes `dns.lookup`). */
export function createGuardedLookup(resolve: Resolver) {
  return function guardedLookup(hostname: string, options: { family?: number }, callback: LookupCallback): void {
    if (isBlockedHostname(hostname)) {
      callback(new Error(`Access to ${hostname} is not allowed`), []);
      return;
    }
    resolve(hostname, { family: options.family ?? 0, all: true }, (err, addresses) => {
      if (err) {
        callback(err, []);
        return;
      }
      if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
        callback(new Error(`Domain ${hostname} resolves to internal/private IP address`), []);
        return;
      }
      callback(
        null,
        addresses.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }))
      );
    });
  };
}

/** `beforeRedirect` for the download: HTTPS only, and never to a blocked host. */
export function checkRedirect(options: { protocol?: string; hostname?: string }): void {
  if (options.protocol !== 'https:') {
    throw new Error('Image download was redirected to a non-HTTPS URL');
  }
  const host = options.hostname ?? '';
  if (isBlockedHostname(host) || isBlockedAddress(host)) {
    throw new Error('Image download was redirected to an internal/private address');
  }
}
