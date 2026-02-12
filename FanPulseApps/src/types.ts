// Shared types used by both server-side tools and client-side UIs

export interface Fan {
  fanId: string;
  firstName: string;
  lastName: string;
  email: string;
  favoriteTeam: string;
  favoritePlayers: string;
  joinDate: string;
  city: string;
  state: string;
}

export interface EngagementEvent {
  eventId: string;
  fanId: string;
  eventType: string;
  eventDate: string;
  details: string;
}

export interface MerchProduct {
  productId: string;
  name: string;
  category: string;
  team: string;
  player: string;
  price: number;
  inStock: boolean;
}

export interface Purchase {
  purchaseId: string;
  fanId: string;
  productId: string;
  purchaseDate: string;
  quantity: number;
  totalPrice: number;
}

export interface FanSegmentEntry {
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

export interface SegmentGroup {
  segment: string;
  description: string;
  count: number;
  fans: FanSegmentEntry[];
}

export interface EngagementMetric {
  fanId: string;
  name: string;
  favoriteTeam: string;
  totalEvents: number;
  eventTypes: number;
  gamesAttended: number;
  lastEngagement: string;
  engagementScore: number;
}

export interface Recommendation {
  product: MerchProduct;
  relevanceScore: number;
  reason: string;
}

export const SEGMENT_NAMES = [
  "superfans",
  "engaged_no_purchase",
  "buyers_low_engagement",
  "casual_fans",
  "dormant_fans",
] as const;

export type SegmentName = (typeof SEGMENT_NAMES)[number];

export const SEGMENT_DESCRIPTIONS: Record<SegmentName, string> = {
  superfans:
    "Highly engaged fans who also make purchases — your most valuable supporters",
  engaged_no_purchase:
    "Fans with strong engagement (3+ interactions) but no purchases — prime conversion targets",
  buyers_low_engagement:
    "Fans who have made purchases but show low engagement — re-engagement opportunity",
  casual_fans:
    "Fans with some engagement but no purchases — need nurturing",
  dormant_fans:
    "Fans with no or very little engagement — at risk of churn",
};

export const SEGMENT_COLORS: Record<SegmentName, string> = {
  superfans: "#059669",
  engaged_no_purchase: "#6366f1",
  buyers_low_engagement: "#f59e0b",
  casual_fans: "#0d9488",
  dormant_fans: "#ef4444",
};

export const EVENT_TYPES = [
  "game_attendance",
  "app_open",
  "social_share",
  "content_view",
] as const;

export const MERCH_CATEGORIES = [
  "Jersey",
  "Hat",
  "Accessory",
  "Drinkware",
  "Apparel",
  "Equipment",
  "Collectible",
] as const;
