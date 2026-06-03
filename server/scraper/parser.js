import * as cheerio from 'cheerio';
import { ItemSchema } from './schema.js';

// Parse HTML into validated items. Bad rows are collected, not fatal.
export function parseItems(html) {
  const $ = cheerio.load(html);
  const valid = [];
  const errors = [];

  // NOTE: adjust these selectors to match your target site's structure
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
    throw new Error(
      `Parser found 0 valid rows (${errors.length} rejected). Selectors may be stale.`
    );
  }

  return { items: valid, rejected: errors.length };
}

// Generic extraction for the goal agent: pulls links, title, body text.
export function extractPageMeta(html, baseUrl) {
  const $ = cheerio.load(html);

  const title =
    $('title').text().trim() || $('h1').first().text().trim() || '';

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  const rawText = $('body')
    .clone()
    .find('script,style,noscript')
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  const links = [];
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      const abs = new URL(href, baseUrl).href;
      if (abs.startsWith('http')) links.push(abs);
    } catch {
      // skip malformed hrefs
    }
  });

  return {
    title,
    description,
    bodyText: rawText,
    links: [...new Set(links)],
  };
}
