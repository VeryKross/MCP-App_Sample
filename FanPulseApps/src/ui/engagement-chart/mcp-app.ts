import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { Chart, registerables } from "chart.js";
import "../global.css";
import "./styles.css";

Chart.register(...registerables);

interface FanMetric {
  fanId: string;
  name: string;
  favoriteTeam: string;
  totalEvents: number;
  eventTypes: number;
  gamesAttended: number;
  lastEngagement: string;
  engagementScore: number;
}

const chartCanvas = document.getElementById("engagement-chart") as HTMLCanvasElement;
const fanList = document.getElementById("fan-list")!;
const lookbackLabel = document.getElementById("lookback-label")!;

let chart: Chart | null = null;
const app = new App({ name: "Engagement Chart", version: "1.0.0" });

const TEAM_COLORS: Record<string, string> = {
  Thunderbolts: "#6366f1",
  "River Wolves": "#0d9488",
  "Summit FC": "#f59e0b",
};

function getTextColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim() || "#6b7280";
}

function getGridColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-border-primary").trim() || "#e5e7eb";
}

function renderChart(fans: FanMetric[]) {
  const sorted = [...fans].sort((a, b) => b.engagementScore - a.engagementScore);
  const top = sorted.slice(0, 12);

  const textColor = getTextColor();
  const gridColor = getGridColor();

  if (chart) chart.destroy();

  chart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: top.map((f) => f.name.split(" ")[0]),
      datasets: [
        {
          label: "Games Attended",
          data: top.map((f) => f.gamesAttended),
          backgroundColor: top.map((f) => (TEAM_COLORS[f.favoriteTeam] ?? "#888") + "cc"),
          borderRadius: 4,
        },
        {
          label: "Other Events",
          data: top.map((f) => f.totalEvents - f.gamesAttended),
          backgroundColor: top.map((f) => (TEAM_COLORS[f.favoriteTeam] ?? "#888") + "55"),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: true, labels: { color: textColor, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return top[idx].name;
            },
            afterBody: (items) => {
              const idx = items[0].dataIndex;
              const f = top[idx];
              return [`Team: ${f.favoriteTeam}`, `Score: ${f.engagementScore}`, `Last: ${f.lastEngagement}`];
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: textColor, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          stacked: true,
          title: { display: true, text: "Events", color: textColor, font: { size: 11, weight: "bold" } },
          ticks: { color: textColor, font: { size: 10 }, stepSize: 1 },
          grid: { color: gridColor },
        },
      },
    },
  });
}

function renderFanList(fans: FanMetric[]) {
  const sorted = [...fans].sort((a, b) => b.engagementScore - a.engagementScore);
  fanList.innerHTML = `
    <table class="fan-table">
      <thead><tr><th>Rank</th><th>Fan</th><th>Team</th><th>Events</th><th>Games</th><th>Score</th><th>Last Active</th></tr></thead>
      <tbody>
        ${sorted.map((f, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${f.name}</strong></td>
            <td>${f.favoriteTeam}</td>
            <td>${f.totalEvents}</td>
            <td>${f.gamesAttended}</td>
            <td><span class="score-badge">${f.engagementScore}</span></td>
            <td>${f.lastEngagement}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function fetchData() {
  try {
    const result = await app.callServerTool({ name: "GetFanEngagementMetrics", arguments: {} });
    const text = result.content!.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("");
    const data = JSON.parse(text);
    lookbackLabel.textContent = `Last ${data.lookbackDays} days`;
    renderChart(data.fans);
    renderFanList(data.fans);
  } catch (e) {
    console.error("Failed to fetch engagement metrics:", e);
  }
}

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.onhostcontextchanged = handleHostContext;
applyDocumentTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
app.connect().then(() => { const ctx = app.getHostContext(); if (ctx) handleHostContext(ctx); });
setTimeout(fetchData, 100);
