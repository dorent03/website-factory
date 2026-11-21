import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 2_500_000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) WebsiteFactory/0.1 (+local research; respects robots)';

function privateAddress(ip: string): boolean {
  if (ip.includes(':')) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:127.') || ip === '::';
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Only public http(s) hosts — research URLs come from untrusted sources and must not reach the local network. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`blocked protocol ${u.protocol}`);
  if (u.username || u.password) throw new Error('credentials in URL not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) throw new Error('local host blocked');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => privateAddress(a.address))) throw new Error(`private address blocked for ${host}`);
  return u;
}

export interface FetchedPage { url: string; status: number; html: string; contentType: string; fetchedAt: string }

export async function safeFetch(raw: string, timeoutMs = 15_000): Promise<FetchedPage> {
  let url = (await assertPublicUrl(raw)).toString();
  for (let hop = 0; hop < 6; hop++) {
    const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(timeoutMs) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = (await assertPublicUrl(new URL(r.headers.get('location')!, url).toString())).toString();
      continue;
    }
    const reader = r.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    return { url, status: r.status, html, contentType: r.headers.get('content-type') ?? '', fetchedAt: new Date().toISOString() };
  }
  throw new Error('too many redirects');
}

/** Visible text of an HTML document (scripts/styles removed, block elements become line breaks). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|address|footer|header|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function extractLinks(html: string, base: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { out.push({ href: new URL(m[1]!, base).toString(), text: htmlToText(m[2]!).slice(0, 120) }); } catch { /* bad url */ }
  }
  return out;
}
