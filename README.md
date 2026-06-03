# MERN Scraper with Claude Goal Agent

[![GitHub stars](https://img.shields.io/github/stars/airazabal/mern-scraper?style=flat-square)](https://github.com/airazabal/mern-scraper/stargazers)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-green?style=flat-square&logo=mongodb)](https://www.mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7-red?style=flat-square&logo=redis)](https://redis.io)
[![Built with Claude](https://img.shields.io/badge/built%20with-Claude%20claude--opus--4--7-blueviolet?style=flat-square)](https://www.anthropic.com)

A queue-based MERN web scraper where the **API only reads cache and enqueues jobs** — a separate **worker process** does all scraping. A **Claude-powered goal agent** crawls autonomously until a natural-language goal is achieved.

```
client (React + TanStack Query)
        │  GET /api/data?target=…          GET /api/agent/:id (poll)
        ▼                                  ▼
  api.js  ──fresh?──► returns cached    AgentSession in Mongo
        │ stale/missing                    ▲
        ▼                                  │ runGoalAgent() (background)
  BullMQ (Redis)                       goalAgent.js
        │                                  │  Claude (tool use)
        ▼                                  │  ├─ add_to_frontier
  scrape.worker.js                         │  ├─ record_items
        │  fetcher (axios → Playwright)    │  ├─ finish_goal
        │  parser  (cheerio + zod)         │  └─ give_up
        ▼                                  │
       Mongo ─────────────────────────────┘
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | Uses ES modules and `node:test` |
| MongoDB | 7 | Via Docker or Homebrew |
| Redis | 7 | Via Docker or Homebrew |
| Anthropic API key | — | Required for the goal agent only |

---

## Installation

### 1. Clone

```bash
git clone https://github.com/airazabal/mern-scraper.git
cd mern-scraper
```

### 2. Start infrastructure

**Option A — Docker (recommended)**
```bash
docker compose up -d
```

**Option B — Homebrew (macOS)**
```bash
brew tap mongodb/brew
brew install mongodb-community redis
brew services start mongodb/brew/mongodb-community
brew services start redis
```

### 3. Install server dependencies

```bash
cd server
npm install
npx playwright install chromium   # only needed for JS-rendered pages
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/scraper
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
CACHE_TTL_MS=21600000        # how long cached scrapes stay fresh (6h default)
MIN_REQUEST_DELAY_MS=1500    # per-domain politeness throttle
ANTHROPIC_API_KEY=sk-ant-... # required for the goal agent
```

### 5. Install client dependencies

```bash
cd ../client
npm install
```

---

## Running

You need **three terminals** (or use a process manager like `pm2`).

**Terminal 1 — API server**
```bash
cd server
npm run api
# [api] connected to mongo
# [api] listening on :4000
```

**Terminal 2 — Scrape worker**
```bash
cd server
npm run worker
# [worker] connected to mongo
```

**Terminal 3 — React dev server**
```bash
cd client
npm run dev
# VITE ready → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Using the app

### Scraper tab

1. Paste any URL into the input field and click **Scrape**.
2. If the URL is already cached and fresh, results appear immediately.
3. If stale or unseen, the API returns `202 Pending` and the worker starts scraping. The UI polls every 3 seconds and updates automatically when results are ready.
4. Structured item extraction uses CSS selectors in `server/scraper/parser.js` — adjust `.table-row`, `.rank`, and `.name` to match your target site.

### Agent tab

The goal agent crawls autonomously, driven by Claude, until it satisfies a plain-English goal.

1. Enter a **goal** — describe what you want in natural language.
2. Enter a **seed URL** — where the agent starts crawling.
3. Set limits:
   - **Max iterations** — how many times Claude can decide what to scrape next (each iteration may scrape up to 5 URLs).
   - **Max URLs** — hard cap on total URLs visited.
4. Click **Start agent**.
5. The session list and log update live (polling every 3 s while running).
6. Click into any session to see the full log, progress bar, and collected items.
7. Click **Stop agent** to halt a running session early.

**Example goals**

```
Collect at least 10 story titles and their URLs from Hacker News
```
```
Find all blog posts about Rust on this site and extract their titles and dates
```
```
Gather product names and prices until I have at least 30 items
```

**How Claude drives the loop**

Each iteration Claude receives the scraped page content and calls tools:

| Tool | Effect |
|---|---|
| `add_to_frontier` | Queues new URLs to scrape next |
| `record_items` | Stores extracted items toward the goal |
| `finish_goal` | Marks session completed with a summary |
| `give_up` | Marks session failed with a reason |

Claude calls `record_items` and `finish_goal` in the same turn once the goal is met, so sessions complete in as few iterations as possible.

---

## Running tests

```bash
cd server
npm test
```

23 unit tests covering the Zod schemas, cheerio parser, and the `looksUnrendered` heuristic that decides whether to fall back from axios to Playwright.

---

## Project layout

```
server/
  api.js                  Express API — cache reads, queue enqueue, agent CRUD
  scrape.worker.js        BullMQ worker — fetch → parse → upsert (concurrency 2)
  config/index.js         Env-backed config
  models/
    ScrapeResult.js       target, items, links, title, bodyText, scrapedAt
    AgentSession.js       goal, status, frontier, visited, collectedItems, log
  queue/
    connection.js         ioredis connection (maxRetriesPerRequest: null)
    scrapeQueue.js        BullMQ Queue + QueueEvents for waitUntilFinished
  scraper/
    fetcher.js            axios → Playwright fallback, per-domain throttle
    parser.js             cheerio item extraction + generic link/meta extraction
    schema.js             zod ItemSchema + PageSummarySchema
  agent/
    goalAgent.js          Claude claude-opus-4-7 tool-use loop
  tests/
    schema.test.js
    parser.test.js
    fetcher.test.js

client/
  src/
    App.jsx               Two-tab shell (Scraper + Agent)
    components/
      Scraper.jsx         URL input, TanStack Query polling, results table
      AgentDashboard.jsx  Agent form, session list, live log, collected items
```

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API server port (avoid 5000 — macOS AirPlay uses it) |
| `MONGO_URI` | `mongodb://localhost:27017/scraper` | MongoDB connection string |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `CACHE_TTL_MS` | `21600000` (6 h) | How long a scraped result is considered fresh |
| `MIN_REQUEST_DELAY_MS` | `1500` | Per-domain politeness delay between requests |
| `USER_AGENT` | `MyScraperBot/1.0` | User-agent header sent with every request |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for the goal agent |

---

## Notes

- Adjust selectors in `server/scraper/parser.js` for your target site — the defaults (`.table-row`, `.rank`, `.name`) are examples.
- The worker runs with `concurrency: 2` and 4 retry attempts with exponential backoff.
- BullMQ uses deterministic job IDs to deduplicate identical in-flight requests.
- Respect `robots.txt` and site Terms of Service.
