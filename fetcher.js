import axios from 'axios';
import { config } from '../config/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-domain last-request timestamps for polite throttling
const lastHit = new Map();

async function politeDelay(url) {
  const host = new URL(url).host;
  const last = lastHit.get(host) || 0;
  const wait = config.minRequestDelayMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

// Fast path: plain HTTP fetch. Good for server-rendered HTML.
async function fetchStatic(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': config.userAgent, Accept: 'text/html' },
    timeout: 15000,
  });
  return data;
}

// Heuristic: does the HTML look like an empty SPA shell?
function looksUnrendered(html) {
  if (!html || html.length < 500) return true;
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Very little text outside scripts => probably client-rendered
  return bodyText.replace(/<[^>]+>/g, '').trim().length < 200;
}

// Slow path: real browser. Lazy-imported so the API process never loads it.
async function fetchRendered(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: config.userAgent });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function fetchHtml(url, { forceRender = false } = {}) {
  await politeDelay(url);
  if (forceRender) return fetchRendered(url);

  const html = await fetchStatic(url);
  if (looksUnrendered(html)) {
    await politeDelay(url);
    return fetchRendered(url);
  }
  return html;
}
