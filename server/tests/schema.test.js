import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItemSchema, ItemsSchema } from '../scraper/schema.js';

test('ItemSchema accepts valid item', () => {
  const result = ItemSchema.safeParse({ ranking: 1, name: 'Widget', imagePath: '' });
  assert.ok(result.success, JSON.stringify(result.error?.issues));
});

test('ItemSchema accepts valid URL imagePath', () => {
  const result = ItemSchema.safeParse({
    ranking: 0,
    name: 'Thing',
    imagePath: 'https://example.com/img.png',
  });
  assert.ok(result.success);
});

test('ItemSchema rejects negative ranking', () => {
  const result = ItemSchema.safeParse({ ranking: -1, name: 'X', imagePath: '' });
  assert.ok(!result.success);
  assert.ok(result.error.issues.some((i) => i.path.includes('ranking')));
});

test('ItemSchema rejects empty name', () => {
  const result = ItemSchema.safeParse({ ranking: 1, name: '', imagePath: '' });
  assert.ok(!result.success);
});

test('ItemSchema rejects non-URL imagePath that is not empty string', () => {
  const result = ItemSchema.safeParse({ ranking: 1, name: 'X', imagePath: 'not-a-url' });
  assert.ok(!result.success);
});

test('ItemsSchema accepts empty array', () => {
  const result = ItemsSchema.safeParse([]);
  assert.ok(result.success);
});

test('ItemsSchema accepts array of valid items', () => {
  const result = ItemsSchema.safeParse([
    { ranking: 1, name: 'A', imagePath: '' },
    { ranking: 2, name: 'B', imagePath: 'https://x.com/a.jpg' },
  ]);
  assert.ok(result.success);
  assert.equal(result.data.length, 2);
});

test('ItemsSchema rejects array containing invalid item', () => {
  const result = ItemsSchema.safeParse([
    { ranking: 1, name: 'A', imagePath: '' },
    { ranking: -5, name: '', imagePath: '' },
  ]);
  assert.ok(!result.success);
});
