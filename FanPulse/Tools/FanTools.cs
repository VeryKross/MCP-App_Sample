using System.ComponentModel;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using ModelContextProtocol.Server;
using FanPulse.Data;

namespace FanPulse.Tools;

[McpServerToolType]
public class FanTools
{
    [McpServerTool, Description("Get a fan's profile including their favorite team, players, attendance history, and purchase history.")]
    public static string GetFanProfile(
        [Description("The fan ID (e.g. 'fan-001') or email address to look up")] string fanIdentifier)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        // Find the fan by ID or email
        using var fanCmd = connection.CreateCommand();
        fanCmd.CommandText = """
            SELECT FanId, FirstName, LastName, Email, FavoriteTeam, FavoritePlayers, JoinDate, City, State
            FROM Fans WHERE FanId = $id OR Email = $id
            """;
        fanCmd.Parameters.AddWithValue("$id", fanIdentifier);

        using var reader = fanCmd.ExecuteReader();
        if (!reader.Read())
            return JsonSerializer.Serialize(new { error = "Fan not found", identifier = fanIdentifier });

        var fanId = reader.GetString(0);
        var profile = new
        {
            fanId,
            firstName = reader.GetString(1),
            lastName = reader.GetString(2),
            email = reader.GetString(3),
            favoriteTeam = reader.GetString(4),
            favoritePlayers = reader.GetString(5),
            joinDate = reader.GetString(6),
            city = reader.GetString(7),
            state = reader.GetString(8),
            recentEngagements = GetRecentEngagements(connection, fanId, 10),
            purchaseHistory = GetPurchaseHistory(connection, fanId),
            engagementSummary = GetEngagementSummary(connection, fanId)
        };

        return JsonSerializer.Serialize(profile, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool, Description("Record a fan engagement event such as game attendance, app usage, social media interaction, or content viewing.")]
    public static string LogEngagementEvent(
        [Description("The fan ID (e.g. 'fan-001')")] string fanId,
        [Description("Type of engagement: game_attendance, app_open, social_share, content_view")] string eventType,
        [Description("Additional details about the event")] string details,
        [Description("Date of the event in YYYY-MM-DD format (defaults to today)")] string? eventDate = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        // Verify fan exists
        using var checkCmd = connection.CreateCommand();
        checkCmd.CommandText = "SELECT COUNT(*) FROM Fans WHERE FanId = $id";
        checkCmd.Parameters.AddWithValue("$id", fanId);
        if ((long)checkCmd.ExecuteScalar()! == 0)
            return JsonSerializer.Serialize(new { error = "Fan not found", fanId });

        var eventId = $"evt-{Guid.NewGuid():N}"[..11];
        var date = eventDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd");

        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            INSERT INTO EngagementEvents (EventId, FanId, EventType, EventDate, Details)
            VALUES ($eventId, $fanId, $eventType, $date, $details)
            """;
        cmd.Parameters.AddWithValue("$eventId", eventId);
        cmd.Parameters.AddWithValue("$fanId", fanId);
        cmd.Parameters.AddWithValue("$eventType", eventType);
        cmd.Parameters.AddWithValue("$date", date);
        cmd.Parameters.AddWithValue("$details", details);
        cmd.ExecuteNonQuery();

        return JsonSerializer.Serialize(new { success = true, eventId, fanId, eventType, eventDate = date, details });
    }

    [McpServerTool, Description("Get engagement metrics and scores for a specific fan or all fans. Returns engagement frequency, recency, and an overall score.")]
    public static string GetFanEngagementMetrics(
        [Description("Optional fan ID to get metrics for a specific fan. If omitted, returns top engaged fans.")] string? fanId = null,
        [Description("Number of days to look back for engagement data. Use this to override the default 90-day window, e.g. 365 for a full year.")] int? lookbackDays = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        var effectiveLookbackDays = lookbackDays ?? 90;
        var cutoffDate = DateTime.UtcNow.AddDays(-effectiveLookbackDays).ToString("yyyy-MM-dd");

        if (fanId != null)
        {
            var metrics = GetEngagementSummary(connection, fanId, cutoffDate);
            return JsonSerializer.Serialize(new { fanId, lookbackDays = effectiveLookbackDays, metrics }, new JsonSerializerOptions { WriteIndented = true });
        }

        // Return all fans ranked by engagement
        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT f.FanId, f.FirstName, f.LastName, f.FavoriteTeam,
                   COUNT(e.EventId) as TotalEvents,
                   COUNT(DISTINCT e.EventType) as EventTypes,
                   SUM(CASE WHEN e.EventType = 'game_attendance' THEN 1 ELSE 0 END) as GamesAttended,
                   MAX(e.EventDate) as LastEngagement
            FROM Fans f
            LEFT JOIN EngagementEvents e ON f.FanId = e.FanId AND e.EventDate >= $cutoff
            GROUP BY f.FanId
            ORDER BY TotalEvents DESC
            """;
        cmd.Parameters.AddWithValue("$cutoff", cutoffDate);

        var fans = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var totalEvents = reader.GetInt32(4);
            var gamesAttended = reader.GetInt32(6);
            // Simple engagement score: events * diversity + games bonus
            var score = totalEvents * reader.GetInt32(5) + gamesAttended * 2;

            fans.Add(new
            {
                fanId = reader.GetString(0),
                name = $"{reader.GetString(1)} {reader.GetString(2)}",
                favoriteTeam = reader.GetString(3),
                totalEvents,
                eventTypes = reader.GetInt32(5),
                gamesAttended,
                lastEngagement = reader.IsDBNull(7) ? "none" : reader.GetString(7),
                engagementScore = score
            });
        }

        return JsonSerializer.Serialize(new { lookbackDays = effectiveLookbackDays, fans }, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool, Description("Search the merchandise catalog with optional filters for team, category, player, and price range.")]
    public static string SearchMerchandise(
        [Description("Filter by team name (e.g. 'Thunderbolts')")] string? team = null,
        [Description("Filter by category (e.g. 'Jersey', 'Hat', 'Accessory', 'Drinkware', 'Apparel', 'Equipment', 'Collectible')")] string? category = null,
        [Description("Filter by player name")] string? player = null,
        [Description("Maximum price filter")] double? maxPrice = null,
        [Description("Only show in-stock items (default: true)")] bool? inStockOnly = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        var conditions = new List<string>();
        var parameters = new Dictionary<string, object>();

        if (team != null) { conditions.Add("Team LIKE $team"); parameters["$team"] = $"%{team}%"; }
        if (category != null) { conditions.Add("Category LIKE $category"); parameters["$category"] = $"%{category}%"; }
        if (player != null) { conditions.Add("Player LIKE $player"); parameters["$player"] = $"%{player}%"; }
        if (maxPrice.HasValue) { conditions.Add("Price <= $maxPrice"); parameters["$maxPrice"] = maxPrice.Value; }
        if (inStockOnly != false) { conditions.Add("InStock = 1"); }

        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT ProductId, Name, Category, Team, Player, Price, InStock FROM Merchandise {where} ORDER BY Category, Price";
        foreach (var p in parameters)
            cmd.Parameters.AddWithValue(p.Key, p.Value);

        var products = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            products.Add(new
            {
                productId = reader.GetString(0),
                name = reader.GetString(1),
                category = reader.GetString(2),
                team = reader.GetString(3),
                player = reader.GetString(4),
                price = reader.GetDouble(5),
                inStock = reader.GetInt32(6) == 1
            });
        }

        return JsonSerializer.Serialize(new { resultCount = products.Count, products }, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool, Description("Get personalized merchandise recommendations for a fan based on their profile, engagement history, and purchase patterns.")]
    public static string GetMerchRecommendations(
        [Description("The fan ID to generate recommendations for")] string fanId,
        [Description("Maximum number of recommendations to return (default: 5)")] int? maxResults = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        var limit = maxResults ?? 5;

        // Get fan profile
        using var fanCmd = connection.CreateCommand();
        fanCmd.CommandText = "SELECT FavoriteTeam, FavoritePlayers FROM Fans WHERE FanId = $id";
        fanCmd.Parameters.AddWithValue("$id", fanId);
        using var fanReader = fanCmd.ExecuteReader();
        if (!fanReader.Read())
            return JsonSerializer.Serialize(new { error = "Fan not found", fanId });

        var favoriteTeam = fanReader.GetString(0);
        var favoritePlayers = fanReader.GetString(1);
        fanReader.Close();

        // Get already purchased product IDs
        using var purchCmd = connection.CreateCommand();
        purchCmd.CommandText = "SELECT DISTINCT ProductId FROM Purchases WHERE FanId = $id";
        purchCmd.Parameters.AddWithValue("$id", fanId);
        var purchased = new HashSet<string>();
        using var purchReader = purchCmd.ExecuteReader();
        while (purchReader.Read())
            purchased.Add(purchReader.GetString(0));
        purchReader.Close();

        // Get engagement level
        using var engCmd = connection.CreateCommand();
        engCmd.CommandText = """
            SELECT COUNT(*) as Total,
                   SUM(CASE WHEN EventType = 'game_attendance' THEN 1 ELSE 0 END) as Games
            FROM EngagementEvents WHERE FanId = $id
            """;
        engCmd.Parameters.AddWithValue("$id", fanId);
        using var engReader = engCmd.ExecuteReader();
        engReader.Read();
        var totalEngagements = engReader.GetInt32(0);
        var gamesAttended = engReader.GetInt32(1);
        engReader.Close();

        // Score and rank merchandise
        using var merchCmd = connection.CreateCommand();
        merchCmd.CommandText = "SELECT ProductId, Name, Category, Team, Player, Price, InStock FROM Merchandise WHERE InStock = 1";
        var recommendations = new List<(int score, string reason, object product)>();

        using var merchReader = merchCmd.ExecuteReader();
        while (merchReader.Read())
        {
            var productId = merchReader.GetString(0);
            if (purchased.Contains(productId)) continue;

            var prodTeam = merchReader.GetString(3);
            var prodPlayer = merchReader.GetString(4);
            var price = merchReader.GetDouble(5);

            int score = 0;
            var reasons = new List<string>();

            // Team match
            if (prodTeam.Equals(favoriteTeam, StringComparison.OrdinalIgnoreCase))
            {
                score += 10;
                reasons.Add("Matches favorite team");
            }

            // Player match
            if (!string.IsNullOrEmpty(prodPlayer) && favoritePlayers.Contains(prodPlayer, StringComparison.OrdinalIgnoreCase))
            {
                score += 15;
                reasons.Add($"Features favorite player: {prodPlayer}");
            }

            // High engagement fans get premium suggestions
            if (gamesAttended >= 3 && price > 50) { score += 5; reasons.Add("Premium pick for dedicated fan"); }
            // Low engagement fans get affordable entry points
            if (totalEngagements < 3 && price < 30) { score += 5; reasons.Add("Great entry-level item"); }

            if (score > 0)
            {
                recommendations.Add((score, string.Join("; ", reasons), new
                {
                    productId,
                    name = merchReader.GetString(1),
                    category = merchReader.GetString(2),
                    team = prodTeam,
                    player = prodPlayer,
                    price
                }));
            }
        }

        var topRecs = recommendations
            .OrderByDescending(r => r.score)
            .Take(limit)
            .Select(r => new { r.product, relevanceScore = r.score, reason = r.reason })
            .ToList();

        return JsonSerializer.Serialize(new
        {
            fanId,
            favoriteTeam,
            favoritePlayers,
            engagementLevel = gamesAttended >= 4 ? "superfan" : gamesAttended >= 2 ? "regular" : "casual",
            recommendations = topRecs
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool, Description("Create a targeted promotion or discount offer for a specific fan segment and product category.")]
    public static string CreatePromotion(
        [Description("Name for the promotion")] string name,
        [Description("Description of the promotion")] string description,
        [Description("Discount percentage (e.g. 15 for 15% off)")] double discountPercent,
        [Description("Target fan segment: all, high_engagement, low_engagement, no_purchases, specific_team")] string targetSegment,
        [Description("Product category to apply promotion to (e.g. 'Jersey', 'Hat', or 'all')")] string productCategory,
        [Description("Start date in YYYY-MM-DD format (defaults to today)")] string? startDate = null,
        [Description("End date in YYYY-MM-DD format (defaults to 30 days from start)")] string? endDate = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        var promoId = $"promo-{Guid.NewGuid():N}"[..13];
        var start = startDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd");
        var end = endDate ?? DateTime.Parse(start).AddDays(30).ToString("yyyy-MM-dd");

        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            INSERT INTO Promotions (PromotionId, Name, Description, DiscountPercent, TargetSegment, ProductCategory, StartDate, EndDate, CreatedDate)
            VALUES ($id, $name, $desc, $discount, $segment, $category, $start, $end, $created)
            """;
        cmd.Parameters.AddWithValue("$id", promoId);
        cmd.Parameters.AddWithValue("$name", name);
        cmd.Parameters.AddWithValue("$desc", description);
        cmd.Parameters.AddWithValue("$discount", discountPercent);
        cmd.Parameters.AddWithValue("$segment", targetSegment);
        cmd.Parameters.AddWithValue("$category", productCategory);
        cmd.Parameters.AddWithValue("$start", start);
        cmd.Parameters.AddWithValue("$end", end);
        cmd.Parameters.AddWithValue("$created", DateTime.UtcNow.ToString("yyyy-MM-dd"));

        cmd.ExecuteNonQuery();

        // Calculate how many fans this would reach
        var targetCount = CountTargetFans(connection, targetSegment);

        return JsonSerializer.Serialize(new
        {
            success = true,
            promotionId = promoId,
            name,
            description,
            discountPercent,
            targetSegment,
            productCategory,
            startDate = start,
            endDate = end,
            estimatedReach = targetCount
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool, Description("Get fan segments based on engagement and purchase behavior. Returns groups like 'high-engagement no-purchase', 'loyal buyers', 'at-risk fans', etc.")]
    public static string GetFanSegments(
        [Description("Optional team filter")] string? team = null)
    {
        using var connection = new SqliteConnection(DatabaseInitializer.ConnectionString);
        connection.Open();

        var teamFilter = team != null ? "AND f.FavoriteTeam LIKE '%' || $team || '%'" : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT f.FanId, f.FirstName, f.LastName, f.Email, f.FavoriteTeam,
                   COUNT(DISTINCT e.EventId) as EngagementCount,
                   SUM(CASE WHEN e.EventType = 'game_attendance' THEN 1 ELSE 0 END) as GamesAttended,
                   COUNT(DISTINCT p.PurchaseId) as PurchaseCount,
                   COALESCE(SUM(p.TotalPrice), 0) as TotalSpent,
                   MAX(e.EventDate) as LastEngagement
            FROM Fans f
            LEFT JOIN EngagementEvents e ON f.FanId = e.FanId
            LEFT JOIN Purchases p ON f.FanId = p.FanId
            WHERE 1=1 {teamFilter}
            GROUP BY f.FanId
            """;

        if (team != null)
            cmd.Parameters.AddWithValue("$team", team);

        var segments = new Dictionary<string, List<object>>
        {
            ["superfans"] = [],           // High engagement + purchases
            ["engaged_no_purchase"] = [],  // High engagement, no purchases
            ["buyers_low_engagement"] = [],// Purchases but low engagement
            ["casual_fans"] = [],          // Some engagement, no purchases
            ["dormant_fans"] = [],         // No recent engagement
        };

        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var fan = new
            {
                fanId = reader.GetString(0),
                name = $"{reader.GetString(1)} {reader.GetString(2)}",
                email = reader.GetString(3),
                favoriteTeam = reader.GetString(4),
                engagementCount = reader.GetInt32(5),
                gamesAttended = reader.GetInt32(6),
                purchaseCount = reader.GetInt32(7),
                totalSpent = reader.GetDouble(8),
                lastEngagement = reader.IsDBNull(9) ? "never" : reader.GetString(9)
            };

            var engagements = fan.engagementCount;
            var purchases = fan.purchaseCount;
            var games = fan.gamesAttended;

            if (engagements >= 4 && purchases > 0)
                segments["superfans"].Add(fan);
            else if (engagements >= 3 && purchases == 0)
                segments["engaged_no_purchase"].Add(fan);
            else if (purchases > 0 && engagements < 3)
                segments["buyers_low_engagement"].Add(fan);
            else if (engagements >= 1 && engagements < 3)
                segments["casual_fans"].Add(fan);
            else
                segments["dormant_fans"].Add(fan);
        }

        var result = new
        {
            teamFilter = team ?? "all",
            segments = segments.Select(s => new
            {
                segment = s.Key,
                description = s.Key switch
                {
                    "superfans" => "Highly engaged fans who also make purchases — your most valuable supporters",
                    "engaged_no_purchase" => "Fans with strong engagement (3+ interactions) but no purchases — prime conversion targets",
                    "buyers_low_engagement" => "Fans who have made purchases but show low engagement — re-engagement opportunity",
                    "casual_fans" => "Fans with some engagement but no purchases — need nurturing",
                    "dormant_fans" => "Fans with no or very little engagement — at risk of churn",
                    _ => ""
                },
                count = s.Value.Count,
                fans = s.Value
            })
        };

        return JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
    }

    // Helper methods
    private static List<object> GetRecentEngagements(SqliteConnection connection, string fanId, int limit = 10)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT EventType, EventDate, Details FROM EngagementEvents WHERE FanId = $id ORDER BY EventDate DESC LIMIT $limit";
        cmd.Parameters.AddWithValue("$id", fanId);
        cmd.Parameters.AddWithValue("$limit", limit);

        var events = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            events.Add(new { type = reader.GetString(0), date = reader.GetString(1), details = reader.GetString(2) });
        return events;
    }

    private static List<object> GetPurchaseHistory(SqliteConnection connection, string fanId)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT p.PurchaseDate, m.Name, m.Category, p.Quantity, p.TotalPrice
            FROM Purchases p JOIN Merchandise m ON p.ProductId = m.ProductId
            WHERE p.FanId = $id ORDER BY p.PurchaseDate DESC
            """;
        cmd.Parameters.AddWithValue("$id", fanId);

        var purchases = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            purchases.Add(new
            {
                date = reader.GetString(0),
                product = reader.GetString(1),
                category = reader.GetString(2),
                quantity = reader.GetInt32(3),
                totalPrice = reader.GetDouble(4)
            });
        return purchases;
    }

    private static object GetEngagementSummary(SqliteConnection connection, string fanId, string? cutoffDate = null)
    {
        var cutoff = cutoffDate ?? DateTime.UtcNow.AddDays(-90).ToString("yyyy-MM-dd");

        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT 
                COUNT(*) as TotalEvents,
                SUM(CASE WHEN EventType = 'game_attendance' THEN 1 ELSE 0 END) as Games,
                SUM(CASE WHEN EventType = 'app_open' THEN 1 ELSE 0 END) as AppOpens,
                SUM(CASE WHEN EventType = 'social_share' THEN 1 ELSE 0 END) as SocialShares,
                SUM(CASE WHEN EventType = 'content_view' THEN 1 ELSE 0 END) as ContentViews,
                MIN(EventDate) as FirstEvent,
                MAX(EventDate) as LastEvent
            FROM EngagementEvents 
            WHERE FanId = $id AND EventDate >= $cutoff
            """;
        cmd.Parameters.AddWithValue("$id", fanId);
        cmd.Parameters.AddWithValue("$cutoff", cutoff);

        using var reader = cmd.ExecuteReader();
        reader.Read();
        var total = reader.GetInt32(0);
        var games = reader.GetInt32(1);

        return new
        {
            totalEvents = total,
            gamesAttended = games,
            appOpens = reader.GetInt32(2),
            socialShares = reader.GetInt32(3),
            contentViews = reader.GetInt32(4),
            firstEvent = reader.IsDBNull(5) ? "none" : reader.GetString(5),
            lastEvent = reader.IsDBNull(6) ? "none" : reader.GetString(6),
            engagementLevel = games >= 4 ? "superfan" : games >= 2 ? "regular" : total > 0 ? "casual" : "dormant"
        };
    }

    private static int CountTargetFans(SqliteConnection connection, string segment)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = segment switch
        {
            "high_engagement" => """
                SELECT COUNT(DISTINCT f.FanId) FROM Fans f
                JOIN EngagementEvents e ON f.FanId = e.FanId
                GROUP BY f.FanId HAVING COUNT(e.EventId) >= 4
                """,
            "low_engagement" => """
                SELECT COUNT(*) FROM Fans f WHERE (
                    SELECT COUNT(*) FROM EngagementEvents e WHERE e.FanId = f.FanId
                ) < 3
                """,
            "no_purchases" => """
                SELECT COUNT(*) FROM Fans f WHERE f.FanId NOT IN (
                    SELECT DISTINCT FanId FROM Purchases
                )
                """,
            _ => "SELECT COUNT(*) FROM Fans"
        };

        try
        {
            var result = cmd.ExecuteScalar();
            return result != null ? Convert.ToInt32(result) : 0;
        }
        catch
        {
            return 0;
        }
    }
}
