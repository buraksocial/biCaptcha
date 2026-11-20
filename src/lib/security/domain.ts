import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { parse } from 'tldts';

export function canonicalDomain(input: unknown): string {
  if (typeof input !== 'string' || input.length > 254 || /[\s/:@?#\\%]/u.test(input)) throw Error('Invalid domain');
  const host = domainToASCII(input.replace(/\.$/, '')).toLowerCase();
  if (!host || host.length > 253 || isIP(host) || !host.split('.').every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) throw Error('Invalid domain');
  const result = parse(host, { allowPrivateDomains: true });
  if (!result.domain || (!result.isIcann && !result.isPrivate) || result.isIp) throw Error('Invalid domain');
  return host;
}
export function domainMatches(host: string, domain: string) {
  const h = canonicalDomain(host), d = canonicalDomain(domain);
  return h === d || h.endsWith(`.${d}`);
}
export function sourceOrigin(raw: string | null) {
  if (!raw || raw.length > 512) throw Error('Invalid origin');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || raw.endsWith('/')) throw Error('Invalid origin');
  const host = canonicalDomain(url.hostname);
  return { host, origin: url.origin };
}
export function txtMatches(records: string[][], siteKey: string) {
  return records.some(parts => parts.join('') === `bicaptcha-verification=${siteKey}`);
}
