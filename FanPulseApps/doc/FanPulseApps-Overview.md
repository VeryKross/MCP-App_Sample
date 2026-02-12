# FanPulse Apps — Interactive MCP App Server

## What Is FanPulse Apps?

FanPulse Apps is a TypeScript MCP server that reimplements all the FanPulse fan-engagement
tools **with interactive HTML user interfaces**. When connected to an MCP client that
supports the ext-apps extension (such as Claude Desktop or ChatGPT), tool results are
displayed as rich, interactive UIs — charts, cards, grids, and forms — instead of plain
text/JSON.

It uses the same `fanpulse.db` SQLite database as the original C# FanPulse server,
providing a single source of truth for all fan data.

---

## Interactive UIs

| Tool | UI | What It Shows |
|---|---|---|
| `GetFanSegments` | Segment Cards | Clickable cards (Superfans, Casual, Dormant, etc.) with fan drill-down table |
| `SearchMerchandise` | Product Grid | Filterable/sortable product cards with team, category, and price controls |
| `GetFanEngagementMetrics` | Engagement Chart | Stacked bar chart (Chart.js) of engagement events per fan |
| `GetMerchRecommendations` | Recommendation Cards | Ranked product recommendations with relevance scores and reasons |
| `CreatePromotion` | Promotion Builder | Form with segment picker, discount slider, date range, and live creation |

Two additional tools (`GetFanProfile`, `LogEngagementEvent`) return JSON text like the
original C# server.

---

## How It Works

FanPulse Apps uses the **MCP Apps extension** (`@modelcontextprotocol/ext-apps`) to serve
interactive UIs. Each tool registers:

1. A **tool handler** — returns structured JSON data (works with any MCP client)
2. A **`ui://` resource** — returns a self-contained HTML file bundled by Vite

When an MCP client supports ext-apps, it fetches the `ui://` resource and renders it as
a sandboxed iframe. The iframe communicates with the server using a postMessage bridge
to fetch live data.

---

## Getting Started

### Prerequisites

- **Node.js 18+** installed
- **The FanPulse C# server must be run at least once** (to create and seed `fanpulse.db`)

### Build & Run

```powershell
# Install dependencies
cd FanPulseApps
npm install

# Build (compiles TypeScript + bundles all 5 UIs)
npm run build

# Run as HTTP server (default)
npm start

# Run as stdio server (for MCP client connections)
npm run start:stdio
```

### Using with the Dashboard

The FanPulseDashboard now offers a server selection menu at startup:

```
Select MCP Server:
  1. FanPulse        (C# — text/JSON responses)
  2. FanPulse Apps   (TypeScript — interactive UI responses)
```

Choose option 2 to connect to FanPulse Apps via stdio.

---

## Architecture

```
FanPulseApps/
├── server.ts              ← MCP server factory (tool + resource registration)
├── main.ts                ← Entry point (stdio or HTTP/SSE transport)
├── src/
│   ├── types.ts           ← Shared types (fan, product, segment, etc.)
│   ├── data/
│   │   └── database.ts    ← SQLite access (better-sqlite3, shared fanpulse.db)
│   ├── tools/
│   │   └── fan-tools.ts   ← All 7 tool implementations
│   └── ui/
│       ├── global.css     ← Shared base styles
│       ├── fan-segments/  ← Segment cards UI
│       ├── merch-search/  ← Product grid UI
│       ├── engagement-chart/ ← Chart.js engagement chart UI
│       ├── merch-recommendations/ ← Recommendation cards UI
│       └── promo-builder/ ← Promotion creation form UI
├── dist/                  ← Built output (server JS + bundled HTML files)
├── package.json
├── tsconfig.json          ← Type-checking config (DOM + ESNext)
├── tsconfig.server.json   ← Compilation config (Node output)
└── vite.config.ts         ← Vite config for single-file HTML bundling
```
