import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as core from '../assets/intelstream-core.js';

const html = await readFile(new URL('../intelstream.html', import.meta.url), 'utf8');
const script = (await readFile(new URL('../assets/intelstream.js', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
const fixtures = {
  results: [
    { title: 'Solar energy', url: 'https://example.org/solar', source: 'Wikipedia', kind: 'knowledge', description: 'Reference summary', image: 'https://example.org/solar.jpg', rank: 1 },
    { title: 'New solar project', url: 'https://example.org/news', source: 'Publisher', kind: 'news', description: 'News summary', publishedAt: '2026-10-29', rank: 2 },
  ],
  sources: [{ name: 'Wikipedia', available: true, count: 1 }, { name: 'Google News', available: true, count: 1 }, { name: 'Hacker News', available: false, count: 0 }],
};
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function setup(t, fetchImpl = async () => Response.json(fixtures), stored = '') {
  const dom = new JSDOM(html, { url: 'https://example.org/intelstream.html', runScripts: 'outside-only' });
  const { window } = dom;
  Object.assign(window, core, { fetch: fetchImpl, AbortController, AbortSignal, Intl });
  window.localStorage.setItem('intelstream.saved.v1', stored);
  const downloads = [];
  window.URL.createObjectURL = () => 'blob:test-export';
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  window.eval(script);
  t.after(() => window.close());
  const $ = id => window.document.getElementById(id);
  const submit = (q = 'solar', location = '') => {
    $('query').value = q; $('location').value = location;
    $('search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  return { window, $, submit, downloads, dom };
}

test('search, source filtering, image filtering, sorting and export work through actual DOM controls', async t => {
  const { window, $, submit, downloads } = setup(t);
  submit(); assert.equal($('loader').hidden, false);
  await flush();
  assert.equal($('results').children.length, 2);
  assert.equal($('loader').hidden, true);
  assert.match($('status').textContent, /temporarily unavailable/);
  window.document.querySelector('[data-filter="news"]').click();
  assert.equal($('results').children.length, 1);
  assert.match($('results').textContent, /New solar project/);
  $('images-only').checked = true; $('images-only').dispatchEvent(new window.Event('change'));
  assert.equal($('results').children.length, 0); assert.equal($('empty-state').hidden, false);
  $('images-only').checked = false; $('images-only').dispatchEvent(new window.Event('change'));
  window.document.querySelector('[data-filter="all"]').click();
  $('sort').value = 'newest'; $('sort').dispatchEvent(new window.Event('change'));
  assert.match($('results').firstElementChild.textContent, /New solar project/);
  $('export-button').click();
  assert.equal(downloads.length, 1); assert.match(downloads[0], /^intelstream-research-.*\.md$/);
});

test('saved items persist across reloads and can be removed in the saved view', async t => {
  const first = setup(t); first.submit(); await flush();
  first.window.document.querySelector('.save-button').click();
  assert.equal(first.$('saved-count').textContent, '1');
  const second = setup(t, undefined, first.window.localStorage.getItem('intelstream.saved.v1'));
  second.$('saved-nav').click();
  assert.equal(second.$('workspace-title').textContent, 'Saved sources');
  assert.equal(second.$('results').children.length, 1);
  second.window.document.querySelector('.save-button').click();
  assert.equal(second.$('saved-count').textContent, '0');
  assert.equal(second.$('results').children.length, 0);
});

test('external result text is rendered as text and unsafe links never enter the DOM', async t => {
  const payload = { ...fixtures, results: [
    { title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', url: 'https://example.org/safe' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
  ] };
  const { $, submit } = setup(t, async () => Response.json(payload));
  submit(); await flush();
  assert.equal($('results').children.length, 1);
  assert.equal($('results').querySelectorAll('img, script').length, 0);
  assert.match($('results').textContent, /<img src=x onerror=alert\(1\)>/);
});

test('cancel ignores late responses and restores the controls', async t => {
  let resolve;
  const { $, submit } = setup(t, () => new Promise(r => { resolve = r; }));
  submit(); $('cancel-button').click();
  assert.equal($('loader').hidden, true);
  assert.equal($('search-button').disabled, false);
  resolve(Response.json(fixtures)); await flush();
  assert.equal($('results').children.length, 0);
  assert.equal($('status').textContent, 'Search cancelled.');
});

test('newer requests win when an old response arrives after a new search', async t => {
  const pending = [];
  const { $, submit } = setup(t, () => new Promise(resolve => pending.push(resolve)));
  submit('solar'); submit('batteries');
  pending[1](Response.json({ ...fixtures, results: [{ title: 'Battery research', url: 'https://example.org/battery' }] })); await flush();
  pending[0](Response.json(fixtures)); await flush();
  assert.match($('workspace-title').textContent, /batteries/);
  assert.match($('results').textContent, /Battery research/);
  assert.doesNotMatch($('results').textContent, /Solar energy/);
});

test('error response exposes retry and retry recovers to real results', async t => {
  let calls = 0;
  const { $, submit } = setup(t, async () => ++calls === 1 ? Response.json({ error: 'Providers unavailable' }, { status: 502 }) : Response.json(fixtures));
  submit(); await flush();
  assert.equal($('error').hidden, false); assert.match($('error-message').textContent, /Providers unavailable/);
  $('retry-button').click(); await flush();
  assert.equal($('error').hidden, true); assert.equal($('results').children.length, 2);
});

test('blank search and invalid contact forms make no requests; contact failures preserve input', async t => {
  let calls = 0;
  const { $, window, submit } = setup(t, async () => { calls++; return new Response('{}', { status: 500 }); });
  submit(''); await flush(); assert.equal(calls, 0);
  const contactSubmit = () => $('contact-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  contactSubmit(); await flush(); assert.equal(calls, 0);
  $('contact-name').value = 'Test'; $('contact-email').value = 'invalid'; $('contact-message').value = 'An unsent test message';
  contactSubmit(); await flush(); assert.equal(calls, 0);
  $('contact-email').value = 'test@example.com'; contactSubmit(); await flush();
  assert.equal(calls, 1);
  assert.equal($('contact-message').value, 'An unsent test message');
  assert.match($('contact-status').textContent, /could not be sent/);
  assert.equal($('contact-submit').disabled, false);
});

test('corrupted storage does not prevent search initialization', t => {
  const { $ } = setup(t, undefined, 'not JSON');
  assert.equal($('saved-count').textContent, '0');
  assert.equal($('search-button').disabled, false);
});
