# FanPulse — MCP Fan Engagement Platform

A demo platform that shows how the **Model Context Protocol (MCP)** and the **MCP Apps extension** can transform AI-assisted fan engagement from plain text into interactive visual experiences.

```mermaid
graph LR
    Browser["🌐 Browser"]
    Dashboard["FanPulse Dashboard<br/>(Blazor Server)"]
    LLM["GPT-4o<br/>(GitHub Models)"]
    CS["FanPulse<br/>C# MCP Server"]
    TS["FanPulse Apps<br/>TS MCP Server"]
    DB[("fanpulse.db")]

    Browser <-->|SignalR| Dashboard
    Dashboard -->|Chat + Function Calling| LLM
    Dashboard <-->|stdio| CS
    Dashboard <-->|stdio| TS
    CS --> DB
    TS --> DB
```

## What's Inside

| Project | Language | Description |
|---|---|---|
| **[FanPulse](FanPulse/)** | C# / .NET 10 | MCP server exposing 7 fan-engagement tools over stdio. Returns JSON data. |
| **[FanPulseApps](FanPulseApps/)** | TypeScript / Node.js | MCP server with the same 7 tools, plus 5 interactive HTML UIs via the [MCP Apps extension](https://github.com/modelcontextprotocol/ext-apps). |
| **[FanPulseDashboard](FanPulseDashboard/)** | C# / Blazor Server | Web app that connects to **both** servers and shows their responses side-by-side — text on the left, rich interactive UIs on the right. |

## The Point

The FanPulse Dashboard lets you ask the same question and instantly see the difference:

- **Left panel (C# server)** → The AI reads JSON and summarizes it as text
- **Right panel (Apps server)** → The same data rendered as interactive charts, cards, and forms

This makes the value of the MCP Apps extension immediately visible in a demo setting.

## Quick Start

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Node.js](https://nodejs.org/) ≥ 18
- A [GitHub PAT](https://github.com/settings/tokens) with access to [GitHub Models](https://github.com/marketplace/models)

### Build & Run

```powershell
# 1. Build the C# MCP server (also creates + seeds the database)
dotnet build FanPulse
dotnet run --project FanPulse   # run once to create fanpulse.db, then Ctrl+C

# 2. Build the TypeScript MCP server
cd FanPulseApps
npm install
npm run build
cd ..

# 3. Set your GitHub Models token
$env:GITHUB_TOKEN = "ghp_..."

# 4. Launch the Dashboard
dotnet run --project FanPulseDashboard
```

Open **http://localhost:5000** and start asking questions:

- *"Show me the fan segments"*
- *"What merchandise do we have for the Thunderbolts?"*
- *"Recommend merchandise for Maria Rodriguez"*
- *"Create a 20% promotion for superfans on jerseys"*
- *"Show me engagement metrics for all fans"*

## How It Works

1. The **Dashboard** launches both MCP servers as child processes
2. Your prompt is sent to **GPT-4o** twice — once with C# tools, once with TypeScript tools
3. The LLM calls the appropriate MCP tools to fetch data
4. The C# panel shows the AI's text summary
5. The Apps panel shows the same data as an **interactive HTML visualization** (rendered in a sandboxed iframe)

Both servers read from the same SQLite database, so the underlying data is identical — only the presentation differs.

## Using with VS Code Copilot

You can also use the FanPulseApps server directly inside **VS Code Copilot Chat** — no Dashboard needed. This repo includes a `.vscode/mcp.json` that configures the server automatically.

### Setup

1. **Build the prerequisites** (if you haven't already):
   ```powershell
   dotnet run --project FanPulse   # creates + seeds fanpulse.db, then Ctrl+C
   cd FanPulseApps && npm install && npm run build && cd ..
   ```

2. **Open this project in VS Code** and open **Copilot Chat** in **Agent mode**

3. **Start the MCP server**: open the Command Palette (`Ctrl+Shift+P`) → `MCP: List Servers` → start `fanpulse-apps`

4. **Ask a question** — try *"Show me the fan segments"* or *"What merchandise do we have?"*

VS Code supports the MCP Apps extension natively, so the interactive UIs (segment cards, engagement charts, product grids, etc.) render **directly in the chat panel**. The host injects its own theme — so the same UI that appears in VS Code's Dark Modern theme would look different in another MCP-compatible client.

> **Note:** VS Code shows both the LLM's text summary and the interactive UI. This is by design — the text `content` is a universal fallback for any MCP client, while the UI is an optional enhancement that capable hosts render alongside it.

## Documentation

- [FanPulse Architecture](FanPulseApps/doc/FanPulse-Architecture.md) — System-wide architecture with Mermaid diagrams
- [FanPulse Apps Overview](FanPulseApps/doc/FanPulseApps-Overview.md) — How the ext-apps extension works
- [Dashboard Overview](FanPulseDashboard/doc/FanPulseDashboard-Overview.md) — How the Blazor web app is built

Each project also has its own [README](FanPulse/README.md) with detailed structure, design decisions, and extension guides.

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | GPT-4o via [GitHub Models](https://github.com/marketplace/models) |
| Protocol | [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) |
| Interactive UIs | [MCP Apps Extension](https://github.com/modelcontextprotocol/ext-apps) |
| C# Server | .NET 10, Microsoft.Data.Sqlite, MCP SDK |
| TypeScript Server | Node.js, better-sqlite3, Vite, ext-apps SDK |
| Dashboard | ASP.NET Blazor Server, Microsoft.Extensions.AI |
| Database | SQLite (shared) |
