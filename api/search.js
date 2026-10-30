import { searchAll } from '../lib/search.js';

const LIMIT = 20;
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
} });

export function createHandler(search = searchAll) {
  const cache = new Map();
  const pending = new Map();
  const requests = new Map();
  return async function handle(request) {
    if (request.method !== 'GET') return json({ error: 'Use GET to search.' }, 405, { Allow: 'GET' });
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
    const location = (url.searchParams.get('location') || '').trim().replace(/\s+/g, ' ');
    if (q.length < 2 || q.length > 160 || location.length > 80 || /[\x00-\x1f\x7f]/.test(q + location)) {
      return json({ error: 'Enter a topic of 2–160 characters and a location of up to 80 characters.' }, 400);
    }
    const key = JSON.stringify([q.toLowerCase(), location.toLowerCase()]);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires > now) return json(cached.data);
    // Best-effort per-instance limit, not a replacement for platform-wide firewall limits.
    const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown';
    for (const [id, entry] of requests) if (entry.expires <= now) requests.delete(id);
    const bucket = requests.get(ip) || { count: 0, expires: now + 60000 };
    if (bucket.count >= LIMIT) return json({ error: 'Too many searches. Please try again in a minute.' }, 429, { 'Retry-After': '60' });
    bucket.count++; requests.set(ip, bucket);
    if (requests.size > 2000) requests.delete(requests.keys().next().value);
    try {
      if (!pending.has(key)) pending.set(key, search(q, location));
      const data = await pending.get(key);
      if (!data.sources.some(source => source.available)) return json({ error: 'Search providers are temporarily unavailable. Please try again.', sources: data.sources }, 502);
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now + (data.sources.every(source => source.available) ? 300000 : 30000) });
      return json(data);
    } catch { return json({ error: 'Search could not be completed. Please try again.' }, 502); }
    finally { pending.delete(key); }
  };
}

export default { fetch: createHandler() };
