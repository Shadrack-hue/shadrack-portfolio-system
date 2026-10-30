import { XMLParser } from 'fast-xml-parser';
import { cleanResult } from '../assets/intelstream-core.js';

const USER_AGENT = 'IntelStream/1.0 (https://shadrack-portfolio-system.vercel.app/intelstream.html)';
const PROVIDERS = ['Wikipedia', 'Google News', 'Hacker News'];
const text = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const scalar = value => typeof value === 'object' && value !== null ? value['#text'] : value;

async function request(url, fetchImpl, format = 'json') {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: format === 'xml' ? 'application/rss+xml, application/xml' : 'application/json' },
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  // Bound upstream bodies as well as the number of returned records.
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('Provider response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = Buffer.concat(chunks).toString('utf8');
  return format === 'xml' ? body : JSON.parse(body);
}

export async function searchWikipedia(query, fetchImpl) {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: query, gsrlimit: '10', prop: 'extracts|pageimages|info|coordinates',
    exintro: '1', explaintext: '1', exsentences: '2', exlimit: '10',
    piprop: 'thumbnail', pithumbsize: '480', pilimit: '10', inprop: 'url' });
  const data = await request(`https://en.wikipedia.org/w/api.php?${params}`, fetchImpl);
  if (data.error || (!data.batchcomplete && !data.query)) throw new Error('Invalid Wikipedia response');
  return (data.query?.pages || []).map(page => ({ title: page.title, url: page.fullurl,
    description: text(page.extract), image: page.thumbnail?.source, kind: 'knowledge', source: 'Wikipedia',
    rank: page.index || 1, coordinates: page.coordinates?.[0] ? { lat: page.coordinates[0].lat, lon: page.coordinates[0].lon } : null }));
}

export async function searchNews(query, fetchImpl) {
  const params = new URLSearchParams({ q: query, hl: 'en-KE', gl: 'KE', ceid: 'KE:en' });
  const xml = await request(`https://news.google.com/rss/search?${params}`, fetchImpl, 'xml');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported news document');
  const data = new XMLParser({ ignoreAttributes: true, processEntities: true }).parse(xml);
  if (!data.rss?.channel) throw new Error('Invalid news response');
  const raw = data.rss.channel.item || [];
  return (Array.isArray(raw) ? raw : [raw]).slice(0, 15).map((item, index) => ({
    title: text(scalar(item.title)), url: scalar(item.link), description: 'News coverage indexed by Google News. Open the article to read the publisher’s full report.',
    kind: 'news', source: text(scalar(item.source)) || 'Google News', publishedAt: scalar(item.pubDate), rank: index + 1,
  }));
}

export async function searchDiscussions(query, fetchImpl) {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: '15' });
  const data = await request(`https://hn.algolia.com/api/v1/search?${params}`, fetchImpl);
  if (!Array.isArray(data.hits)) throw new Error('Invalid discussion response');
  return data.hits.map((hit, index) => ({ title: hit.title, url: hit.url || `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
    description: text(hit.story_text) || 'A story shared by the Hacker News community. Open the source or explore the discussion.',
    discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
    kind: 'discussions', source: 'Hacker News', publishedAt: hit.created_at, points: hit.points, comments: hit.num_comments, rank: index + 1,
  }));
}

export async function searchAll(query, location = '', fetchImpl = fetch) {
  const combined = [query, location].filter(Boolean).join(' ');
  const responses = await Promise.allSettled([
    searchWikipedia(combined, fetchImpl), searchNews(combined, fetchImpl), searchDiscussions(combined, fetchImpl),
  ]);
  const sources = responses.map((response, i) => ({ name: PROVIDERS[i], available: response.status === 'fulfilled',
    count: response.status === 'fulfilled' ? response.value.map(cleanResult).filter(Boolean).length : 0 }));
  const results = [...new Map(responses.flatMap(response => response.status === 'fulfilled' ? response.value : [])
    .map(cleanResult).filter(Boolean).map(item => [item.id, item])).values()];
  return { query, location, results, sources, fetchedAt: new Date().toISOString() };
}
