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
            ("fan-001", "Maria", "Rodriguez", "maria.r@email.com", "Thunderbolts", "Jake Storm, Anika Patel", "2023-03-15", "Denver", "CO"),
            ("fan-002", "James", "O'Brien", "jobrien@email.com", "Thunderbolts", "Jake Storm", "2022-11-01", "Boulder", "CO"),
            ("fan-003", "Priya", "Sharma", "priya.s@email.com", "River Wolves", "Carlos Vega, Mei Lin", "2024-01-20", "Portland", "OR"),
            ("fan-004", "Tyler", "Washington", "twash@email.com", "Thunderbolts", "Anika Patel", "2021-06-10", "Aurora", "CO"),
            ("fan-005", "Sarah", "Kim", "skim@email.com", "River Wolves", "Mei Lin", "2023-08-05", "Seattle", "WA"),
            ("fan-006", "Marcus", "Johnson", "mjohnson@email.com", "Thunderbolts", "Jake Storm, Diego Ruiz", "2022-02-14", "Denver", "CO"),
            ("fan-007", "Elena", "Petrov", "epetrov@email.com", "Summit FC", "Liam Chen", "2024-05-01", "Aspen", "CO"),
            ("fan-008", "David", "Nakamura", "dnakamura@email.com", "River Wolves", "Carlos Vega", "2023-11-12", "Eugene", "OR"),
            ("fan-009", "Aisha", "Hassan", "ahassan@email.com", "Thunderbolts", "Jake Storm, Anika Patel", "2022-09-22", "Lakewood", "CO"),
            ("fan-010", "Chris", "Anderson", "canderson@email.com", "Summit FC", "Liam Chen, Sofia Torres", "2023-06-18", "Fort Collins", "CO"),
            ("fan-011", "Jessica", "Lee", "jlee@email.com", "Thunderbolts", "Diego Ruiz", "2024-02-28", "Denver", "CO"),
            ("fan-012", "Robert", "Garcia", "rgarcia@email.com", "River Wolves", "Mei Lin, Carlos Vega", "2021-12-03", "Bend", "OR"),
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
            ("evt-001", "fan-001", "game_attendance", "2025-10-15", "Thunderbolts vs River Wolves - Home Game"),
            ("evt-002", "fan-001", "game_attendance", "2025-11-02", "Thunderbolts vs Summit FC - Home Game"),
            ("evt-003", "fan-001", "app_open", "2025-11-10", "Checked scores and standings"),
            ("evt-004", "fan-001", "social_share", "2025-11-11", "Shared highlight reel on social media"),
            ("evt-005", "fan-001", "game_attendance", "2025-12-01", "Thunderbolts vs River Wolves - Away Game"),
            ("evt-006", "fan-002", "game_attendance", "2025-10-15", "Thunderbolts vs River Wolves - Home Game"),
            ("evt-007", "fan-002", "content_view", "2025-10-20", "Watched player interview: Jake Storm"),
            ("evt-008", "fan-002", "app_open", "2025-11-05", "Browsed merchandise catalog"),
            ("evt-009", "fan-003", "game_attendance", "2025-10-22", "River Wolves vs Thunderbolts - Home Game"),
            ("evt-010", "fan-003", "game_attendance", "2025-11-15", "River Wolves vs Summit FC - Home Game"),
            ("evt-011", "fan-003", "social_share", "2025-11-16", "Posted game day photo"),
            ("evt-012", "fan-003", "game_attendance", "2025-12-05", "River Wolves vs Thunderbolts - Home Game"),
            ("evt-013", "fan-003", "content_view", "2025-12-10", "Watched season recap video"),
            ("evt-014", "fan-004", "game_attendance", "2025-09-20", "Thunderbolts Season Opener"),
            ("evt-015", "fan-004", "game_attendance", "2025-10-15", "Thunderbolts vs River Wolves - Home Game"),
            ("evt-016", "fan-004", "game_attendance", "2025-11-02", "Thunderbolts vs Summit FC - Home Game"),
            ("evt-017", "fan-004", "game_attendance", "2025-12-01", "Thunderbolts vs River Wolves - Away Game"),
            ("evt-018", "fan-004", "app_open", "2025-12-15", "Season ticket renewal check"),
            ("evt-019", "fan-005", "app_open", "2025-11-01", "Checked River Wolves schedule"),
            ("evt-020", "fan-005", "content_view", "2025-11-20", "Read team news article"),
            ("evt-021", "fan-006", "game_attendance", "2025-09-20", "Thunderbolts Season Opener"),
            ("evt-022", "fan-006", "game_attendance", "2025-10-15", "Thunderbolts vs River Wolves - Home Game"),
            ("evt-023", "fan-006", "game_attendance", "2025-11-02", "Thunderbolts vs Summit FC - Home Game"),
            ("evt-024", "fan-006", "game_attendance", "2025-12-01", "Thunderbolts vs River Wolves - Away Game"),
            ("evt-025", "fan-006", "game_attendance", "2025-12-20", "Thunderbolts Holiday Classic"),
            ("evt-026", "fan-006", "social_share", "2025-12-21", "Shared Holiday Classic photos"),
            ("evt-027", "fan-006", "app_open", "2026-01-05", "Checked playoff standings"),
            ("evt-028", "fan-007", "app_open", "2025-11-15", "Downloaded Summit FC app"),
            ("evt-029", "fan-008", "game_attendance", "2025-10-22", "River Wolves vs Thunderbolts - Home Game"),
            ("evt-030", "fan-008", "content_view", "2025-11-01", "Watched Carlos Vega highlight reel"),
            ("evt-031", "fan-009", "game_attendance", "2025-09-20", "Thunderbolts Season Opener"),
            ("evt-032", "fan-009", "game_attendance", "2025-10-15", "Thunderbolts vs River Wolves - Home Game"),
            ("evt-033", "fan-009", "game_attendance", "2025-11-02", "Thunderbolts vs Summit FC - Home Game"),
            ("evt-034", "fan-009", "social_share", "2025-11-03", "Shared game recap"),
            ("evt-035", "fan-009", "app_open", "2025-12-01", "Checked scores"),
            ("evt-036", "fan-010", "game_attendance", "2025-11-10", "Summit FC vs River Wolves"),
            ("evt-037", "fan-010", "content_view", "2025-11-15", "Read Liam Chen interview"),
            ("evt-038", "fan-011", "app_open", "2025-12-01", "First app open"),
            ("evt-039", "fan-012", "game_attendance", "2025-10-22", "River Wolves vs Thunderbolts - Home Game"),
            ("evt-040", "fan-012", "game_attendance", "2025-11-15", "River Wolves vs Summit FC - Home Game"),
            ("evt-041", "fan-012", "game_attendance", "2025-12-05", "River Wolves vs Thunderbolts - Home Game"),
            ("evt-042", "fan-012", "game_attendance", "2025-12-20", "River Wolves Holiday Special"),
            ("evt-043", "fan-012", "social_share", "2025-12-20", "Shared Holiday Special selfie"),
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
            ("prod-001", "Thunderbolts Home Jersey", "Jersey", "Thunderbolts", "", 89.99, 1),
            ("prod-002", "Thunderbolts Away Jersey", "Jersey", "Thunderbolts", "", 89.99, 1),
            ("prod-003", "Jake Storm #10 Jersey", "Jersey", "Thunderbolts", "Jake Storm", 109.99, 1),
            ("prod-004", "Anika Patel #7 Jersey", "Jersey", "Thunderbolts", "Anika Patel", 109.99, 1),
            ("prod-005", "Diego Ruiz #9 Jersey", "Jersey", "Thunderbolts", "Diego Ruiz", 109.99, 1),
            ("prod-006", "River Wolves Home Jersey", "Jersey", "River Wolves", "", 84.99, 1),
            ("prod-007", "Carlos Vega #11 Jersey", "Jersey", "River Wolves", "Carlos Vega", 104.99, 1),
            ("prod-008", "Mei Lin #5 Jersey", "Jersey", "River Wolves", "Mei Lin", 104.99, 1),
            ("prod-009", "Summit FC Home Jersey", "Jersey", "Summit FC", "", 79.99, 1),
            ("prod-010", "Liam Chen #8 Jersey", "Jersey", "Summit FC", "Liam Chen", 99.99, 1),
            ("prod-011", "Thunderbolts Snapback Hat", "Hat", "Thunderbolts", "", 29.99, 1),
            ("prod-012", "Thunderbolts Beanie", "Hat", "Thunderbolts", "", 24.99, 1),
            ("prod-013", "River Wolves Cap", "Hat", "River Wolves", "", 27.99, 1),
            ("prod-014", "Summit FC Trucker Hat", "Hat", "Summit FC", "", 26.99, 1),
            ("prod-015", "Thunderbolts Scarf", "Accessory", "Thunderbolts", "", 19.99, 1),
            ("prod-016", "River Wolves Scarf", "Accessory", "River Wolves", "", 19.99, 1),
            ("prod-017", "Thunderbolts Coffee Mug", "Drinkware", "Thunderbolts", "", 14.99, 1),
            ("prod-018", "River Wolves Water Bottle", "Drinkware", "River Wolves", "", 22.99, 1),
            ("prod-019", "Summit FC Tumbler", "Drinkware", "Summit FC", "", 24.99, 1),
            ("prod-020", "Thunderbolts Hoodie", "Apparel", "Thunderbolts", "", 64.99, 1),
            ("prod-021", "River Wolves T-Shirt", "Apparel", "River Wolves", "", 34.99, 1),
            ("prod-022", "Summit FC Zip-Up Jacket", "Apparel", "Summit FC", "", 74.99, 1),
            ("prod-023", "Thunderbolts Mini Soccer Ball", "Equipment", "Thunderbolts", "", 19.99, 1),
            ("prod-024", "Autographed Jake Storm Photo", "Collectible", "Thunderbolts", "Jake Storm", 49.99, 0),
            ("prod-025", "Season Ticket Holder Pin Set", "Collectible", "Thunderbolts", "", 15.99, 1),
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
            ("pur-001", "fan-001", "prod-003", "2025-10-16", 1, 109.99),  // Maria bought Jake Storm jersey after game
            ("pur-002", "fan-001", "prod-011", "2025-11-03", 1, 29.99),   // Maria bought a hat
            ("pur-003", "fan-004", "prod-004", "2025-09-21", 1, 109.99),  // Tyler bought Anika Patel jersey
            ("pur-004", "fan-004", "prod-015", "2025-10-16", 2, 39.98),   // Tyler bought 2 scarves
            ("pur-005", "fan-004", "prod-020", "2025-12-02", 1, 64.99),   // Tyler bought hoodie
            ("pur-006", "fan-006", "prod-001", "2025-09-20", 1, 89.99),   // Marcus bought team jersey at opener
            ("pur-007", "fan-012", "prod-006", "2025-10-23", 1, 84.99),   // Robert bought River Wolves jersey
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
