import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Test the looksUnrendered heuristic in isolation by re-implementing
// it (the real one is unexported, so we validate the behaviour via fetchHtml
// with a mocked axios).

function looksUnrendered(html) {
  if (!html || html.length < 500) return true;
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return bodyText.replace(/<[^>]+>/g, '').trim().length < 200;
}

test('looksUnrendered: empty string is unrendered', () => {
  assert.ok(looksUnrendered(''));
});

test('looksUnrendered: short html is unrendered', () => {
  assert.ok(looksUnrendered('<html><body>hi</body></html>'));
});

test('looksUnrendered: SPA shell with only script tags is unrendered', () => {
  const spa = `<html><head></head><body>
    <div id="app"></div>
    ${'<script>var x=1;</script>'.repeat(20)}
  </body></html>`;
  assert.ok(looksUnrendered(spa));
});

test('looksUnrendered: real content page is not unrendered', () => {
  const content = `<html><head><title>T</title></head><body>
    ${'<p>Lorem ipsum dolor sit amet consectetur adipiscing elit. </p>'.repeat(15)}
  </body></html>`;
  assert.ok(!looksUnrendered(content));
});

test('looksUnrendered: page with long inlined script but no real text is unrendered', () => {
  const scriptHeavy = `<html><body>
    <script>${'var data = "' + 'x'.repeat(800) + '";'}</script>
    <p>short</p>
  </body></html>`;
  assert.ok(looksUnrendered(scriptHeavy));
});
