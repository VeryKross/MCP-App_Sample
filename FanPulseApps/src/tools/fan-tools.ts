import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import * as db from "../data/database.js";
import type { SegmentName } from "../types.js";
import { SEGMENT_DESCRIPTIONS } from "../types.js";

// Resolve dist directory for built HTML files.
// In dev (.ts): src/tools/ → ../../dist
// Compiled (.js): dist/src/tools/ → ../.. (back to dist/)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "..", "dist")
  : path.join(import.meta.dirname, "..", "..");

async function loadUiHtml(filename: string): Promise<string> {
  return fs.readFile(path.join(DIST_DIR, filename), "utf-8");
}

// ── GetFanProfile ──

const GetFanProfileInput = z.object({
  fanIdentifier: z
    .string()
    .describe("The fan ID (e.g. 'fan-001') or email address to look up"),
});

export function registerGetFanProfile(server: McpServer) {
  server.tool(
    "GetFanProfile",
    "Get a fan's profile including their favorite team, players, attendance history, and purchase history.",
    GetFanProfileInput.shape,
    async ({ fanIdentifier }): Promise<CallToolResult> => {
      const fan = db.getFanByIdOrEmail(fanIdentifier);
      if (!fan) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: "Fan not found", identifier: fanIdentifier }) },
          ],
        };
      }
      const profile = {
        ...fan,
        recentEngagements: db.getRecentEngagements(fan.fanId, 10),
        purchaseHistory: db.getPurchaseHistory(fan.fanId),
        engagementSummary: db.getEngagementSummary(fan.fanId),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      };
    }
  );
}

// ── LogEngagementEvent ──

const LogEngagementInput = z.object({
  fanId: z.string().describe("The fan ID (e.g. 'fan-001')"),
  eventType: z
    .string()
    .describe("Type of engagement: game_attendance, app_open, social_share, content_view"),
  details: z.string().describe("Additional details about the event"),
  eventDate: z
    .string()
    .optional()
    .describe("Date of the event in YYYY-MM-DD format (defaults to today)"),
});

export function registerLogEngagementEvent(server: McpServer) {
  server.tool(
    "LogEngagementEvent",
    "Record a fan engagement event such as game attendance, app usage, social media interaction, or content viewing.",
    LogEngagementInput.shape,
    async ({ fanId, eventType, details, eventDate }): Promise<CallToolResult> => {
      if (!db.fanExists(fanId)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Fan not found", fanId }) }],
        };
      }
      const eventId = `evt-${crypto.randomUUID().replace(/-/g, "").slice(0, 7)}`;
      const date = eventDate ?? new Date().toISOString().slice(0, 10);
      db.insertEngagementEvent({ eventId, fanId, eventType, eventDate: date, details });
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, eventId, fanId, eventType, eventDate: date, details }) },
        ],
      };
    }
  );
}

// ── GetFanEngagementMetrics + Chart UI ──

const GetMetricsInput = z.object({
  fanId: z
    .string()
    .optional()
    .describe("Optional fan ID to get metrics for a specific fan. If omitted, returns top engaged fans."),
  lookbackDays: z.number().optional().describe("Number of days to look back for engagement data. Use this to override the default 90-day window, e.g. 365 for a full year."),
});

export function registerGetFanEngagementMetrics(server: McpServer) {
  const resourceUri = "ui://fanpulse/engagement-chart.html";

  registerAppTool(
    server,
    "GetFanEngagementMetrics",
    {
      title: "Get Fan Engagement Metrics",
      description:
        "Get engagement metrics and scores for a specific fan or all fans. Returns engagement frequency, recency, and an overall score.",
      inputSchema: GetMetricsInput.shape,
      _meta: { ui: { resourceUri } },
    },
    async ({ fanId, lookbackDays: lookbackDaysParam }): Promise<CallToolResult> => {
      const lookbackDays = lookbackDaysParam ?? 90;
      const cutoffDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);

      if (fanId) {
        const fan = db.getFanByIdOrEmail(fanId);
        const metrics = db.getEngagementSummary(fanId, cutoffDate);
        // Shape as a single-entry FanMetric so the chart UI can render it
        const fanMetric = {
          fanId,
          name: fan ? `${fan.firstName} ${fan.lastName}` : fanId,
          favoriteTeam: fan?.favoriteTeam ?? "Unknown",
          totalEvents: metrics.totalEvents,
          eventTypes: new Set(
            [metrics.gamesAttended > 0, metrics.appOpens > 0, metrics.socialShares > 0, metrics.contentViews > 0]
              .filter(Boolean)
          ).size,
          gamesAttended: metrics.gamesAttended,
          lastEngagement: metrics.lastEvent !== "none" ? String(metrics.lastEvent) : "none",
          engagementScore: metrics.totalEvents * 2 + metrics.gamesAttended * 2,
          details: metrics,
        };
        return {
          content: [{ type: "text", text: JSON.stringify({ lookbackDays, fans: [fanMetric] }, null, 2) }],
          structuredContent: { lookbackDays, fans: [fanMetric] },
        };
      }

      const rawFans = db.getAllFanMetrics(cutoffDate);
      const fans = rawFans.map((f) => ({
        ...f,
        lastEngagement: f.lastEngagement ?? "none",
        engagementScore: f.totalEvents * f.eventTypes + f.gamesAttended * 2,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ lookbackDays, fans }, null, 2) }],
        structuredContent: { lookbackDays, fans },
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Fan Engagement Metrics Chart" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await loadUiHtml("src/ui/engagement-chart/mcp-app.html") }],
    })
  );
}

// ── SearchMerchandise + Product Grid UI ──

const SearchMerchInput = z.object({
  team: z.string().optional().describe("Filter by team name (e.g. 'Thunderbolts')"),
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g. 'Jersey', 'Hat', 'Accessory', 'Drinkware', 'Apparel', 'Equipment', 'Collectible')"),
  player: z.string().optional().describe("Filter by player name"),
  maxPrice: z.number().optional().describe("Maximum price filter"),
  inStockOnly: z.boolean().optional().describe("Only show in-stock items (default: true)"),
});

export function registerSearchMerchandise(server: McpServer) {
  const resourceUri = "ui://fanpulse/merch-search.html";

  registerAppTool(
    server,
    "SearchMerchandise",
    {
      title: "Search Merchandise",
      description: "Search the merchandise catalog with optional filters for team, category, player, and price range.",
      inputSchema: SearchMerchInput.shape,
      _meta: { ui: { resourceUri } },
    },
    async ({ team, category, player, maxPrice, inStockOnly }): Promise<CallToolResult> => {
      const results = db.searchMerchandise({ team, category, player, maxPrice, inStockOnly });
      const products = results.map((r) => ({ ...r, inStock: r.inStock === 1 }));
      return {
        content: [{ type: "text", text: JSON.stringify({ resultCount: products.length, products }, null, 2) }],
        structuredContent: { resultCount: products.length, products },
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Merchandise Search Product Grid" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await loadUiHtml("src/ui/merch-search/mcp-app.html") }],
    })
  );
}

// ── GetMerchRecommendations + Cards UI ──

const GetRecsInput = z.object({
  fanId: z.string().describe("The fan ID to generate recommendations for"),
  maxResults: z.number().optional().describe("Maximum number of recommendations to return (default: 5)"),
});

export function registerGetMerchRecommendations(server: McpServer) {
  const resourceUri = "ui://fanpulse/merch-recommendations.html";

  registerAppTool(
    server,
    "GetMerchRecommendations",
    {
      title: "Get Merchandise Recommendations",
      description:
        "Get personalized merchandise recommendations for a fan based on their profile, engagement history, and purchase patterns.",
      inputSchema: GetRecsInput.shape,
      _meta: { ui: { resourceUri } },
    },
    async ({ fanId, maxResults }): Promise<CallToolResult> => {
      const limit = maxResults ?? 5;
      const fanRow = db.getFanForRecommendation(fanId);
      if (!fanRow) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Fan not found", fanId }) }] };
      }

      const { FavoriteTeam: favoriteTeam, FavoritePlayers: favoritePlayers } = fanRow;
      const purchased = db.getPurchasedProductIds(fanId);
      const { total: totalEngagements, games: gamesAttended } = db.getFanEngagementCounts(fanId);
      const allMerch = db.getAllInStockMerchandise();

      const recommendations: { score: number; reason: string; product: typeof allMerch[0] }[] = [];

      for (const prod of allMerch) {
        if (purchased.has(prod.productId)) continue;

        let score = 0;
        const reasons: string[] = [];

        if (prod.team.toLowerCase() === favoriteTeam.toLowerCase()) {
          score += 10;
          reasons.push("Matches favorite team");
        }
        if (prod.player && favoritePlayers.toLowerCase().includes(prod.player.toLowerCase())) {
          score += 15;
          reasons.push(`Features favorite player: ${prod.player}`);
        }
        if (gamesAttended >= 3 && prod.price > 50) {
          score += 5;
          reasons.push("Premium pick for dedicated fan");
        }
        if (totalEngagements < 3 && prod.price < 30) {
          score += 5;
          reasons.push("Great entry-level item");
        }

        if (score > 0) {
          recommendations.push({
            score,
            reason: reasons.join("; "),
            product: { ...prod, inStock: prod.inStock === 1 ? 1 : 0 },
          });
        }
      }

      recommendations.sort((a, b) => b.score - a.score);
      const topRecs = recommendations.slice(0, limit).map((r) => ({
        product: { ...r.product, inStock: Boolean(r.product.inStock) },
        relevanceScore: r.score,
        reason: r.reason,
      }));

      const engagementLevel =
        gamesAttended >= 4 ? "superfan" : gamesAttended >= 2 ? "regular" : "casual";

      const result = { fanId, favoriteTeam, favoritePlayers, engagementLevel, recommendations: topRecs };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Personalized Merchandise Recommendations" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await loadUiHtml("src/ui/merch-recommendations/mcp-app.html") }],
    })
  );
}

// ── CreatePromotion + Promo Builder UI ──

const CreatePromoInput = z.object({
  name: z.string().describe("Name for the promotion"),
  description: z.string().describe("Description of the promotion"),
  discountPercent: z.number().describe("Discount percentage (e.g. 15 for 15% off)"),
  targetSegment: z
    .string()
    .describe("Target fan segment: all, high_engagement, low_engagement, no_purchases, specific_team"),
  productCategory: z.string().describe("Product category to apply promotion to (e.g. 'Jersey', 'Hat', or 'all')"),
  startDate: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to today)"),
  endDate: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to 30 days from start)"),
});

export function registerCreatePromotion(server: McpServer) {
  const resourceUri = "ui://fanpulse/promo-builder.html";

  registerAppTool(
    server,
    "CreatePromotion",
    {
      title: "Create Promotion",
      description:
        "Create a targeted promotion or discount offer for a specific fan segment and product category.",
      inputSchema: CreatePromoInput.shape,
      _meta: { ui: { resourceUri } },
    },
    async ({
      name,
      description,
      discountPercent,
      targetSegment,
      productCategory,
      startDate,
      endDate,
    }): Promise<CallToolResult> => {
      const promotionId = `promo-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const start = startDate ?? new Date().toISOString().slice(0, 10);
      const end = endDate ?? new Date(new Date(start).getTime() + 30 * 86400000).toISOString().slice(0, 10);

      db.insertPromotion({
        promotionId,
        name,
        description,
        discountPercent,
        targetSegment,
        productCategory,
        startDate: start,
        endDate: end,
        createdDate: new Date().toISOString().slice(0, 10),
      });

      const estimatedReach = db.countTargetFans(targetSegment);
      const result = {
        success: true,
        promotionId,
        name,
        description,
        discountPercent,
        targetSegment,
        productCategory,
        startDate: start,
        endDate: end,
        estimatedReach,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Promotion Builder Form" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await loadUiHtml("src/ui/promo-builder/mcp-app.html") }],
    })
  );
}

// ── GetFanSegments + Segment Cards UI ──

const GetSegmentsInput = z.object({
  team: z.string().optional().describe("Optional team filter"),
});

export function registerGetFanSegments(server: McpServer) {
  const resourceUri = "ui://fanpulse/fan-segments.html";

  registerAppTool(
    server,
    "GetFanSegments",
    {
      title: "Get Fan Segments",
      description:
        "Get fan segments based on engagement and purchase behavior. Returns groups like 'high-engagement no-purchase', 'loyal buyers', 'at-risk fans', etc.",
      inputSchema: GetSegmentsInput.shape,
      _meta: { ui: { resourceUri } },
    },
    async ({ team }): Promise<CallToolResult> => {
      const rawFans = db.getFanSegmentData(team);
      const segments: Record<string, typeof rawFans> = {
        superfans: [],
        engaged_no_purchase: [],
        buyers_low_engagement: [],
        casual_fans: [],
        dormant_fans: [],
      };

      for (const fan of rawFans) {
        const f = { ...fan, lastEngagement: fan.lastEngagement ?? "never" };
        const engagements = f.engagementCount;
        const purchases = f.purchaseCount;

        if (engagements >= 4 && purchases > 0) segments.superfans.push(f);
        else if (engagements >= 3 && purchases === 0) segments.engaged_no_purchase.push(f);
        else if (purchases > 0 && engagements < 3) segments.buyers_low_engagement.push(f);
        else if (engagements >= 1 && engagements < 3) segments.casual_fans.push(f);
        else segments.dormant_fans.push(f);
      }

      const result = {
        teamFilter: team ?? "all",
        segments: Object.entries(segments).map(([key, fans]) => ({
          segment: key,
          description: SEGMENT_DESCRIPTIONS[key as SegmentName],
          count: fans.length,
          fans,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Fan Segments Explorer" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await loadUiHtml("src/ui/fan-segments/mcp-app.html") }],
    })
  );
}
