# FanPulse — Next Steps: Adding MCP Apps (Interactive UI)

## Context

We have two working components today:

| Component | Type | Location | Language |
|---|---|---|---|
| **FanPulse** | MCP Server | `FanPulse/` | C# / .NET |
| **FanPulse Dashboard** | MCP Client (standalone) | `FanPulseDashboard/` | C# / .NET |

The **MCP Server** exposes 7 tools (fan profiles, engagement metrics, merchandise, 
recommendations, promotions, segments) over stdio, consumable by any MCP client 
(Claude Desktop, Copilot CLI, ChatGPT, or our Dashboard).

The **Dashboard** is a standalone MCP Client that connects to the server and provides 
an AI-powered chat interface using GitHub Models (GPT-4o).

## What Are MCP Apps?

MCP Apps is an official extension to the Model Context Protocol (announced January 2026, 
by Anthropic, OpenAI, and the community) that allows MCP Servers to return **interactive 
HTML interfaces** — dashboards, forms, charts, product grids — that render directly inside 
AI chat windows (Claude, ChatGPT) as sandboxed iframes.

**Before MCP Apps:** Tools return text/JSON → AI summarizes in words.  
**With MCP Apps:** Tools return interactive HTML → users click, filter, drag, and explore 
directly in the chat window.

### Key Architectural Insight

MCP Apps are built **into the MCP Server itself** — not as a separate component. The server 
registers both the tool logic AND the HTML UI as MCP resources. Every official example 
follows this pattern: one project, one deployable unit.

```
my-mcp-server/
├── server.ts          ← Tool registration + UI resource registration
├── src/App.tsx        ← Interactive UI (React, Vue, Vanilla JS, etc.)
├── dist/mcp-app.html  ← Bundled HTML served as an MCP resource
└── main.ts            ← Transport setup (stdio or HTTP)
```

Official repo: https://github.com/modelcontextprotocol/ext-apps

## Options for Adding MCP Apps to FanPulse

### Option 1: Build a TypeScript MCP Server with ext-apps (Recommended)

**Create a new TypeScript/Node.js MCP server** that reimplements the FanPulse tools using 
the official `@modelcontextprotocol/ext-apps` SDK, with interactive HTML UIs for each tool.

**Pros:**
- Uses the official SDK — full ext-apps support out of the box
- Rich ecosystem of examples to follow (customer-segmentation, cohort-heatmap, etc.)
- Can use React, Preact, Vue, or Vanilla JS for the interactive UIs
- Vite bundles everything into single HTML strings the server serves inline
- Would work immediately in Claude Desktop and ChatGPT

**Cons:**
- Requires reimplementing the FanPulse data layer in TypeScript
- Two server implementations to maintain (C# original + TypeScript with UI)
- Different language/ecosystem from the original

**Effort:** Medium — the data model and tool logic are straightforward to port. The main 
work is building the interactive HTML UIs.

**Suggested UIs to build:**
| Tool | Interactive UI |
|---|---|
| `GetFanSegments` | Clickable segment cards with fan drill-down |
| `SearchMerchandise` | Product grid with filters, images, price sorting |
| `GetFanEngagementMetrics` | Bar/line chart of engagement over time |
| `GetMerchRecommendations` | Recommendation cards with "add to promotion" buttons |
| `CreatePromotion` | Form with segment picker, discount slider, date range |

### Option 2: Wait for C# SDK Support

**Keep the existing C# FanPulse server** and wait for the `ModelContextProtocol` NuGet 
package to add ext-apps support.

**Pros:**
- No rework — just enhance the existing server when SDK support lands
- Stays in the C# / .NET ecosystem
- The existing server and Dashboard continue to work as-is

**Cons:**
- Timeline unknown — the C# SDK is at v0.8.0-preview.1 and ext-apps is very new
- May be weeks or months before official support
- Can't experiment with MCP Apps in the meantime

**Effort:** Minimal now, medium later when SDK support arrives.

### Option 3: Manually Implement the Protocol in C#

**Add ext-apps support manually to the existing C# FanPulse server** by implementing 
the protocol patterns directly:
- Register `ui://` URI resources with `text/html+mcp` MIME type
- Add `_meta.ui.resourceUri` metadata to tool definitions
- Bundle HTML/JS into string resources served by the server

**Pros:**
- Stays in C# — no language switch
- Can start immediately
- Deepest understanding of how the protocol works

**Cons:**
- No official SDK support — must implement protocol details by hand
- Risk of incompatibility if the spec evolves
- Must handle HTML bundling manually (no Vite ecosystem)
- Less community support for troubleshooting

**Effort:** Medium-high — protocol implementation + HTML bundling + testing against 
Claude/ChatGPT without official SDK validation.

## Recommendation

**Start with Option 1** (TypeScript server) for the fastest path to interactive MCP Apps 
that work in Claude and ChatGPT today. The existing C# server and Dashboard remain fully 
functional for scenarios where users want a standalone tool or connect via Copilot CLI.

Long-term, **monitor Option 2** — when the C# SDK adds ext-apps support, migrate the 
interactive UIs back to the C# server for a single-language codebase.

## What the Final Architecture Would Look Like

```
MCPTest/
├── FanPulse/                    ← C# MCP Server (existing, tools-only)
│   ├── Data/                    
│   ├── Tools/FanTools.cs        ← 7 tools returning JSON
│   └── doc/
│
├── FanPulseDashboard/           ← C# MCP Client (existing, standalone AI chat)
│   └── doc/
│
└── FanPulseApps/                ← NEW: TypeScript MCP Server with MCP Apps
    ├── server.ts                ← Tools + UI resource registration
    ├── src/
    │   ├── fan-segments/        ← Interactive segment visualization
    │   ├── merch-catalog/       ← Product grid UI
    │   ├── engagement-chart/    ← Engagement metrics chart
    │   └── promo-builder/       ← Promotion creation form
    ├── data/                    ← SQLite access (same fanpulse.db)
    └── dist/                    ← Bundled HTML files
```

Three complementary components:
1. **FanPulse** (C#) — lightweight MCP Server for any MCP client
2. **FanPulseDashboard** (C#) — standalone AI-powered console for teams without Claude/ChatGPT
3. **FanPulseApps** (TypeScript) — MCP Server with interactive UIs for Claude/ChatGPT users

## Resources

- **ext-apps repo:** https://github.com/modelcontextprotocol/ext-apps
- **ext-apps SDK (npm):** https://www.npmjs.com/package/@modelcontextprotocol/ext-apps
- **Quickstart guide:** https://modelcontextprotocol.github.io/ext-apps/api/documents/Quickstart.html
- **MCP Apps announcement:** https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- **Customer segmentation example** (closest to FanPulse): `examples/customer-segmentation-server/` in the ext-apps repo
- **C# MCP SDK:** https://github.com/modelcontextprotocol/csharp-sdk
