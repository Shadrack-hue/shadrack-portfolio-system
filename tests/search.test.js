import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAll, searchNews, searchWikipedia } from '../lib/search.js';
import { createHandler } from '../api/search.js';
import { cleanResult, safeUrl, readSaved, selectResults, exportMarkdown } from '../assets/intelstream-core.js';

const wiki = { batchcomplete: true, query: { pages: [{ title: 'Solar energy', fullurl: 'https://en.wikipedia.org/wiki/Solar_energy', extract: 'Solar energy background.', index: 1, thumbnail: { source: 'https://upload.wikimedia.org/solar.jpg' }, coordinates: [{ lat: -1.28, lon: 36.81 }] }] } };
const news = '<rss><channel><item><title>Solar &amp; storage</title><link>https://news.google.com/rss/articles/123</link><source>Energy News</source><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
const hn = { hits: [{ objectID: '123', title: 'Solar technology', url: 'https://example.com/solar', created_at: '2026-10-28T10:00:00Z', points: 12, num_comments: 4 }] };
function fixtures(url) {
  const host = new URL(url).hostname;
  return Promise.resolve(host === 'en.wikipedia.org' ? Response.json(wiki) : host === 'news.google.com' ? new Response(news) : Response.json(hn));
}

test('search aggregates real provider response formats and safely encodes the location', async () => {
  const urls = [];
  const data = await searchAll('solar & storage', 'Kenya', url => { urls.push(new URL(url)); return fixtures(url); });
  assert.equal(data.results.length, 3);
  assert.equal(data.sources.filter(s => s.available).length, 3);
  assert.equal(data.results[1].title, 'Solar & storage');
  assert.equal(data.results[2].points, 12);
  assert.deepEqual(data.results[0].coordinates, { lat: -1.28, lon: 36.81 });
  assert.equal(urls[0].searchParams.get('gsrsearch'), 'solar & storage Kenya');
  assert.equal(urls[1].searchParams.get('q'), 'solar & storage Kenya');
  assert.equal(urls[2].searchParams.get('query'), 'solar & storage Kenya');
});

test('one failed provider leaves successful results available and reports the failure', async () => {
  const data = await searchAll('solar', '', url => new URL(url).hostname === 'news.google.com' ? Promise.reject(new Error('timeout')) : fixtures(url));
  assert.equal(data.results.length, 2);
  assert.deepEqual(data.sources[1], { name: 'Google News', available: false, count: 0 });
});

test('malformed successful responses are failures, not empty results', async () => {
  const data = await searchAll('solar', '', () => Promise.resolve(new Response('<html>upstream error</html>')));
  assert.equal(data.sources.some(s => s.available), false);
});

test('empty provider responses are valid and retain availability', async () => {
  assert.deepEqual(await searchWikipedia('nothing', () => Promise.resolve(Response.json({ batchcomplete: true }))), []);
  assert.deepEqual(await searchNews('nothing', () => Promise.resolve(new Response('<rss><channel><title>News</title></channel></rss>'))), []);
});

test('XML entities cannot reference external files or create expansion payloads', async () => {
  await assert.rejects(searchNews('solar', () => Promise.resolve(new Response('<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel>&xxe;</channel></rss>'))));
});

test('unsafe URLs and bad saved data cannot become links or break the workspace', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,test'), '');
  assert.equal(safeUrl('https://name:password@example.com'), '');
  assert.deepEqual(readSaved('{broken'), []);
  assert.deepEqual(readSaved('{}'), []);
  assert.deepEqual(readSaved('[{"url":"javascript:alert(1)","title":"unsafe"}]'), []);
  const result = cleanResult({ title: '<img src=x onerror=alert(1)>', url: 'https://example.com', coordinates: { lat: 200, lon: 0 } });
  assert.equal(result.title, '<img src=x onerror=alert(1)>'); // Rendered exclusively with textContent.
  assert.equal(result.coordinates, null);
});

test('filters, dates, image-only mode and exports operate on the selected results', async () => {
  const { results } = await searchAll('solar', '', fixtures);
  assert.equal(selectResults(results, 'news').length, 1);
  assert.equal(selectResults(results, 'all', 'newest')[0].kind, 'news');
  assert.equal(selectResults(results, 'all', 'relevance', true)[0].kind, 'knowledge');
  assert.equal(results[0].kind, 'knowledge');
  const exported = exportMarkdown(selectResults(results, 'news'), 'Solar research');
  assert.match(exported, /Solar research/);
  assert.match(exported, /https:\/\/news.google.com/);
  assert.doesNotMatch(exported, /wikipedia.org/);
});

test('API validates methods, input and length without calling providers', async () => {
  let called = 0;
  const handler = createHandler(() => { called++; });
  assert.equal((await handler(new Request('https://example.com/api/search?q=solar', { method: 'POST' }))).status, 405);
  for (const q of ['', 'a', 'a'.repeat(161), 'ab\0cd']) {
    assert.equal((await handler(new Request(`https://example.com/api/search?q=${encodeURIComponent(q)}`))).status, 400);
  }
  assert.equal(called, 0);
});

test('API exposes outage as 502 and never caches it as a successful empty search', async () => {
  const handler = createHandler(async () => ({ results: [], sources: [{ name: 'Wikipedia', available: false }] }));
  const response = await handler(new Request('https://example.com/api/search?q=solar'));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /temporarily unavailable/);
});

test('API caches and coalesces identical requests and returns no-store responses', async () => {
  let called = 0;
  const handler = createHandler(async () => { called++; return { results: [], sources: [{ name: 'Wikipedia', available: true }] }; });
  const make = () => handler(new Request('https://example.com/api/search?q=solar'));
  const [first, second] = await Promise.all([make(), make()]);
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  await make(); assert.equal(called, 1);
  assert.equal(first.headers.get('cache-control'), 'no-store');
});

test('uncached searches are bounded by the per-instance limit', async () => {
  const handler = createHandler(async () => ({ results: [], sources: [{ name: 'Wikipedia', available: true }] }));
  for (let i = 0; i < 20; i++) assert.equal((await handler(new Request(`https://example.com/api/search?q=topic${i}`))).status, 200);
  const response = await handler(new Request('https://example.com/api/search?q=one-more'));
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
});
