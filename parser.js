import * as cheerio from 'cheerio';
import { ItemSchema } from './schema.js';

// Parse HTML into validated items. Bad rows are collected, not fatal.
export function parseItems(html) {
  const $ = cheerio.load(html);
  const valid = [];
  const errors = [];

  $('.table-row').each((i, el) => {
    const raw = {
      ranking: Number($(el).find('.rank').text().trim()),
      name: $(el).find('.name').text().trim(),
      imagePath: $(el).find('img').attr('src') || '',
    };

    const parsed = ItemSchema.safeParse(raw);
    if (parsed.success) valid.push(parsed.data);
    else errors.push({ index: i, raw, issues: parsed.error.issues });
  });

  if (valid.length === 0) {
    // Selector likely broke (site layout changed) — fail loudly
    throw new Error(
      `Parser found 0 valid rows (${errors.length} rejected). Selectors may be stale.`
    );
  }

  return { items: valid, rejected: errors.length };
}
