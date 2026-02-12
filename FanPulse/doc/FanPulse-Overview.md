# Fan Pulse — Fan Engagement Intelligence Platform

## What Is Fan Pulse?

Fan Pulse is a smart assistant tool designed for sports organizations that want to better
understand their fans, strengthen relationships, and grow merchandise revenue. It works
alongside AI assistants (like those built into modern chat or productivity tools) to give
your team instant, conversational access to fan data and actionable insights.

Think of it as giving your marketing, fan engagement, and merchandise teams a knowledgeable
assistant who knows every fan, tracks how they interact with your organization, and can
make smart product recommendations on the spot.

---

## What Can It Do?

### 🏟️ Fan Profiles
Look up any fan and instantly see their complete picture — favorite team, favorite players,
which games they've attended, what they've bought, and how engaged they are. No more digging
through spreadsheets or multiple systems.

**Example question you could ask:**
> "Tell me about Maria Rodriguez — what's her engagement like?"

### 📊 Engagement Tracking
Every time a fan attends a game, opens the app, shares something on social media, or watches
content, Fan Pulse records it. This builds a rich history of how each fan interacts with
your organization over time.

**Example question you could ask:**
> "Log that fan-003 attended today's River Wolves home game."

### 📈 Engagement Metrics & Scoring
Fan Pulse calculates engagement scores automatically. You can see who your most engaged fans
are, spot trends, and identify fans who might be losing interest — all through simple
conversation.

**Example question you could ask:**
> "Who are our most engaged fans over the last 60 days?"

### 🛍️ Merchandise Search
Browse and filter the entire merchandise catalog by team, player, product category, or price
range. Useful for quickly finding what's available when planning campaigns or answering
fan inquiries.

**Example question you could ask:**
> "Show me all Thunderbolts jerseys under $100."

### 🎯 Personalized Merchandise Recommendations
This is where Fan Pulse really shines. Based on a fan's favorite team, favorite players,
engagement level, and purchase history, it suggests merchandise they're most likely to love.
Highly engaged fans get premium product suggestions, while newer or casual fans see more
approachable entry-level items.

**Example question you could ask:**
> "What merchandise should we recommend to Priya Sharma?"

### 🏷️ Promotions
Create targeted discount offers aimed at specific fan segments and product categories. Fan
Pulse estimates how many fans a promotion would reach, helping you make informed decisions
before launching.

**Example question you could ask:**
> "Create a 20% off jersey promotion for fans who attend games but haven't bought anything."

### 👥 Fan Segments
Fan Pulse automatically groups your fans into meaningful segments based on their behavior:

| Segment | Who They Are | Why They Matter |
|---------|-------------|-----------------|
| **Superfans** | High engagement + purchases | Your most valuable supporters — keep them happy |
| **Engaged, No Purchase** | Active fans who haven't bought anything | Prime conversion targets — a small nudge could go a long way |
| **Buyers, Low Engagement** | They've bought merch but aren't very active | Re-engagement opportunity — remind them why they love the team |
| **Casual Fans** | Some activity, no purchases | Need nurturing to build a deeper connection |
| **Dormant Fans** | Little to no engagement | At risk of churning — consider a win-back campaign |

**Example question you could ask:**
> "Show me fan segments for Thunderbolts fans."

---

## How Does It Work?

Fan Pulse uses a technology called the **Model Context Protocol (MCP)**, which is a standard
way for AI assistants to securely connect to data sources and tools. When you ask a question
through your AI assistant, it talks to Fan Pulse behind the scenes to fetch data, run
calculations, and return answers — all in natural language.

You don't need to learn any queries, dashboards, or special software. Just ask questions
the way you'd ask a colleague.

---

## Who Is This For?

- **Marketing Teams** — Plan targeted campaigns based on real fan behavior
- **Fan Engagement Managers** — Monitor engagement health and spot at-risk fans
- **Merchandise Teams** — Understand what products to promote to which fans
- **Executive Leadership** — Get quick answers about fan trends and revenue opportunities

---

## What Data Is Included?

The current system comes pre-loaded with sample data for demonstration purposes:

- **12 fans** across three teams (Thunderbolts, River Wolves, Summit FC)
- **44 engagement events** (game attendance, app usage, social shares, content views)
- **25 merchandise products** (jerseys, hats, accessories, drinkware, apparel, collectibles)
- **8 purchase records** showing realistic buying patterns

This sample data lets you immediately explore all features and see how the system works
before connecting it to your real fan database.

---

## Getting Started

1. Make sure you have **.NET 8 or later** installed on your computer
2. Open a terminal and navigate to the FanPulse folder
3. Run: `dotnet run`
4. Configure your AI assistant (e.g., Claude Desktop) to connect to Fan Pulse as an MCP server

That's it — start asking questions about your fans!

---

## Companion App: FanPulse Dashboard

The **FanPulse Dashboard** is a companion MCP App that connects to this server and provides
an AI-powered interactive console. Instead of configuring an AI assistant, you can run the
Dashboard directly and have natural language conversations about your fan data. It uses
GitHub Models (GPT-4o) to understand your questions and automatically call the right
FanPulse tools.

See the `FanPulseDashboard` project and its `doc/FanPulseDashboard-Overview.md` for details.

---

## Sample Conversation

Here's an example of what a real interaction might look like:

> **You:** "I want to boost merch sales this quarter. Who should we target?"
>
> **Assistant:** "Based on Fan Pulse data, your best opportunity is the **Engaged, No Purchase**
> segment — 3 fans who have attended 3 or more events but haven't bought any merchandise yet.
> These include Priya Sharma (River Wolves, 5 events), Aisha Hassan (Thunderbolts, 5 events),
> and James O'Brien (Thunderbolts, 3 events)."
>
> **You:** "What would you recommend for Priya?"
>
> **Assistant:** "Priya's favorite players are Carlos Vega and Mei Lin. I'd recommend the
> Carlos Vega #11 Jersey ($104.99) and the Mei Lin #5 Jersey ($104.99) as top picks, followed
> by the River Wolves Home Jersey ($84.99) and River Wolves Cap ($27.99) as complementary items."
>
> **You:** "Let's create a 15% off promotion on jerseys for that whole segment."
>
> **Assistant:** "Done! Created promotion 'Jersey Boost Q1' — 15% off all jerseys, targeting
> the engaged-no-purchase segment. Estimated reach: 3 fans. Valid from today through March 12."
