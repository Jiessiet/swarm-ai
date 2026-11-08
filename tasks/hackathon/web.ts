import { fetch, EnvHttpProxyAgent } from 'undici';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Source } from './types.js';
const dispatcher = new EnvHttpProxyAgent();
export type WebResearch = { search(query: string, signal?: AbortSignal): Promise<Omit<Source, 'id'>[]>; read(url: string, signal?: AbortSignal): Promise<Omit<Source, 'id'>> };
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Accept only global-unicast IPv6; excludes loopback, private, link-local and mapped IPv4.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}
export async function validatePublicUrl(raw: string, signal?: AbortSignal) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Read only public HTTPS URLs on port 443');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Local URLs are unavailable');
  let addresses: { address: string }[];
  try { addresses = await lookup(host, { all: true }); } catch (error) {
    // Cloud proxies can resolve destinations unavailable to local DNS. Keep the
    // public-address check using a fixed HTTPS resolver rather than bypassing it.
    if ((error as NodeJS.ErrnoException).code !== 'ENOTFOUND') throw error;
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, { dispatcher, signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]), redirect: 'error' });
    if (!response.ok) throw new Error('Public DNS lookup failed');
    const answer = await response.json() as { Answer?: { type: number; data: string }[] };
    addresses = (answer.Answer ?? []).filter(a => a.type === 1).map(a => ({ address: a.data }));
  }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private network addresses are unavailable');
  return url;
}
export function plainText(html: string) {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, e => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[e] ?? e).replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '').replace(/\s+/g, ' ').trim();
}
async function boundedFetch(raw: string, signal?: AbortSignal, headers: Record<string, string> = {}) {
  const timeout = AbortSignal.timeout(20_000);
  const combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
  let url = raw;
  for (let redirect = 0; redirect <= 4; redirect++) {
    await validatePublicUrl(url, combined);
    const response = await fetch(url, { dispatcher, signal: combined, redirect: 'manual', headers: { 'User-Agent': 'swarm-ai-research/1.0', ...headers } });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location'); if (!location) throw new Error('Redirect missing location');
      const next = new URL(location, url).href;
      if (new URL(next).origin !== new URL(url).origin) headers = {};
      url = next; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Web request returned HTTP ${response.status}`); }
    const type = response.headers.get('content-type') ?? '';
    if (!/text\/|json|xml/.test(type)) { await response.body?.cancel(); throw new Error('Only HTML, plain text, JSON and XML are supported; use an abstract page instead of a PDF'); }
    const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1_000_000) throw new Error('Page exceeds the 1 MB read limit'); chunks.push(value); }
    } finally { await reader.cancel(); }
    return { url, text: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Too many redirects');
}
export function createWebResearch(env: NodeJS.ProcessEnv = process.env): WebResearch {
  return {
    async search(query, signal) {
      if (!query.trim() || query.length > 300) throw new Error('Search query must be 1..300 characters');
      const retrievedAt = new Date().toISOString();
      if (env.BRAVE_SEARCH_API_KEY) {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
        const response = await boundedFetch(url, signal, { 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY });
        const data = JSON.parse(response.text);
        return (data.web?.results ?? []).slice(0, 5).map((r: any) => ({ title: String(r.title), url: String(r.url), text: String(r.description ?? ''), kind: 'search-result', retrievedAt }));
      }
      const response = await boundedFetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5`, signal);
      const data = JSON.parse(response.text);
      return data.message.items.map((r: any) => ({ title: String(r.title?.[0] ?? 'Untitled work'), url: String(r.URL), text: plainText(String(r.abstract ?? `Publisher: ${r.publisher ?? 'unknown'}. DOI: ${r.DOI}. Metadata only; read the publisher/abstract page to verify claims.`)).slice(0, 1500), kind: 'search-result', retrievedAt }));
    },
    async read(url, signal) {
      const response = await boundedFetch(url, signal);
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(response.text)?.[1] ?? response.url;
      return { title: plainText(title).slice(0, 500), url: response.url, text: plainText(response.text).slice(0, 12000), kind: 'page', retrievedAt: new Date().toISOString() };
    },
  };
}
