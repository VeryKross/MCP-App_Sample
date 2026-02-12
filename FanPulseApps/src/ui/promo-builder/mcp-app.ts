import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import "../global.css";
import "./styles.css";

const form = document.getElementById("promo-form") as HTMLFormElement;
const discountSlider = document.getElementById("promo-discount") as HTMLInputElement;
const discountValue = document.getElementById("discount-value")!;
const resultPanel = document.getElementById("result-panel")!;
const startInput = document.getElementById("promo-start") as HTMLInputElement;
const endInput = document.getElementById("promo-end") as HTMLInputElement;

const app = new App({ name: "Promo Builder", version: "1.0.0" });

// Set default dates
const today = new Date().toISOString().slice(0, 10);
const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
startInput.value = today;
endInput.value = thirtyDaysLater;

discountSlider.addEventListener("input", () => {
  discountValue.textContent = `${discountSlider.value}%`;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = (document.getElementById("promo-name") as HTMLInputElement).value;
  const description = (document.getElementById("promo-desc") as HTMLTextAreaElement).value;
  const discountPercent = parseInt(discountSlider.value);
  const targetSegment = (document.getElementById("promo-segment") as HTMLSelectElement).value;
  const productCategory = (document.getElementById("promo-category") as HTMLSelectElement).value;
  const startDate = startInput.value;
  const endDate = endInput.value;

  resultPanel.innerHTML = '<p class="loading">Creating promotion...</p>';

  try {
    const result = await app.callServerTool({
      name: "CreatePromotion",
      arguments: { name, description, discountPercent, targetSegment, productCategory, startDate, endDate },
    });

    const text = result.content!
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const data = JSON.parse(text);

    if (data.success) {
      resultPanel.innerHTML = `
        <div class="success-card">
          <div class="success-icon">✅</div>
          <div class="success-body">
            <div class="success-title">Promotion Created!</div>
            <div class="success-detail"><strong>${data.name}</strong> — ${data.discountPercent}% off ${data.productCategory}</div>
            <div class="success-detail">Target: ${data.targetSegment} · Reach: ${data.estimatedReach} fans</div>
            <div class="success-detail">Valid: ${data.startDate} → ${data.endDate}</div>
            <div class="success-id">ID: ${data.promotionId}</div>
          </div>
        </div>`;
    } else {
      resultPanel.innerHTML = `<p class="error">Error: ${data.error ?? "Unknown error"}</p>`;
    }
  } catch (err) {
    resultPanel.innerHTML = `<p class="error">Failed to create promotion: ${err}</p>`;
  }
});

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.onhostcontextchanged = handleHostContext;
applyDocumentTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
app.connect().then(() => { const ctx = app.getHostContext(); if (ctx) handleHostContext(ctx); });
