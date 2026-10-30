export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function cleanResult(item) {
  if (!item || typeof item !== 'object' || !safeUrl(item.url) || typeof item.title !== 'string') return null;
  const coordinates = item.coordinates;
  return {
    id: safeUrl(item.url), url: safeUrl(item.url), title: item.title.slice(0, 300),
    description: String(item.description || '').slice(0, 900),
    source: String(item.source || 'Source').slice(0, 100),
    kind: ['knowledge', 'news', 'discussions'].includes(item.kind) ? item.kind : 'knowledge',
    image: safeUrl(item.image), discussionUrl: safeUrl(item.discussionUrl),
    publishedAt: item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) ? new Date(item.publishedAt).toISOString() : null,
    points: Number.isFinite(item.points) ? item.points : null,
    comments: Number.isFinite(item.comments) ? item.comments : null,
    rank: Number.isFinite(item.rank) ? item.rank : 100,
    coordinates: coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)
      && Math.abs(coordinates.lat) <= 90 && Math.abs(coordinates.lon) <= 180 ? coordinates : null,
  };
}

export function selectResults(items, kind = 'all', sort = 'relevance', imagesOnly = false) {
  return items.filter(item => (kind === 'all' || item.kind === kind) && (!imagesOnly || item.image))
    .slice().sort((a, b) => sort === 'newest'
      ? (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || a.rank - b.rank
      : a.rank - b.rank);
}

export function readSaved(raw) {
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? [...new Map(items.slice(0, 100).map(cleanResult).filter(Boolean).map(item => [item.id, item])).values()] : [];
  } catch { return []; }
}

export function exportMarkdown(items, title) {
  const plain = value => String(value).replace(/[\r\n]+/g, ' ').replace(/[\[\]<>]/g, '');
  return `# ${plain(title)}\n\nExported ${new Date().toISOString()}\n\n` + items.map((item, i) =>
    `## ${i + 1}. ${plain(item.title)}\n\nSource: ${plain(item.source)}${item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ''}\n\n${plain(item.description)}\n\n${item.url}\n`
  ).join('\n');
}
