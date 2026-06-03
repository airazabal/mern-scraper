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

  const VIDEO_EXTS = /\.(mp4|webm|ogg|ogv|mov|avi|mkv|m3u8|mpd)(\?|$)/i;
  const VIDEO_HOSTS = /^https?:\/\/(www\.)?(youtube\.com\/embed|youtu\.be|player\.vimeo\.com|vimeo\.com\/video|dailymotion\.com\/embed)/i;

  function isVideoUrl(url) {
    return VIDEO_EXTS.test(url) || VIDEO_HOSTS.test(url);
  }

  const rawVideos = [];
  // JSON-LD VideoObject URLs are explicitly declared as video by the site — trusted, skip filter
  const trustedVideos = [];

  // Native HTML5: <video src> and <video><source src>
  $('video[src]').each((_, el) => {
    try { rawVideos.push(new URL($(el).attr('src'), baseUrl).href); } catch {}
  });
  $('video source[src]').each((_, el) => {
    try { rawVideos.push(new URL($(el).attr('src'), baseUrl).href); } catch {}
  });

  // YouTube / Vimeo iframes
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('vimeo.com')) {
      try { rawVideos.push(new URL(src, baseUrl).href); } catch {}
    }
  });

  // Open Graph video tag — filtered (sites sometimes put auth redirects here)
  const ogVideo = $('meta[property="og:video"]').attr('content') ||
                  $('meta[property="og:video:url"]').attr('content');
  if (ogVideo) {
    try { rawVideos.push(new URL(ogVideo, baseUrl).href); } catch {}
  }

  // JSON-LD VideoObject — trusted: the site explicitly declared these as video
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        const isVideo =
          entry['@type'] === 'VideoObject' ||
          (Array.isArray(entry['@type']) && entry['@type'].includes('VideoObject'));
        if (isVideo) {
          if (entry.contentUrl) trustedVideos.push(entry.contentUrl);
          if (entry.embedUrl) trustedVideos.push(entry.embedUrl);
        }
      }
    } catch {}
  });

  const videos = [
    ...new Set([
      ...[...new Set(rawVideos)].filter(isVideoUrl),
      ...trustedVideos,
    ]),
  ];

  return {
    title,
    description,
    bodyText: rawText,
    links: [...new Set(links)],
    videos,
  };
}
