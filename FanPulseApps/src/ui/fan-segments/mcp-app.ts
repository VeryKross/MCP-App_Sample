import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import "../global.css";
import "./styles.css";

interface FanEntry {
  fanId: string;
  name: string;
  email: string;
  favoriteTeam: string;
  engagementCount: number;
  gamesAttended: number;
  purchaseCount: number;
  totalSpent: number;
  lastEngagement: string;
}

interface Segment {
  segment: string;
  description: string;
  count: number;
  fans: FanEntry[];
}

const SEGMENT_COLORS: Record<string, string> = {
  superfans: "#059669",
  engaged_no_purchase: "#6366f1",
  buyers_low_engagement: "#f59e0b",
  casual_fans: "#0d9488",
  dormant_fans: "#ef4444",
};

const SEGMENT_ICONS: Record<string, string> = {
  superfans: "⭐",
  engaged_no_purchase: "🎯",
  buyers_low_engagement: "🛒",
  casual_fans: "👋",
  dormant_fans: "💤",
};

const SEGMENT_LABELS: Record<string, string> = {
  superfans: "Superfans",
  engaged_no_purchase: "Engaged, No Purchase",
  buyers_low_engagement: "Buyers, Low Engagement",
  casual_fans: "Casual Fans",
  dormant_fans: "Dormant Fans",
};

const segmentsGrid = document.getElementById("segments-grid")!;
const detailPanel = document.getElementById("detail-panel")!;
const filterLabel = document.getElementById("filter-label")!;

const app = new App({ name: "Fan Segments", version: "1.0.0" });

// Render from tool result data sent by the host (avoids re-fetching)
app.ontoolresult = (params) => {
  const text = params.content
    ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
  if (text) {
    try {
      const data = JSON.parse(text);
      renderSegments(data.segments, data.teamFilter);
    } catch { /* ignore parse errors */ }
  }
};

function renderSegments(segments: Segment[], teamFilter: string) {
  filterLabel.textContent = teamFilter === "all" ? "All Teams" : teamFilter;

  segmentsGrid.innerHTML = segments
    .map(
      (seg) => `
    <div class="segment-card" data-segment="${seg.segment}" style="--accent: ${SEGMENT_COLORS[seg.segment] ?? "#888"}">
      <div class="segment-header">
        <span class="segment-icon">${SEGMENT_ICONS[seg.segment] ?? "📊"}</span>
        <span class="segment-name">${SEGMENT_LABELS[seg.segment] ?? seg.segment}</span>
      </div>
      <div class="segment-count">${seg.count}</div>
      <div class="segment-desc">${seg.description}</div>
    </div>
  `
    )
    .join("");

  segmentsGrid.querySelectorAll(".segment-card").forEach((card) => {
    card.addEventListener("click", () => {
      const segmentKey = card.getAttribute("data-segment")!;
      const segment = segments.find((s) => s.segment === segmentKey);
      if (segment) renderFanDetail(segment);

      segmentsGrid.querySelectorAll(".segment-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });
}

function renderFanDetail(segment: Segment) {
  if (segment.fans.length === 0) {
    detailPanel.innerHTML = `<p class="detail-placeholder">No fans in this segment</p>`;
    return;
  }

  detailPanel.innerHTML = `
    <h3 class="detail-title">${SEGMENT_LABELS[segment.segment] ?? segment.segment} — ${segment.count} fans</h3>
    <table class="fan-table">
      <thead>
        <tr><th>Name</th><th>Team</th><th>Engagements</th><th>Games</th><th>Purchases</th><th>Spent</th><th>Last Active</th></tr>
      </thead>
      <tbody>
        ${segment.fans
          .map(
            (f) => `
          <tr>
            <td><strong>${f.name}</strong><br><span class="fan-email">${f.email}</span></td>
            <td>${f.favoriteTeam}</td>
            <td>${f.engagementCount}</td>
            <td>${f.gamesAttended}</td>
            <td>${f.purchaseCount}</td>
            <td>$${f.totalSpent.toFixed(2)}</td>
            <td>${f.lastEngagement}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.onhostcontextchanged = handleHostContext;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyDocumentTheme(systemDark ? "dark" : "light");

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContext(ctx);
});
