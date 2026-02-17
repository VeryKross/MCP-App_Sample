import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Resolve the shared fanpulse.db — walk up from the compiled output (dist/src/data/)
// to find the repo root, then look in FanPulse/ for the database.
function findDbPath(): string {
  if (process.env.FANPULSE_DB) return process.env.FANPULSE_DB;

  // Walk up directories from the current file looking for the FanPulse/ sibling
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "FanPulse", "fanpulse.db");
    if (fs.existsSync(candidate)) return candidate;
    // Also check for fanpulse.db directly in this directory (repo root)
    const rootCandidate = path.join(dir, "fanpulse.db");
    if (fs.existsSync(rootCandidate)) return rootCandidate;
    dir = path.dirname(dir);
  }

  // Fallback: assume cwd is repo root
  return path.resolve("fanpulse.db");
}

const DB_PATH = findDbPath();

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");
  }
  return db;
}

// ── Fan Queries ──

export function getFanByIdOrEmail(identifier: string) {
  const row = getDb()
    .prepare(
      `SELECT FanId, FirstName, LastName, Email, FavoriteTeam, FavoritePlayers, JoinDate, City, State
       FROM Fans WHERE FanId = ? OR Email = ?`
    )
    .get(identifier, identifier) as Record<string, string> | undefined;
  return row
    ? {
        fanId: row.FanId,
        firstName: row.FirstName,
        lastName: row.LastName,
        email: row.Email,
        favoriteTeam: row.FavoriteTeam,
        favoritePlayers: row.FavoritePlayers,
        joinDate: row.JoinDate,
        city: row.City,
        state: row.State,
      }
    : null;
}

export function getRecentEngagements(fanId: string, limit = 10) {
  return getDb()
    .prepare(
      `SELECT EventType as type, EventDate as date, Details as details
       FROM EngagementEvents WHERE FanId = ? ORDER BY EventDate DESC LIMIT ?`
    )
    .all(fanId, limit) as { type: string; date: string; details: string }[];
}

export function getPurchaseHistory(fanId: string) {
  return getDb()
    .prepare(
      `SELECT p.PurchaseDate as date, m.Name as product, m.Category as category,
              p.Quantity as quantity, p.TotalPrice as totalPrice
       FROM Purchases p JOIN Merchandise m ON p.ProductId = m.ProductId
       WHERE p.FanId = ? ORDER BY p.PurchaseDate DESC`
    )
    .all(fanId) as {
    date: string;
    product: string;
    category: string;
    quantity: number;
    totalPrice: number;
  }[];
}

export function getEngagementSummary(fanId: string, cutoffDate?: string) {
  const cutoff =
    cutoffDate ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) as totalEvents,
         SUM(CASE WHEN EventType = 'game_attendance' THEN 1 ELSE 0 END) as gamesAttended,
         SUM(CASE WHEN EventType = 'app_open' THEN 1 ELSE 0 END) as appOpens,
         SUM(CASE WHEN EventType = 'social_share' THEN 1 ELSE 0 END) as socialShares,
         SUM(CASE WHEN EventType = 'content_view' THEN 1 ELSE 0 END) as contentViews,
         MIN(EventDate) as firstEvent,
         MAX(EventDate) as lastEvent
       FROM EngagementEvents WHERE FanId = ? AND EventDate >= ?`
    )
    .get(fanId, cutoff) as Record<string, number | string | null>;

  const games = (row.gamesAttended as number) ?? 0;
  const total = (row.totalEvents as number) ?? 0;
  return {
    totalEvents: total,
    gamesAttended: games,
    appOpens: (row.appOpens as number) ?? 0,
    socialShares: (row.socialShares as number) ?? 0,
    contentViews: (row.contentViews as number) ?? 0,
    firstEvent: row.firstEvent ?? "none",
    lastEvent: row.lastEvent ?? "none",
    engagementLevel:
      games >= 4 ? "superfan" : games >= 2 ? "regular" : total > 0 ? "casual" : "dormant",
  };
}

// ── Engagement Metrics ──

export function getAllFanMetrics(cutoffDate: string) {
  return getDb()
    .prepare(
      `SELECT f.FanId as fanId, f.FirstName || ' ' || f.LastName as name, f.FavoriteTeam as favoriteTeam,
              COUNT(e.EventId) as totalEvents,
              COUNT(DISTINCT e.EventType) as eventTypes,
              SUM(CASE WHEN e.EventType = 'game_attendance' THEN 1 ELSE 0 END) as gamesAttended,
              MAX(e.EventDate) as lastEngagement
       FROM Fans f
       LEFT JOIN EngagementEvents e ON f.FanId = e.FanId AND e.EventDate >= ?
       GROUP BY f.FanId
       ORDER BY totalEvents DESC`
    )
    .all(cutoffDate) as {
    fanId: string;
    name: string;
    favoriteTeam: string;
    totalEvents: number;
    eventTypes: number;
    gamesAttended: number;
    lastEngagement: string | null;
  }[];
}

// ── Merchandise ──

export function searchMerchandise(filters: {
  team?: string;
  category?: string;
  player?: string;
  maxPrice?: number;
  inStockOnly?: boolean;
}) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.team) {
    conditions.push("Team LIKE ?");
    params.push(`%${filters.team}%`);
  }
  if (filters.category) {
    conditions.push("Category LIKE ?");
    params.push(`%${filters.category}%`);
  }
  if (filters.player) {
    conditions.push("Player LIKE ?");
    params.push(`%${filters.player}%`);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push("Price <= ?");
    params.push(filters.maxPrice);
  }
  if (filters.inStockOnly !== false) {
    conditions.push("InStock = 1");
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return getDb()
    .prepare(
      `SELECT ProductId as productId, Name as name, Category as category,
              Team as team, Player as player, Price as price, InStock as inStock
       FROM Merchandise ${where} ORDER BY Category, Price`
    )
    .all(...params) as {
    productId: string;
    name: string;
    category: string;
    team: string;
    player: string;
    price: number;
    inStock: number;
  }[];
}

// ── Segments ──

export function getFanSegmentData(team?: string) {
  const teamFilter = team ? "AND f.FavoriteTeam LIKE '%' || ? || '%'" : "";
  const params = team ? [team] : [];

  return getDb()
    .prepare(
      `SELECT f.FanId as fanId, f.FirstName || ' ' || f.LastName as name,
              f.Email as email, f.FavoriteTeam as favoriteTeam,
              COUNT(DISTINCT e.EventId) as engagementCount,
              SUM(CASE WHEN e.EventType = 'game_attendance' THEN 1 ELSE 0 END) as gamesAttended,
              COUNT(DISTINCT p.PurchaseId) as purchaseCount,
              COALESCE(SUM(p.TotalPrice), 0) as totalSpent,
              MAX(e.EventDate) as lastEngagement
       FROM Fans f
       LEFT JOIN EngagementEvents e ON f.FanId = e.FanId
       LEFT JOIN Purchases p ON f.FanId = p.FanId
       WHERE 1=1 ${teamFilter}
       GROUP BY f.FanId`
    )
    .all(...params) as {
    fanId: string;
    name: string;
    email: string;
    favoriteTeam: string;
    engagementCount: number;
    gamesAttended: number;
    purchaseCount: number;
    totalSpent: number;
    lastEngagement: string | null;
  }[];
}

// ── Recommendations ──

export function getFanForRecommendation(fanId: string) {
  return getDb()
    .prepare("SELECT FavoriteTeam, FavoritePlayers FROM Fans WHERE FanId = ?")
    .get(fanId) as { FavoriteTeam: string; FavoritePlayers: string } | undefined;
}

export function getPurchasedProductIds(fanId: string): Set<string> {
  const rows = getDb()
    .prepare("SELECT DISTINCT ProductId FROM Purchases WHERE FanId = ?")
    .all(fanId) as { ProductId: string }[];
  return new Set(rows.map((r) => r.ProductId));
}

export function getFanEngagementCounts(fanId: string) {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN EventType = 'game_attendance' THEN 1 ELSE 0 END) as games
       FROM EngagementEvents WHERE FanId = ?`
    )
    .get(fanId) as { total: number; games: number };
  return row;
}

export function getAllInStockMerchandise() {
  return getDb()
    .prepare(
      `SELECT ProductId as productId, Name as name, Category as category,
              Team as team, Player as player, Price as price, InStock as inStock
       FROM Merchandise WHERE InStock = 1`
    )
    .all() as {
    productId: string;
    name: string;
    category: string;
    team: string;
    player: string;
    price: number;
    inStock: number;
  }[];
}

// ── Promotions ──

export function insertPromotion(promo: {
  promotionId: string;
  name: string;
  description: string;
  discountPercent: number;
  targetSegment: string;
  productCategory: string;
  startDate: string;
  endDate: string;
  createdDate: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO Promotions (PromotionId, Name, Description, DiscountPercent, TargetSegment, ProductCategory, StartDate, EndDate, CreatedDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      promo.promotionId,
      promo.name,
      promo.description,
      promo.discountPercent,
      promo.targetSegment,
      promo.productCategory,
      promo.startDate,
      promo.endDate,
      promo.createdDate
    );
}

export function countTargetFans(segment: string): number {
  const db = getDb();
  try {
    switch (segment) {
      case "high_engagement": {
        const rows = db
          .prepare(
            `SELECT COUNT(DISTINCT f.FanId) as cnt FROM Fans f
             JOIN EngagementEvents e ON f.FanId = e.FanId
             GROUP BY f.FanId HAVING COUNT(e.EventId) >= 4`
          )
          .all() as { cnt: number }[];
        return rows.length;
      }
      case "low_engagement": {
        const row = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM Fans f WHERE (
               SELECT COUNT(*) FROM EngagementEvents e WHERE e.FanId = f.FanId
             ) < 3`
          )
          .get() as { cnt: number };
        return row.cnt;
      }
      case "no_purchases": {
        const row = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM Fans f WHERE f.FanId NOT IN (
               SELECT DISTINCT FanId FROM Purchases
             )`
          )
          .get() as { cnt: number };
        return row.cnt;
      }
      default: {
        const row = db.prepare("SELECT COUNT(*) as cnt FROM Fans").get() as {
          cnt: number;
        };
        return row.cnt;
      }
    }
  } catch {
    return 0;
  }
}

// ── Engagement Event Logging ──

export function fanExists(fanId: string): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as cnt FROM Fans WHERE FanId = ?")
    .get(fanId) as { cnt: number };
  return row.cnt > 0;
}

export function insertEngagementEvent(event: {
  eventId: string;
  fanId: string;
  eventType: string;
  eventDate: string;
  details: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO EngagementEvents (EventId, FanId, EventType, EventDate, Details)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(event.eventId, event.fanId, event.eventType, event.eventDate, event.details);
}
