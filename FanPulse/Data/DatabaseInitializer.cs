using Microsoft.Data.Sqlite;

namespace FanPulse.Data;

public static class DatabaseInitializer
{
    public const string ConnectionString = "Data Source=fanpulse.db";

    public static void Initialize()
    {
        using var connection = new SqliteConnection(ConnectionString);
        connection.Open();

        CreateSchema(connection);
        SeedData(connection);
    }

    private static void CreateSchema(SqliteConnection connection)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS Fans (
                FanId TEXT PRIMARY KEY,
                FirstName TEXT NOT NULL,
                LastName TEXT NOT NULL,
                Email TEXT NOT NULL,
                FavoriteTeam TEXT,
                FavoritePlayers TEXT,
                JoinDate TEXT NOT NULL,
                City TEXT,
                State TEXT
            );

            CREATE TABLE IF NOT EXISTS EngagementEvents (
                EventId TEXT PRIMARY KEY,
                FanId TEXT NOT NULL,
                EventType TEXT NOT NULL,
                EventDate TEXT NOT NULL,
                Details TEXT,
                FOREIGN KEY (FanId) REFERENCES Fans(FanId)
            );

            CREATE TABLE IF NOT EXISTS Merchandise (
                ProductId TEXT PRIMARY KEY,
                Name TEXT NOT NULL,
                Category TEXT NOT NULL,
                Team TEXT,
                Player TEXT,
                Price REAL NOT NULL,
                ImageUrl TEXT,
                InStock INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS Purchases (
                PurchaseId TEXT PRIMARY KEY,
                FanId TEXT NOT NULL,
                ProductId TEXT NOT NULL,
                PurchaseDate TEXT NOT NULL,
                Quantity INTEGER NOT NULL DEFAULT 1,
                TotalPrice REAL NOT NULL,
                FOREIGN KEY (FanId) REFERENCES Fans(FanId),
                FOREIGN KEY (ProductId) REFERENCES Merchandise(ProductId)
            );

            CREATE TABLE IF NOT EXISTS Promotions (
                PromotionId TEXT PRIMARY KEY,
                Name TEXT NOT NULL,
                Description TEXT,
                DiscountPercent REAL,
                TargetSegment TEXT,
                ProductCategory TEXT,
                StartDate TEXT NOT NULL,
                EndDate TEXT NOT NULL,
                CreatedDate TEXT NOT NULL
            );
            """;

        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private static void SeedData(SqliteConnection connection)
    {
        // Only seed if the Fans table is empty
        using var checkCmd = connection.CreateCommand();
        checkCmd.CommandText = "SELECT COUNT(*) FROM Fans";
        var count = (long)checkCmd.ExecuteScalar()!;
        if (count > 0) return;

        var fans = new[]
        {
            ("fan-001", "Maria", "Rodriguez", "maria.r@email.com", "Apex Racing", "Jake Torrence, Anika Patel", "2023-03-15", "Denver", "CO"),
            ("fan-002", "James", "O'Brien", "jobrien@email.com", "Apex Racing", "Jake Torrence", "2022-11-01", "Boulder", "CO"),
            ("fan-003", "Priya", "Sharma", "priya.s@email.com", "Pacific Drift", "Carlos Vega, Mei Lin", "2024-01-20", "Portland", "OR"),
            ("fan-004", "Tyler", "Washington", "twash@email.com", "Apex Racing", "Anika Patel", "2021-06-10", "Aurora", "CO"),
            ("fan-005", "Sarah", "Kim", "skim@email.com", "Pacific Drift", "Mei Lin", "2023-08-05", "Seattle", "WA"),
            ("fan-006", "Marcus", "Johnson", "mjohnson@email.com", "Apex Racing", "Jake Torrence, Diego Ruiz", "2022-02-14", "Denver", "CO"),
            ("fan-007", "Elena", "Petrov", "epetrov@email.com", "Alpine Velocity", "Liam Chen", "2024-05-01", "Aspen", "CO"),
            ("fan-008", "David", "Nakamura", "dnakamura@email.com", "Pacific Drift", "Carlos Vega", "2023-11-12", "Eugene", "OR"),
            ("fan-009", "Aisha", "Hassan", "ahassan@email.com", "Apex Racing", "Jake Torrence, Anika Patel", "2022-09-22", "Lakewood", "CO"),
            ("fan-010", "Chris", "Anderson", "canderson@email.com", "Alpine Velocity", "Liam Chen, Sofia Torres", "2023-06-18", "Fort Collins", "CO"),
            ("fan-011", "Jessica", "Lee", "jlee@email.com", "Apex Racing", "Diego Ruiz", "2024-02-28", "Denver", "CO"),
            ("fan-012", "Robert", "Garcia", "rgarcia@email.com", "Pacific Drift", "Mei Lin, Carlos Vega", "2021-12-03", "Bend", "OR"),
        };

        foreach (var (id, first, last, email, team, players, joined, city, state) in fans)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                INSERT INTO Fans (FanId, FirstName, LastName, Email, FavoriteTeam, FavoritePlayers, JoinDate, City, State)
                VALUES ($id, $first, $last, $email, $team, $players, $joined, $city, $state)
                """;
            cmd.Parameters.AddWithValue("$id", id);
            cmd.Parameters.AddWithValue("$first", first);
            cmd.Parameters.AddWithValue("$last", last);
            cmd.Parameters.AddWithValue("$email", email);
            cmd.Parameters.AddWithValue("$team", team);
            cmd.Parameters.AddWithValue("$players", players);
            cmd.Parameters.AddWithValue("$joined", joined);
            cmd.Parameters.AddWithValue("$city", city);
            cmd.Parameters.AddWithValue("$state", state);
            cmd.ExecuteNonQuery();
        }

        // Seed engagement events
        var events = new[]
        {
            ("evt-001", "fan-001", "game_attendance", "2025-10-15", "Colorado Grand Prix at Denver Speedway - Apex Racing vs Pacific Drift"),
            ("evt-002", "fan-001", "game_attendance", "2025-11-02", "Rocky Mountain Rally - Apex Racing vs Alpine Velocity"),
            ("evt-003", "fan-001", "app_open", "2025-11-10", "Checked race results and championship standings"),
            ("evt-004", "fan-001", "social_share", "2025-11-11", "Shared podium finish highlight reel on social media"),
            ("evt-005", "fan-001", "game_attendance", "2025-12-01", "Pacific Coast Invitational at Portland Raceway"),
            ("evt-006", "fan-002", "game_attendance", "2025-10-15", "Colorado Grand Prix at Denver Speedway - Apex Racing vs Pacific Drift"),
            ("evt-007", "fan-002", "content_view", "2025-10-20", "Watched driver interview: Jake Torrence"),
            ("evt-008", "fan-002", "app_open", "2025-11-05", "Browsed merchandise catalog"),
            ("evt-009", "fan-003", "game_attendance", "2025-10-22", "Pacific Northwest Sprint at Portland Raceway"),
            ("evt-010", "fan-003", "game_attendance", "2025-11-15", "Cascade Cup - Pacific Drift vs Alpine Velocity"),
            ("evt-011", "fan-003", "social_share", "2025-11-16", "Posted race day photo"),
            ("evt-012", "fan-003", "game_attendance", "2025-12-05", "Winter Circuit Race at Portland Raceway"),
            ("evt-013", "fan-003", "content_view", "2025-12-10", "Watched season recap video"),
            ("evt-014", "fan-004", "game_attendance", "2025-09-20", "Apex Racing Season Opener at Colorado Circuit"),
            ("evt-015", "fan-004", "game_attendance", "2025-10-15", "Colorado Grand Prix at Denver Speedway - Apex Racing vs Pacific Drift"),
            ("evt-016", "fan-004", "game_attendance", "2025-11-02", "Rocky Mountain Rally - Apex Racing vs Alpine Velocity"),
            ("evt-017", "fan-004", "game_attendance", "2025-12-01", "Pacific Coast Invitational at Portland Raceway"),
            ("evt-018", "fan-004", "app_open", "2025-12-15", "Season pass renewal check"),
            ("evt-019", "fan-005", "app_open", "2025-11-01", "Checked Pacific Drift race schedule"),
            ("evt-020", "fan-005", "content_view", "2025-11-20", "Read team news article"),
            ("evt-021", "fan-006", "game_attendance", "2025-09-20", "Apex Racing Season Opener at Colorado Circuit"),
            ("evt-022", "fan-006", "game_attendance", "2025-10-15", "Colorado Grand Prix at Denver Speedway - Apex Racing vs Pacific Drift"),
            ("evt-023", "fan-006", "game_attendance", "2025-11-02", "Rocky Mountain Rally - Apex Racing vs Alpine Velocity"),
            ("evt-024", "fan-006", "game_attendance", "2025-12-01", "Pacific Coast Invitational at Portland Raceway"),
            ("evt-025", "fan-006", "game_attendance", "2025-12-20", "Apex Racing Holiday Showdown at Denver Speedway"),
            ("evt-026", "fan-006", "social_share", "2025-12-21", "Shared Holiday Showdown photos"),
            ("evt-027", "fan-006", "app_open", "2026-01-05", "Checked championship standings"),
            ("evt-028", "fan-007", "app_open", "2025-11-15", "Downloaded Alpine Velocity app"),
            ("evt-029", "fan-008", "game_attendance", "2025-10-22", "Pacific Northwest Sprint at Portland Raceway"),
            ("evt-030", "fan-008", "content_view", "2025-11-01", "Watched Carlos Vega onboard lap highlight"),
            ("evt-031", "fan-009", "game_attendance", "2025-09-20", "Apex Racing Season Opener at Colorado Circuit"),
            ("evt-032", "fan-009", "game_attendance", "2025-10-15", "Colorado Grand Prix at Denver Speedway - Apex Racing vs Pacific Drift"),
            ("evt-033", "fan-009", "game_attendance", "2025-11-02", "Rocky Mountain Rally - Apex Racing vs Alpine Velocity"),
            ("evt-034", "fan-009", "social_share", "2025-11-03", "Shared race recap"),
            ("evt-035", "fan-009", "app_open", "2025-12-01", "Checked race results"),
            ("evt-036", "fan-010", "game_attendance", "2025-11-10", "Alpine Classic at Aspen Motor Park"),
            ("evt-037", "fan-010", "content_view", "2025-11-15", "Read Liam Chen driver profile"),
            ("evt-038", "fan-011", "app_open", "2025-12-01", "First app open"),
            ("evt-039", "fan-012", "game_attendance", "2025-10-22", "Pacific Northwest Sprint at Portland Raceway"),
            ("evt-040", "fan-012", "game_attendance", "2025-11-15", "Cascade Cup - Pacific Drift vs Alpine Velocity"),
            ("evt-041", "fan-012", "game_attendance", "2025-12-05", "Winter Circuit Race at Portland Raceway"),
            ("evt-042", "fan-012", "game_attendance", "2025-12-20", "Pacific Drift Holiday Exhibition Race"),
            ("evt-043", "fan-012", "social_share", "2025-12-20", "Shared Holiday Exhibition selfie"),
            ("evt-044", "fan-012", "app_open", "2026-01-10", "Checked merch store"),
        };

        foreach (var (id, fanId, type, date, details) in events)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                INSERT INTO EngagementEvents (EventId, FanId, EventType, EventDate, Details)
                VALUES ($id, $fanId, $type, $date, $details)
                """;
            cmd.Parameters.AddWithValue("$id", id);
            cmd.Parameters.AddWithValue("$fanId", fanId);
            cmd.Parameters.AddWithValue("$type", type);
            cmd.Parameters.AddWithValue("$date", date);
            cmd.Parameters.AddWithValue("$details", details);
            cmd.ExecuteNonQuery();
        }

        // Seed merchandise
        var merch = new[]
        {
            ("prod-001", "Apex Racing Team Shirt", "Team Shirt", "Apex Racing", "", 89.99, 1),
            ("prod-002", "Apex Racing Pit Crew Shirt", "Team Shirt", "Apex Racing", "", 89.99, 1),
            ("prod-003", "Jake Torrence #10 Team Shirt", "Team Shirt", "Apex Racing", "Jake Torrence", 109.99, 1),
            ("prod-004", "Anika Patel #7 Team Shirt", "Team Shirt", "Apex Racing", "Anika Patel", 109.99, 1),
            ("prod-005", "Diego Ruiz #9 Team Shirt", "Team Shirt", "Apex Racing", "Diego Ruiz", 109.99, 1),
            ("prod-006", "Pacific Drift Team Shirt", "Team Shirt", "Pacific Drift", "", 84.99, 1),
            ("prod-007", "Carlos Vega #11 Team Shirt", "Team Shirt", "Pacific Drift", "Carlos Vega", 104.99, 1),
            ("prod-008", "Mei Lin #5 Team Shirt", "Team Shirt", "Pacific Drift", "Mei Lin", 104.99, 1),
            ("prod-009", "Alpine Velocity Team Shirt", "Team Shirt", "Alpine Velocity", "", 79.99, 1),
            ("prod-010", "Liam Chen #8 Team Shirt", "Team Shirt", "Alpine Velocity", "Liam Chen", 99.99, 1),
            ("prod-011", "Apex Racing Snapback Hat", "Hat", "Apex Racing", "", 29.99, 1),
            ("prod-012", "Apex Racing Beanie", "Hat", "Apex Racing", "", 24.99, 1),
            ("prod-013", "Pacific Drift Cap", "Hat", "Pacific Drift", "", 27.99, 1),
            ("prod-014", "Alpine Velocity Trucker Hat", "Hat", "Alpine Velocity", "", 26.99, 1),
            ("prod-015", "Apex Racing Pit Lane Scarf", "Accessory", "Apex Racing", "", 19.99, 1),
            ("prod-016", "Pacific Drift Pit Lane Scarf", "Accessory", "Pacific Drift", "", 19.99, 1),
            ("prod-017", "Apex Racing Coffee Mug", "Drinkware", "Apex Racing", "", 14.99, 1),
            ("prod-018", "Pacific Drift Water Bottle", "Drinkware", "Pacific Drift", "", 22.99, 1),
            ("prod-019", "Alpine Velocity Tumbler", "Drinkware", "Alpine Velocity", "", 24.99, 1),
            ("prod-020", "Apex Racing Hoodie", "Apparel", "Apex Racing", "", 64.99, 1),
            ("prod-021", "Pacific Drift T-Shirt", "Apparel", "Pacific Drift", "", 34.99, 1),
            ("prod-022", "Alpine Velocity Zip-Up Jacket", "Apparel", "Alpine Velocity", "", 74.99, 1),
            ("prod-023", "Apex Racing Die-Cast Model Car", "Equipment", "Apex Racing", "", 19.99, 1),
            ("prod-024", "Autographed Jake Torrence Helmet Photo", "Collectible", "Apex Racing", "Jake Torrence", 49.99, 0),
            ("prod-025", "Season Pass Holder Pin Set", "Collectible", "Apex Racing", "", 15.99, 1),
        };

        foreach (var (id, name, category, team, player, price, inStock) in merch)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                INSERT INTO Merchandise (ProductId, Name, Category, Team, Player, Price, InStock)
                VALUES ($id, $name, $category, $team, $player, $price, $inStock)
                """;
            cmd.Parameters.AddWithValue("$id", id);
            cmd.Parameters.AddWithValue("$name", name);
            cmd.Parameters.AddWithValue("$category", category);
            cmd.Parameters.AddWithValue("$team", team);
            cmd.Parameters.AddWithValue("$player", player);
            cmd.Parameters.AddWithValue("$price", price);
            cmd.Parameters.AddWithValue("$inStock", inStock);
            cmd.ExecuteNonQuery();
        }

        // Seed some purchases (some fans have bought, some haven't)
        var purchases = new[]
        {
            ("pur-001", "fan-001", "prod-003", "2025-10-16", 1, 109.99),  // Maria bought Jake Torrence team shirt after race
            ("pur-002", "fan-001", "prod-011", "2025-11-03", 1, 29.99),   // Maria bought a hat
            ("pur-003", "fan-004", "prod-004", "2025-09-21", 1, 109.99),  // Tyler bought Anika Patel team shirt
            ("pur-004", "fan-004", "prod-015", "2025-10-16", 2, 39.98),   // Tyler bought 2 scarves
            ("pur-005", "fan-004", "prod-020", "2025-12-02", 1, 64.99),   // Tyler bought hoodie
            ("pur-006", "fan-006", "prod-001", "2025-09-20", 1, 89.99),   // Marcus bought team shirt at season opener
            ("pur-007", "fan-012", "prod-006", "2025-10-23", 1, 84.99),   // Robert bought Pacific Drift team shirt
            ("pur-008", "fan-012", "prod-013", "2025-11-16", 1, 27.99),   // Robert bought cap
        };

        foreach (var (id, fanId, productId, date, qty, total) in purchases)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                INSERT INTO Purchases (PurchaseId, FanId, ProductId, PurchaseDate, Quantity, TotalPrice)
                VALUES ($id, $fanId, $productId, $date, $qty, $total)
                """;
            cmd.Parameters.AddWithValue("$id", id);
            cmd.Parameters.AddWithValue("$fanId", fanId);
            cmd.Parameters.AddWithValue("$productId", productId);
            cmd.Parameters.AddWithValue("$date", date);
            cmd.Parameters.AddWithValue("$qty", qty);
            cmd.Parameters.AddWithValue("$total", total);
            cmd.ExecuteNonQuery();
        }
    }
}
