/**
 * Build script for all MCP App UI HTML files.
 * Each UI is a separate Vite build that produces a single self-contained HTML file.
 */
import { execSync } from "node:child_process";

const UIS = [
  "src/ui/fan-segments/mcp-app.html",
  "src/ui/merch-search/mcp-app.html",
  "src/ui/engagement-chart/mcp-app.html",
  "src/ui/merch-recommendations/mcp-app.html",
  "src/ui/promo-builder/mcp-app.html",
];

for (const input of UIS) {
  console.log(`Building UI: ${input}`);
  execSync(`npx cross-env INPUT=${input} vite build`, {
    stdio: "inherit",
    env: { ...process.env, INPUT: input },
  });
}

console.log("All UIs built successfully.");
