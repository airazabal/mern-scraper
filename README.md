# Queue-based MERN scraper with Goal Agent

Decoupled architecture: the **API only reads cache + enqueues**; a separate
**worker** does all scraping. A **Claude-powered goal agent** keeps scraping
autonomously until a natural-language goal is achieved.

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

## Project layout

```
server/
  api.js                  Express API (cache reads + queue enqueue + agent routes)
  scrape.worker.js        BullMQ worker (fetch → parse → upsert)
  config/index.js
  models/
    ScrapeResult.js       target, items, links, title, bodyText, scrapedAt
    AgentSession.js       goal, status, frontier, collectedItems, log
  queue/
    connection.js         ioredis (maxRetriesPerRequest: null)
    scrapeQueue.js        BullMQ Queue + QueueEvents
  scraper/
    fetcher.js            axios → Playwright fallback, per-domain throttle
    parser.js             cheerio item extraction + generic link/meta extraction
    schema.js             zod schemas
  agent/
    goalAgent.js          Claude claude-opus-4-7 tool-use loop

client/
  src/
    App.jsx               Scraper tab + Agent tab
    components/
      Scraper.jsx         URL input, TanStack Query polling, results table
      AgentDashboard.jsx  Agent form, session list, live log, collected items
```

## Run

### Prerequisites
- Node 20+, Docker (for Mongo + Redis)
- `ANTHROPIC_API_KEY` (for the goal agent)

```bash
# 1. Infrastructure
docker compose up -d

# 2. Server
cd server
npm install
npx playwright install chromium
cp .env.example .env   # add ANTHROPIC_API_KEY
npm run api            # terminal 1
npm run worker         # terminal 2

# 3. Client
cd client
npm install
npm run dev            # http://localhost:5173
```

## Goal agent

The agent accepts a plain-English goal and a seed URL. It scrapes pages, feeds
them to Claude, and Claude uses tools to decide which links to follow next,
record relevant items, and call `finish_goal` when done.

Example goals:
- `"Collect 20 article titles and URLs from the HN front page"`
- `"Find all pages about AI from this blog and extract their publication dates"`
- `"Gather product names and prices until I have at least 30 items"`

Tune `maxIterations` (Claude decision steps) and `maxUrls` (total URLs to
scrape) to control cost and runtime.

## Notes
- Adjust selectors in `server/scraper/parser.js` for your target site's structure.
- `CACHE_TTL_MS` defaults to 6 h — tune per source update frequency.
- Respect `robots.txt` and site ToS.
