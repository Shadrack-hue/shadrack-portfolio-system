import { cleanResult, readSaved, selectResults, exportMarkdown } from './intelstream-core.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'intelstream.saved.v1';
let saved = [];
try { saved = readSaved(localStorage.getItem(STORAGE_KEY)); } catch { /* Bookmarks remain available in memory. */ }
const state = { results: [], sources: [], filter: 'all', sort: 'relevance', images: false, view: 'search', query: '', location: '', limit: 12, searched: false };
let controller;
let requestId = 0;
let toastTimer;

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
function link(label, url) {
  const element = node('a', '', label);
  element.href = url;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); return true; }
  catch { toast('Browser storage is unavailable. Export your saved sources to keep them.'); return false; }
}
function updateSavedCount() { $('saved-count').textContent = saved.length; }
function setLoading(loading) {
  $('loader').hidden = !loading;
  $('search-button').disabled = loading;
  $('cancel-button').hidden = !loading;
  $('results').setAttribute('aria-busy', String(loading));
  if (loading) {
    $('results').replaceChildren();
    $('source-status').replaceChildren();
    $('empty-state').hidden = true;
    $('more-button').hidden = true;
    $('export-button').disabled = true;
  }
}
function cancelSearch() {
  requestId++;
  controller?.abort();
  controller = null;
  setLoading(false);
}
function card(item) {
  const article = node('article', 'result-card');
  if (item.image) {
    const img = node('img', 'card-image');
    img.src = item.image; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    article.append(img);
  }
  const body = node('div', 'card-body');
  const top = node('div', 'card-topline');
  top.append(node('span', 'source-label', item.source));
  const save = node('button', 'save-button');
  const isSaved = saved.some(entry => entry.id === item.id);
  save.type = 'button'; save.textContent = isSaved ? '✓ Saved' : '+ Save';
  save.setAttribute('aria-pressed', String(isSaved));
  save.setAttribute('aria-label', `${isSaved ? 'Remove saved' : 'Save'}: ${item.title}`);
  save.addEventListener('click', () => {
    const index = saved.findIndex(entry => entry.id === item.id);
    if (index >= 0) saved.splice(index, 1);
    else if (saved.length >= 100) { toast('You have 100 saved sources. Remove one before saving another.'); return; }
    else saved.push(item);
    const persisted = persist();
    updateSavedCount();
    if (persisted) toast(index >= 0 ? 'Source removed from saved.' : 'Source saved on this browser.');
    if (state.view === 'saved') render();
    else {
      save.textContent = index >= 0 ? '+ Save' : '✓ Saved';
      save.setAttribute('aria-pressed', String(index < 0));
      save.setAttribute('aria-label', `${index >= 0 ? 'Save' : 'Remove saved'}: ${item.title}`);
    }
  });
  top.append(save); body.append(top);
  const title = node('h3'); title.append(link(item.title, item.url)); body.append(title);
  if (item.description) body.append(node('p', '', item.description));
  const details = node('div', 'card-details');
  details.append(node('span', '', item.kind === 'discussions' ? 'Community discussion' : item.kind === 'news' ? 'News' : 'Reference'));
  if (item.publishedAt) {
    const date = node('time', '', new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(item.publishedAt)));
    date.dateTime = item.publishedAt; details.append(date);
  }
  if (item.points !== null) details.append(node('span', '', `${item.points} points · ${item.comments ?? 0} comments`));
  body.append(details);
  const actions = node('div', 'card-actions'); actions.append(link('Open source ↗', item.url));
  if (item.discussionUrl && item.discussionUrl !== item.url) actions.append(link('Discussion ↗', item.discussionUrl));
  if (item.coordinates) actions.append(link('Map ↗', `https://www.openstreetmap.org/?mlat=${item.coordinates.lat}&mlon=${item.coordinates.lon}#map=11/${item.coordinates.lat}/${item.coordinates.lon}`));
  body.append(actions); article.append(body); return article;
}
function currentResults() {
  return selectResults(state.view === 'saved' ? saved : state.results, state.filter, state.sort, state.images);
}
function render() {
  const pool = state.view === 'saved' ? saved : state.results;
  const visible = currentResults();
  $('view-label').textContent = state.view === 'saved' ? 'Your collection' : 'Research desk';
  $('workspace-title').textContent = state.view === 'saved' ? 'Saved sources' : state.searched ? `Results for “${state.query}”${state.location ? ` · ${state.location}` : ''}` : 'Discover your next connection';
  $('back-results').hidden = state.view !== 'saved';
  $('saved-note').hidden = state.view !== 'saved';
  document.querySelectorAll('[data-filter]').forEach(button => {
    const kind = button.dataset.filter;
    button.setAttribute('aria-pressed', String(kind === state.filter));
    button.querySelector('span').textContent = selectResults(pool, kind, state.sort, state.images).length;
  });
  $('results').replaceChildren(...visible.slice(0, state.limit).map(card));
  $('more-button').hidden = visible.length <= state.limit;
  $('more-button').textContent = `Show more (${Math.max(0, visible.length - state.limit)} remaining)`;
  $('export-button').disabled = !visible.length;
  $('empty-state').hidden = visible.length > 0;
  $('status').textContent = visible.length ? `${Math.min(state.limit, visible.length)} of ${visible.length} sources${state.view === 'saved' ? ' in your collection.' : '. Open a source to read the full story.'}` : 'No sources in this view.';
  if (!visible.length) {
    $('empty-title').textContent = state.view === 'saved' && !saved.length ? 'Keep your best finds here.' : !state.searched && state.view === 'search' ? 'A good question is a great start.' : 'No matching sources.';
    $('empty-copy').textContent = state.view === 'saved' && !saved.length ? 'Select Save on any result. Saved sources stay on this browser until you remove them or clear browser data.' : pool.length ? 'Try another source filter or turn off “With images”.' : state.searched ? 'Try a broader topic, check your spelling, or remove the location keyword.' : 'Search across Wikipedia, Google News, and Hacker News. Your results will appear here with links to the original sources.';
    if (!state.searched && state.view === 'search') $('status').textContent = 'Search a topic to bring your sources together.';
  }
  $('source-status').replaceChildren(...(state.view === 'search' ? state.sources : []).map(source => node('span', source.available ? '' : 'unavailable', `${source.available ? '✓' : '○'} ${source.name}${source.available ? ` · ${source.count}` : ' · temporarily unavailable'}`)));
}
function resetFilters() {
  state.filter = 'all'; state.sort = 'relevance'; state.images = false; state.limit = 12;
  $('sort').value = 'relevance'; $('images-only').checked = false;
}
async function search() {
  $('query').value = $('query').value.trim(); $('location').value = $('location').value.trim();
  if (!$('search-form').reportValidity()) return;
  cancelSearch();
  const id = ++requestId;
  const activeController = new AbortController(); controller = activeController;
  const query = $('query').value; const location = $('location').value;
  state.view = 'search'; resetFilters();
  $('back-results').hidden = true; $('saved-note').hidden = true;
  $('error').hidden = true; $('status').textContent = `Searching for “${query}”…`;
  setLoading(true);
  const timeout = setTimeout(() => activeController.abort('timeout'), 18000);
  try {
    const params = new URLSearchParams({ q: query }); if (location) params.set('location', location);
    const response = await fetch(`/api/search?${params}`, { signal: activeController.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search could not be completed. Please try again.');
    if (!Array.isArray(data.results) || !Array.isArray(data.sources)) throw new Error('Search returned an unexpected response. Please try again.');
    if (id !== requestId) return;
    state.results = data.results.map(cleanResult).filter(Boolean); state.sources = data.sources;
    state.query = query; state.location = location; state.searched = true;
    const url = new URL(window.location.href); url.search = params.toString();
    window.history.replaceState(null, '', url);
    render();
    const unavailable = data.sources.filter(source => !source.available);
    if (unavailable.length) $('status').textContent += ` ${unavailable.length} source${unavailable.length === 1 ? ' is' : 's are'} temporarily unavailable; available results are shown.`;
    $('workspace-title').focus({ preventScroll: true });
  } catch (error) {
    if (id !== requestId) return;
    state.results = []; state.sources = []; state.query = query; state.location = location; state.searched = true;
    render(); $('empty-state').hidden = true;
    $('error-message').textContent = activeController.signal.aborted ? 'The search took too long. Please try again.' : error.message;
    $('error').hidden = false; $('status').textContent = 'Search was not completed.';
  } finally {
    clearTimeout(timeout);
    if (id === requestId) { controller = null; setLoading(false); }
  }
}
$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
$('retry-button').addEventListener('click', search);
$('cancel-button').addEventListener('click', () => { cancelSearch(); render(); $('status').textContent = 'Search cancelled.'; });
$('saved-nav').addEventListener('click', () => {
  cancelSearch(); state.view = 'saved'; resetFilters(); $('error').hidden = true; render();
  $('workspace-title').focus();
});
$('back-results').addEventListener('click', () => { state.view = 'search'; resetFilters(); render(); });
for (const button of document.querySelectorAll('[data-query]')) button.addEventListener('click', () => {
  $('query').value = button.dataset.query; $('location').value = button.dataset.location || ''; search();
});
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  cancelSearch(); state.filter = button.dataset.filter; state.limit = 12; render();
});
$('sort').addEventListener('change', event => { cancelSearch(); state.sort = event.target.value; render(); });
$('images-only').addEventListener('change', event => { cancelSearch(); state.images = event.target.checked; state.limit = 12; render(); });
$('more-button').addEventListener('click', () => { state.limit += 12; render(); });
$('export-button').addEventListener('click', () => {
  const items = currentResults(); if (!items.length) return;
  const blob = new Blob([exportMarkdown(items, state.view === 'saved' ? 'IntelStream saved sources' : `IntelStream: ${state.query}`)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob); const anchor = node('a'); anchor.href = url;
  anchor.download = `intelstream-${state.view === 'saved' ? 'saved' : 'research'}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`Exported ${items.length} sources.`);
});
$('contact-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.reportValidity() || $('contact-submit').disabled) return;
  $('contact-submit').disabled = true; $('contact-status').textContent = 'Sending your message…';
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Your message could not be sent. Please try again or use the email link above.');
    form.reset(); $('contact-status').textContent = 'Your message was sent. Thank you for getting in touch.';
  } catch (error) { $('contact-status').textContent = error.name === 'TimeoutError' ? 'The message status could not be confirmed. Check your connection before trying again.' : error.message === 'Failed to fetch' ? 'Connection unavailable. Please try again or use the email link above.' : error.message; }
  finally { $('contact-submit').disabled = false; }
});
updateSavedCount(); render();
const initial = new URLSearchParams(window.location.search);
if (initial.has('q')) {
  $('query').value = (initial.get('q') || '').slice(0, 160); $('location').value = (initial.get('location') || '').slice(0, 80);
  if ($('query').value.trim().length >= 2) search();
}
