import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import "../global.css";
import "./styles.css";

interface Product {
  productId: string;
  name: string;
  category: string;
  team: string;
  player: string;
  price: number;
  inStock: boolean;
}

const teamSelect = document.getElementById("filter-team") as HTMLSelectElement;
const categorySelect = document.getElementById("filter-category") as HTMLSelectElement;
const sortSelect = document.getElementById("sort") as HTMLSelectElement;
const productGrid = document.getElementById("product-grid")!;
const resultsInfo = document.getElementById("results-info")!;

let allProducts: Product[] = [];
const app = new App({ name: "Merch Search", version: "1.0.0" });

const CATEGORY_ICONS: Record<string, string> = {
  Jersey: "👕", Hat: "🧢", Accessory: "🧣", Drinkware: "☕",
  Apparel: "🧥", Equipment: "⚽", Collectible: "🏆",
};

function renderProducts(products: Product[]) {
  resultsInfo.textContent = `${products.length} product${products.length !== 1 ? "s" : ""} found`;

  productGrid.innerHTML = products
    .map(
      (p) => `
    <div class="product-card ${!p.inStock ? "out-of-stock" : ""}">
      <div class="product-icon">${CATEGORY_ICONS[p.category] ?? "📦"}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-meta">${p.team} · ${p.category}${p.player ? ` · ${p.player}` : ""}</div>
      <div class="product-price">$${p.price.toFixed(2)}</div>
      ${!p.inStock ? '<div class="product-badge">Out of Stock</div>' : ""}
    </div>`
    )
    .join("");
}

function applyFilters() {
  let filtered = [...allProducts];
  const teamVal = teamSelect.value;
  const catVal = categorySelect.value;
  if (teamVal) filtered = filtered.filter((p) => p.team === teamVal);
  if (catVal) filtered = filtered.filter((p) => p.category === catVal);

  const sortVal = sortSelect.value;
  if (sortVal === "price-asc") filtered.sort((a, b) => a.price - b.price);
  else if (sortVal === "price-desc") filtered.sort((a, b) => b.price - a.price);
  else if (sortVal === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));

  renderProducts(filtered);
}

function populateFilters(products: Product[]) {
  const teams = [...new Set(products.map((p) => p.team))].sort();
  const categories = [...new Set(products.map((p) => p.category))].sort();

  teams.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    teamSelect.appendChild(opt);
  });
  categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    categorySelect.appendChild(opt);
  });
}

async function fetchData() {
  try {
    const result = await app.callServerTool({ name: "SearchMerchandise", arguments: { inStockOnly: false } });
    const text = result.content!.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("");
    const data = JSON.parse(text);
    allProducts = data.products;
    populateFilters(allProducts);
    applyFilters();
  } catch (e) {
    console.error("Failed to fetch merchandise:", e);
  }
}

teamSelect.addEventListener("change", applyFilters);
categorySelect.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.onhostcontextchanged = handleHostContext;
applyDocumentTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
app.connect().then(() => { const ctx = app.getHostContext(); if (ctx) handleHostContext(ctx); });
setTimeout(fetchData, 100);
