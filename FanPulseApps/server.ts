import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerGetFanProfile,
  registerLogEngagementEvent,
  registerGetFanEngagementMetrics,
  registerSearchMerchandise,
  registerGetMerchRecommendations,
  registerCreatePromotion,
  registerGetFanSegments,
} from "./src/tools/fan-tools.js";

/**
 * Creates a new MCP server instance with all tools and resources registered.
 * Each HTTP session needs its own server instance because McpServer only supports one transport.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "FanPulse Apps Server",
    version: "1.0.0",
  });

  registerGetFanProfile(server);
  registerLogEngagementEvent(server);
  registerGetFanEngagementMetrics(server);
  registerSearchMerchandise(server);
  registerGetMerchRecommendations(server);
  registerCreatePromotion(server);
  registerGetFanSegments(server);

  return server;
}
