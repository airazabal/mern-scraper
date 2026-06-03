import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPageMeta, parseItems } from '../scraper/parser.js';

// ── extractPageMeta ───────────────────────────────────────────────────────────

test('extractPageMeta: extracts title from <title>', () => {
  const html = '<html><head><title>My Page</title></head><body>Hello</body></html>';
  const meta = extractPageMeta(html, 'https://example.com');
  assert.equal(meta.title, 'My Page');
});

test('extractPageMeta: falls back to <h1> when no <title>', () => {
  const html = '<html><body><h1>Heading One</h1><p>content here</p></body></html>';
  const meta = extractPageMeta(html, 'https://example.com');
  assert.equal(meta.title, 'Heading One');
});

test('extractPageMeta: extracts meta description', () => {
  const html = `<html><head>
    <meta name="description" content="Great page">
  </head><body>text</body></html>`;
  const meta = extractPageMeta(html, 'https://example.com');
  assert.equal(meta.description, 'Great page');
});

test('extractPageMeta: resolves relative links to absolute', () => {
  const html = `<html><body>
    <a href="/about">About</a>
    <a href="https://other.com/page">External</a>
  </body></html>`;
  const meta = extractPageMeta(html, 'https://example.com');
  assert.ok(meta.links.includes('https://example.com/about'), `links: ${meta.links}`);
  assert.ok(meta.links.includes('https://other.com/page'));
});

test('extractPageMeta: deduplicates links', () => {
  const html = `<html><body>
    <a href="/a">1</a><a href="/a">2</a>
  </body></html>`;
  const meta = extractPageMeta(html, 'https://example.com');
  const aLinks = meta.links.filter((l) => l === 'https://example.com/a');
  assert.equal(aLinks.length, 1);
});

test('extractPageMeta: skips malformed hrefs silently', () => {
  const html = `<html><body>
    <a href="javascript:void(0)">JS</a>
    <a href="mailto:x@y.com">Mail</a>
    <a href="/valid">Valid</a>
  </body></html>`;
  const meta = extractPageMeta(html, 'https://example.com');
  assert.ok(meta.links.every((l) => l.startsWith('http')));
});

test('extractPageMeta: strips scripts from bodyText', () => {
  const html = `<html><body>
    <script>var x = 1;</script>
    <p>Real content here</p>
  </body></html>`;
  const meta = extractPageMeta(html, 'https://example.com');
  assert.ok(!meta.bodyText.includes('var x'), meta.bodyText);
  assert.ok(meta.bodyText.includes('Real content'));
});

// ── parseItems ────────────────────────────────────────────────────────────────

test('parseItems: throws when no rows match selector', () => {
  const html = '<html><body><p>Nothing here</p></body></html>';
  assert.throws(() => parseItems(html), /0 valid rows/);
});

test('parseItems: parses valid .table-row structure', () => {
  const html = `<html><body>
    <div class="table-row">
      <span class="rank">1</span>
      <span class="name">Alpha</span>
      <img src="https://example.com/a.png" />
    </div>
    <div class="table-row">
      <span class="rank">2</span>
      <span class="name">Beta</span>
      <img src="" />
    </div>
  </body></html>`;
  const { items, rejected } = parseItems(html);
  assert.equal(items.length, 2);
  assert.equal(rejected, 0);
  assert.equal(items[0].ranking, 1);
  assert.equal(items[0].name, 'Alpha');
  assert.equal(items[1].name, 'Beta');
});

test('parseItems: rejects invalid rows and counts them', () => {
  const html = `<html><body>
    <div class="table-row">
      <span class="rank">1</span>
      <span class="name">Valid</span>
    </div>
    <div class="table-row">
      <span class="rank">-99</span>
      <span class="name"></span>
    </div>
  </body></html>`;
  const { items, rejected } = parseItems(html);
  assert.equal(items.length, 1);
  assert.equal(rejected, 1);
});
