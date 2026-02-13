import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import "../global.css";
import "./styles.css";

interface Recommendation {
  product: {
    productId: string;
    name: string;
    category: string;
    team: string;
    player: string;
    price: number;
    inStock: boolean;
  };
  relevanceScore: number;
  reason: string;
}

const fanInfo = document.getElementById("fan-info")!;
const recsGrid = document.getElementById("recs-grid")!;

const app = new App({ name: "Merch Recommendations", version: "1.0.0" });

// Render from tool result data sent by the host (avoids re-fetching)
app.ontoolresult = (params) => {
  const text = params.content
    ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
  if (text) {
    try {
      renderRecommendations(JSON.parse(text));
    } catch { /* ignore parse errors */ }
  }
};

const CATEGORY_ICONS: Record<string, string> = {
  Jersey: "👕", Hat: "🧢", Accessory: "🧣", Drinkware: "☕",
  Apparel: "🧥", Equipment: "⚽", Collectible: "🏆",
};

function renderRecommendations(data: {
  fanId: string;
  favoriteTeam: string;
  favoritePlayers: string;
  engagementLevel: string;
  recommendations: Recommendation[];
}) {
  fanInfo.innerHTML = `
    <strong>${data.fanId}</strong> · ${data.favoriteTeam} · 
    <span class="level-badge level-${data.engagementLevel}">${data.engagementLevel}</span> ·
    Favorites: ${data.favoritePlayers}
  `;

  if (data.recommendations.length === 0) {
    recsGrid.innerHTML = '<p class="empty">No recommendations available</p>';
    return;
  }

  recsGrid.innerHTML = data.recommendations
    .map(
      (rec, i) => `
    <div class="rec-card">
      <div class="rec-rank">#${i + 1}</div>
      <div class="rec-icon">${CATEGORY_ICONS[rec.product.category] ?? "📦"}</div>
      <div class="rec-body">
        <div class="rec-name">${rec.product.name}</div>
        <div class="rec-meta">${rec.product.team} · ${rec.product.category}${rec.product.player ? ` · ${rec.product.player}` : ""}</div>
        <div class="rec-reason">${rec.reason}</div>
      </div>
      <div class="rec-right">
        <div class="rec-price">$${rec.product.price.toFixed(2)}</div>
        <div class="rec-score">Score: ${rec.relevanceScore}</div>
      </div>
    </div>`
    )
    .join("");
}

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.onhostcontextchanged = handleHostContext;
applyDocumentTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
app.connect().then(() => { const ctx = app.getHostContext(); if (ctx) handleHostContext(ctx); });
