using System.ClientModel;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using OpenAI;

namespace FanPulseDashboard.Services;

public record ChatMessage(string Role, string Text, string? UiHtml = null);

/// <summary>
/// Manages two MCP server connections (C# and TypeScript) and sends prompts to both.
/// </summary>
public class ChatService : IAsyncDisposable
{
    private McpClient? _csharpClient;
    private McpClient? _appsClient;
    private IChatClient? _chatClient;
    private bool _initialized;
    private string? _initError;
    private readonly ILogger<ChatService> _logger;

    private readonly List<Microsoft.Extensions.AI.ChatMessage> _csharpMessages = [];
    private readonly List<Microsoft.Extensions.AI.ChatMessage> _appsMessages = [];

    public List<ChatMessage> CSharpChat { get; } = [];
    public List<ChatMessage> AppsChat { get; } = [];
    public bool IsInitialized => _initialized;
    public string? InitError => _initError;
    public int CSharpToolCount { get; private set; }
    public int AppsToolCount { get; private set; }

    public ChatService(ILogger<ChatService> logger)
    {
        _logger = logger;
    }

    private const string SystemPrompt = """
        You are a Fan Engagement Analyst for a sports organization. You have access to the
        FanPulse system, which tracks fan profiles, engagement metrics, merchandise, purchases,
        promotions, and fan segments.

        Your role is to help the team understand their fans and grow revenue. When answering questions:

        1. ALWAYS use the available FanPulse tools to look up real data — never make up fan names,
           numbers, or statistics.
        2. Present data in clear, readable summaries with key highlights.
        3. After presenting data, proactively suggest actionable next steps.
        4. When creating promotions, confirm the details before proceeding.
        5. Use emoji sparingly to make responses scannable (📊 for metrics, 🏟️ for attendance,
           🛍️ for merchandise, 🎯 for promotions, 👥 for segments).
        6. Keep responses concise but insightful — think executive dashboard, not raw data dump.
        """;

    public async Task InitializeAsync()
    {
        if (_initialized) return;

        var githubToken = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
        if (string.IsNullOrEmpty(githubToken))
        {
            _initError = "GITHUB_TOKEN environment variable is not set. Set it to a GitHub PAT with access to GitHub Models.";
            return;
        }

        try
        {
            // Connect to C# FanPulse server
            var fanPulsePath = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "FanPulse"));
            _logger.LogInformation("Starting C# FanPulse server from: {Path}", fanPulsePath);

            _csharpClient = await McpClient.CreateAsync(
                new StdioClientTransport(new()
                {
                    Command = "dotnet",
                    Arguments = ["run", "--no-build", "--project", fanPulsePath],
                    Name = "FanPulse",
                }));
            var csharpTools = await _csharpClient.ListToolsAsync();
            CSharpToolCount = csharpTools.Count;
            _logger.LogInformation("C# FanPulse server connected with {Count} tools", CSharpToolCount);

            // Connect to TypeScript FanPulse Apps server
            var fanPulseAppsPath = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "FanPulseApps"));
            var distMainJs = Path.Combine(fanPulseAppsPath, "dist", "main.js");
            _logger.LogInformation("Starting TypeScript FanPulseApps server from: {Path}", distMainJs);

            _appsClient = await McpClient.CreateAsync(
                new StdioClientTransport(new()
                {
                    Command = "node",
                    Arguments = [distMainJs, "--stdio"],
                    Name = "FanPulseApps",
                }));
            var appsTools = await _appsClient.ListToolsAsync();
            AppsToolCount = appsTools.Count;
            _logger.LogInformation("TypeScript FanPulseApps server connected with {Count} tools", AppsToolCount);

            // Set up LLM
            var openAIClient = new OpenAIClient(
                new ApiKeyCredential(githubToken),
                new OpenAIClientOptions { Endpoint = new Uri("https://models.inference.ai.azure.com") });

            _chatClient = openAIClient
                .GetChatClient("gpt-4o")
                .AsIChatClient()
                .AsBuilder()
                .UseFunctionInvocation()
                .Build();

            _csharpMessages.Add(new(ChatRole.System, SystemPrompt));
            _appsMessages.Add(new(ChatRole.System, SystemPrompt));

            _initialized = true;
        }
        catch (Exception ex)
        {
            _initError = $"Failed to initialize: {ex.Message}";
            _logger.LogError(ex, "Failed to initialize MCP servers");
        }
    }

    /// <summary>
    /// Sends a prompt to both servers sequentially and returns when both complete.
    /// </summary>
    public async Task SendMessageAsync(string userMessage)
    {
        if (!_initialized || _chatClient == null) return;

        CSharpChat.Add(new("user", userMessage));
        AppsChat.Add(new("user", userMessage));

        _csharpMessages.Add(new(ChatRole.User, userMessage));
        _appsMessages.Add(new(ChatRole.User, userMessage));

        var csharpTools = await _csharpClient!.ListToolsAsync();
        var appsTools = await _appsClient!.ListToolsAsync();

        // Send to both servers sequentially to avoid GitHub Models rate limits
        var csharpResponse = await GetResponseAsync(_csharpMessages, csharpTools);
        var appsResponse = await GetResponseWithUiAsync(_appsMessages, appsTools);

        CSharpChat.Add(new("assistant", csharpResponse));
        AppsChat.Add(appsResponse);
    }

    private async Task<string> GetResponseAsync(
        List<Microsoft.Extensions.AI.ChatMessage> messages,
        IList<McpClientTool> tools)
    {
        try
        {
            List<ChatResponseUpdate> updates = [];
            await foreach (var update in _chatClient!.GetStreamingResponseAsync(
                messages,
                new() { Tools = [.. tools] }))
            {
                updates.Add(update);
            }
            messages.AddMessages(updates);

            var text = string.Join("", updates.Select(u => u.Text ?? ""));
            return string.IsNullOrEmpty(text) ? "(No response)" : text;
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    private async Task<ChatMessage> GetResponseWithUiAsync(
        List<Microsoft.Extensions.AI.ChatMessage> messages,
        IList<McpClientTool> tools)
    {
        try
        {
            List<ChatResponseUpdate> updates = [];
            var msgCountBefore = messages.Count;
            await foreach (var update in _chatClient!.GetStreamingResponseAsync(
                messages,
                new() { Tools = [.. tools] }))
            {
                updates.Add(update);
            }
            messages.AddMessages(updates);

            var text = string.Join("", updates.Select(u => u.Text ?? ""));
            if (string.IsNullOrEmpty(text)) text = "(No response)";

            // Extract tool results only from messages added in this turn
            string? uiHtml = null;
            try
            {
                uiHtml = ExtractToolResultVisualization(messages, msgCountBefore);
            }
            catch
            {
                // Visualization is best-effort
            }

            return new ChatMessage("assistant", text, uiHtml);
        }
        catch (Exception ex)
        {
            return new ChatMessage("assistant", $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Looks at tool results added in the current turn (from startIndex onwards) and generates
    /// self-contained HTML visualizations for all tools that have a visual representation.
    /// </summary>
    private string? ExtractToolResultVisualization(List<Microsoft.Extensions.AI.ChatMessage> messages, int startIndex)
    {
        var callNames = new Dictionary<string, string>();
        var toolResults = new List<(string ToolName, string ResultJson)>();

        for (int i = startIndex; i < messages.Count; i++)
        {
            var msg = messages[i];
            _logger.LogDebug("Msg Role={Role}, Contents={Count}: [{Types}]",
                msg.Role, msg.Contents.Count,
                string.Join(", ", msg.Contents.Select(c => c.GetType().Name)));

            foreach (var content in msg.Contents)
            {
                if (content is FunctionCallContent fcc)
                {
                    callNames[fcc.CallId] = fcc.Name;
                    _logger.LogInformation("FunctionCall: {Name} (CallId={CallId})", fcc.Name, fcc.CallId);
                }
                else if (content is FunctionResultContent frc)
                {
                    var resultStr = frc.Result?.ToString();
                    var name = frc.CallId != null && callNames.TryGetValue(frc.CallId, out var n) ? n : "unknown";
                    _logger.LogInformation("FunctionResult for {Name}: length={Length}", name, resultStr?.Length ?? 0);

                    if (!string.IsNullOrEmpty(resultStr))
                    {
                        toolResults.Add((name, resultStr));
                        _logger.LogDebug("Result preview: {Preview}", resultStr.Substring(0, Math.Min(500, resultStr.Length)));
                    }
                }
            }
        }

        // Try each tool result in order — use the FIRST one that produces a visualization
        foreach (var (toolName, resultJson) in toolResults)
        {
            _logger.LogInformation("Trying visualization for tool: {ToolName}", toolName);
            var html = GenerateVisualizationHtml(toolName, resultJson);
            if (html != null)
            {
                _logger.LogInformation("Visualization result: True, length={Length}", html.Length);
                return html;
            }
        }

        _logger.LogWarning("No tool results found for visualization");
        return null;
    }

    private string? GenerateVisualizationHtml(string toolName, string resultJson)
    {
        try
        {
            // The result might be wrapped - try to extract the actual JSON content
            var json = ExtractJsonContent(resultJson);
            _logger.LogDebug("Extracted JSON for {Tool}: {Preview}", toolName,
                json.Substring(0, Math.Min(200, json.Length)));

            return toolName switch
            {
                "GetFanSegments" => BuildSegmentsHtml(json),
                "GetFanEngagementMetrics" => BuildEngagementHtml(json),
                "SearchMerchandise" => BuildMerchHtml(json),
                "GetMerchandiseRecommendations" or "GetMerchRecommendations" => BuildRecommendationsHtml(json),
                "CreatePromotion" => BuildPromoHtml(json),
                _ => null
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating visualization for {Tool}", toolName);
            return null;
        }
    }

    /// <summary>
    /// The FunctionResultContent.Result may be:
    /// 1. A raw JSON string like {"segments":[...]}
    /// 2. A JsonElement wrapping the MCP content array
    /// 3. A string containing the JSON text from content[0].text
    /// This method extracts the usable JSON object.
    /// </summary>
    private static string ExtractJsonContent(string resultStr)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(resultStr);
            var root = doc.RootElement;

            // If it's already a useful object with our expected properties, use it directly
            if (root.ValueKind == System.Text.Json.JsonValueKind.Object &&
                (root.TryGetProperty("segments", out _) ||
                 root.TryGetProperty("fans", out _) ||
                 root.TryGetProperty("products", out _) ||
                 root.TryGetProperty("recommendations", out _) ||
                 root.TryGetProperty("promoId", out _)))
            {
                return resultStr;
            }

            // If it's an array (MCP content array), look for text content
            if (root.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var item in root.EnumerateArray())
                {
                    if (item.TryGetProperty("type", out var typeEl) && typeEl.GetString() == "text" &&
                        item.TryGetProperty("text", out var textEl))
                    {
                        return textEl.GetString() ?? resultStr;
                    }
                }
            }

            // If it has a "content" property (MCP result wrapper), dig into it
            if (root.TryGetProperty("content", out var contentArr) &&
                contentArr.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var item in contentArr.EnumerateArray())
                {
                    if (item.TryGetProperty("type", out var typeEl) && typeEl.GetString() == "text" &&
                        item.TryGetProperty("text", out var textEl))
                    {
                        return textEl.GetString() ?? resultStr;
                    }
                }
            }

            // If it has a "result" property, try that
            if (root.TryGetProperty("result", out var resultEl))
            {
                return resultEl.GetRawText();
            }
        }
        catch
        {
            // Not valid JSON, return as-is
        }

        return resultStr;
    }

    private static string WrapHtml(string title, string icon, string body) => $$"""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"/>
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#0f0c29,#1a1a2e,#16213e);color:#e0e0e0;padding:24px;min-height:100vh;}
            @keyframes fadeIn{from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            @keyframes slideUp{from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
            @keyframes barGrow{from{width:0} to{width:var(--bar-width)} }
            @keyframes pulse{0%,100%{box-shadow:0 0 8px rgba(80,250,123,.3)} 50%{box-shadow:0 0 20px rgba(80,250,123,.6)} }
            @keyframes confetti1{0%{transform:translate(0,0) rotate(0);opacity:1} 100%{transform:translate(60px,-120px) rotate(360deg);opacity:0} }
            @keyframes confetti2{0%{transform:translate(0,0) rotate(0);opacity:1} 100%{transform:translate(-50px,-100px) rotate(-270deg);opacity:0} }
            @keyframes confetti3{0%{transform:translate(0,0) rotate(0);opacity:1} 100%{transform:translate(40px,-140px) rotate(200deg);opacity:0} }
            @keyframes shimmer{0%{background-position:-200% 0} 100%{background-position:200% 0} }

            .header{display:flex;align-items:center;gap:12px;margin-bottom:20px;animation:fadeIn .5s ease-out;padding-bottom:16px;border-bottom:1px solid rgba(139,233,253,.15);}
            .header h2{font-size:22px;font-weight:700;letter-spacing:-.5px;background:linear-gradient(135deg,#8be9fd,#bd93f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
            .header-icon{font-size:28px;filter:drop-shadow(0 0 6px rgba(139,233,253,.4));}

            .stats-row{display:flex;gap:16px;margin-bottom:20px;animation:fadeIn .6s ease-out;}
            .stat-box{flex:1;background:linear-gradient(135deg,rgba(22,33,62,.9),rgba(26,26,46,.9));border:1px solid rgba(139,233,253,.15);border-radius:12px;padding:16px;text-align:center;transition:transform .2s,box-shadow .2s;}
            .stat-box:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3);}
            .stat-value{font-size:28px;font-weight:800;background:linear-gradient(135deg,#8be9fd,#50fa7b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
            .stat-label{font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;}

            .card{background:linear-gradient(145deg,rgba(22,33,62,.95),rgba(15,12,41,.95));border:1px solid rgba(139,233,253,.1);border-radius:12px;padding:16px;margin-bottom:12px;transition:transform .25s ease,box-shadow .25s ease;animation:slideUp .4s ease-out backwards;}
            .card:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 12px 32px rgba(0,0,0,.4),0 0 0 1px rgba(139,233,253,.15);}
            .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}

            table{width:100%;border-collapse:collapse;font-size:13px;animation:fadeIn .5s ease-out;}
            th{text-align:left;padding:10px 12px;border-bottom:2px solid rgba(139,233,253,.25);color:#8be9fd;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}
            td{padding:10px 12px;border-bottom:1px solid rgba(42,42,74,.5);transition:background .15s;}
            tr{transition:background .15s;}
            tr:hover{background:rgba(139,233,253,.05);}

            .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px;}
            .accent{color:#8be9fd;}.green{color:#50fa7b;}.yellow{color:#f1fa8c;}.red{color:#ff5555;}.purple{color:#bd93f9;}
            .bar{height:10px;border-radius:5px;background:rgba(42,42,74,.6);margin-top:4px;overflow:hidden;position:relative;}
            .bar-fill{height:100%;border-radius:5px;animation:barGrow .8s ease-out forwards;width:0;}

            .detail-panel{max-height:0;overflow:hidden;transition:max-height .4s ease,opacity .3s ease;opacity:0;}
            .detail-panel.open{max-height:600px;opacity:1;}

            .segment-card{cursor:pointer;position:relative;overflow:hidden;}
            .segment-card::after{content:'';position:absolute;inset:0;border-radius:12px;opacity:0;transition:opacity .3s;}
            .segment-card:hover::after{opacity:1;}
            .segment-card.active{border-color:rgba(139,233,253,.5);}

            .rank-badge{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#fff;flex-shrink:0;}

            .promo-card{position:relative;overflow:hidden;}
            .confetti-particle{position:absolute;width:8px;height:8px;border-radius:2px;}
            .cp1{background:#50fa7b;top:30%;left:15%;animation:confetti1 1.5s ease-out infinite;}
            .cp2{background:#f1fa8c;top:25%;right:20%;animation:confetti2 1.8s ease-out infinite .2s;}
            .cp3{background:#8be9fd;top:35%;left:25%;animation:confetti3 1.6s ease-out infinite .4s;}
            .cp4{background:#ff79c6;top:20%;right:30%;animation:confetti1 1.7s ease-out infinite .6s;}
            .cp5{background:#bd93f9;top:40%;left:10%;animation:confetti2 1.4s ease-out infinite .3s;}
            .cp6{background:#ffb86c;top:28%;right:12%;animation:confetti3 1.9s ease-out infinite .5s;}

            .success-badge{display:inline-block;padding:6px 20px;border-radius:20px;background:rgba(80,250,123,.15);color:#50fa7b;font-weight:700;font-size:13px;animation:pulse 2s ease-in-out infinite;border:1px solid rgba(80,250,123,.3);}

            .discount-text{font-size:56px;font-weight:900;background:linear-gradient(135deg,#f1fa8c,#ffb86c,#ff79c6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-2px;}

            .product-icon{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}

            .stock-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;}
        </style></head>
        <body>
        <div class="header"><span class="header-icon">{{icon}}</span><h2>{{title}}</h2></div>
        {{body}}
        </body></html>
        """;

    private static string? BuildSegmentsHtml(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("segments", out var segments)) return null;

            var colors = new Dictionary<string, string>
            {
                ["superfans"] = "#059669", ["engaged_no_purchase"] = "#6366f1",
                ["buyers_low_engagement"] = "#f59e0b", ["casual_fans"] = "#0d9488", ["dormant_fans"] = "#ef4444"
            };
            var icons = new Dictionary<string, string>
            {
                ["superfans"] = "⭐", ["engaged_no_purchase"] = "🎯",
                ["buyers_low_engagement"] = "🛒", ["casual_fans"] = "👋", ["dormant_fans"] = "💤"
            };
            var labels = new Dictionary<string, string>
            {
                ["superfans"] = "Superfans", ["engaged_no_purchase"] = "Engaged, No Purchase",
                ["buyers_low_engagement"] = "Buyers, Low Engagement", ["casual_fans"] = "Casual Fans", ["dormant_fans"] = "Dormant Fans"
            };

            var totalFans = 0;
            var segData = new List<(string name, int count, string desc, string color, string icon, string label, System.Text.Json.JsonElement fansEl)>();
            foreach (var seg in segments.EnumerateArray())
            {
                var name = seg.GetProperty("segment").GetString() ?? "";
                var count = seg.GetProperty("count").GetInt32();
                var desc = seg.GetProperty("description").GetString() ?? "";
                totalFans += count;
                seg.TryGetProperty("fans", out var fansEl);
                segData.Add((name, count, desc, colors.GetValueOrDefault(name, "#888"), icons.GetValueOrDefault(name, "📊"), labels.GetValueOrDefault(name, name), fansEl));
            }

            var sb = new System.Text.StringBuilder();

            // Summary stat
            sb.Append($"""
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="stat-value">{totalFans}</div>
                        <div class="stat-label">Total Fans</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{segData.Count}</div>
                        <div class="stat-label">Segments</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{(segData.Count > 0 ? segData.Max(s => s.count) : 0)}</div>
                        <div class="stat-label">Largest Segment</div>
                    </div>
                </div>
                """);

            // Segment cards
            sb.Append("<div class=\"grid\">");
            for (int i = 0; i < segData.Count; i++)
            {
                var (name, count, desc, color, segIcon, label, _) = segData[i];
                var delay = i * 80;
                sb.Append($"""
                    <div class="card segment-card" style="border-left:4px solid {color};animation-delay:{delay}ms" onclick="toggleDetail({i})">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <span style="font-size:24px">{segIcon}</span>
                            <span class="badge" style="background:{color}22;color:{color}">{count} fans</span>
                        </div>
                        <div style="font-weight:700;color:{color};font-size:15px;margin-bottom:4px">{label}</div>
                        <div style="font-size:12px;color:#888;line-height:1.4">{desc}</div>
                        <div style="text-align:right;margin-top:8px;font-size:11px;color:#555">Click to explore ▾</div>
                    </div>
                    """);
            }
            sb.Append("</div>");

            // Detail panels for each segment
            for (int i = 0; i < segData.Count; i++)
            {
                var (name, count, desc, color, segIcon, label, fansEl) = segData[i];
                sb.Append($"""<div id="detail-{i}" class="detail-panel" style="margin-top:12px">""");
                sb.Append($"""<div class="card" style="border-top:3px solid {color}"><h3 style="color:{color};margin-bottom:12px;font-size:15px">{segIcon} {label} — Fan Details</h3>""");
                sb.Append("<table><thead><tr><th>Name</th><th>Team</th><th>Engagements</th><th>Games</th><th>Purchases</th><th>Total Spent</th></tr></thead><tbody>");

                if (fansEl.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var fan in fansEl.EnumerateArray())
                    {
                        var fanName = fan.TryGetProperty("name", out var fn) ? fn.GetString() ?? "—" : "—";
                        var team = fan.TryGetProperty("favoriteTeam", out var ft) ? ft.GetString() ?? "—" : "—";
                        var engagements = fan.TryGetProperty("totalEngagements", out var te) ? te.GetInt32() : 0;
                        var games = fan.TryGetProperty("gamesAttended", out var ga) ? ga.GetInt32() : 0;
                        var purchases = fan.TryGetProperty("purchases", out var pu) ? pu.GetInt32() : 0;
                        var spent = fan.TryGetProperty("totalSpent", out var ts) ? ts.GetDouble() : 0;
                        sb.Append($"""
                            <tr>
                                <td><strong>{fanName}</strong></td>
                                <td>{team}</td>
                                <td>{engagements}</td>
                                <td>{games}</td>
                                <td>{purchases}</td>
                                <td style="color:#50fa7b;font-weight:600">${spent:F2}</td>
                            </tr>
                            """);
                    }
                }

                sb.Append("</tbody></table></div></div>");
            }

            // Script for interactivity
            sb.Append("""
                <script>
                function toggleDetail(idx){
                    document.querySelectorAll('.detail-panel').forEach(function(p,i){
                        if(i===idx){p.classList.toggle('open');}else{p.classList.remove('open');}
                    });
                    document.querySelectorAll('.segment-card').forEach(function(c,i){
                        if(i===idx){c.classList.toggle('active');}else{c.classList.remove('active');}
                    });
                }
                </script>
                """);

            return WrapHtml("Fan Segments", "👥", sb.ToString());
        }
        catch { return null; }
    }

    private static string? BuildEngagementHtml(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("fans", out var fans)) return null;

            var fanList = new List<(string name, string team, int events, int types, int games, int score)>();
            foreach (var fan in fans.EnumerateArray())
            {
                fanList.Add((
                    fan.GetProperty("name").GetString() ?? "",
                    fan.GetProperty("favoriteTeam").GetString() ?? "",
                    fan.GetProperty("totalEvents").GetInt32(),
                    fan.GetProperty("eventTypes").GetInt32(),
                    fan.GetProperty("gamesAttended").GetInt32(),
                    fan.GetProperty("engagementScore").GetInt32()
                ));
            }

            var totalFans = fanList.Count;
            var avgScore = totalFans > 0 ? fanList.Average(f => f.score) : 0;
            var topFan = totalFans > 0 ? fanList.OrderByDescending(f => f.score).First().name : "—";
            var maxScore = totalFans > 0 ? fanList.Max(f => f.score) : 1;

            var sb = new System.Text.StringBuilder();

            // Summary stats
            sb.Append($"""
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="stat-value">{totalFans}</div>
                        <div class="stat-label">Total Fans</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{avgScore:F1}</div>
                        <div class="stat-label">Avg Score</div>
                    </div>
                    <div class="stat-box">
                        <div style="font-size:16px;font-weight:700;color:#50fa7b">🏆 {topFan}</div>
                        <div class="stat-label">Top Performer</div>
                    </div>
                </div>
                """);

            // Table
            sb.Append("""<div class="card"><table><thead><tr><th>Fan</th><th>Team</th><th>Events</th><th>Types</th><th>Games</th><th style="min-width:160px">Engagement Score</th></tr></thead><tbody>""");

            for (int i = 0; i < fanList.Count; i++)
            {
                var (name, team, events, types, games, score) = fanList[i];
                var pct = Math.Min(100, (int)(score * 100.0 / maxScore));
                var barColor = pct > 66 ? "#50fa7b" : pct > 33 ? "#f1fa8c" : "#ff5555";
                var rowTint = pct > 66 ? "rgba(80,250,123,.04)" : pct > 33 ? "rgba(241,250,140,.04)" : "rgba(255,85,85,.04)";
                var delay = i * 100;
                sb.Append($"""
                    <tr style="background:{rowTint}">
                        <td><strong style="color:#e0e0e0">{name}</strong></td>
                        <td>{team}</td>
                        <td style="text-align:center">{events}</td>
                        <td style="text-align:center">{types}</td>
                        <td style="text-align:center">{games}</td>
                        <td>
                            <div style="display:flex;align-items:center;gap:8px">
                                <div class="bar" style="flex:1"><div class="bar-fill" style="--bar-width:{pct}%;background:linear-gradient(90deg,{barColor},{barColor}cc);animation-delay:{delay}ms"></div></div>
                                <span style="font-size:13px;font-weight:700;color:{barColor};min-width:28px;text-align:right">{score}</span>
                            </div>
                        </td>
                    </tr>
                    """);
            }

            sb.Append("</tbody></table></div>");
            return WrapHtml("Engagement Metrics", "📊", sb.ToString());
        }
        catch { return null; }
    }

    private static string? BuildMerchHtml(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("products", out var products)) return null;

            var prodList = new List<(string name, string team, double price, string category, bool inStock)>();
            foreach (var prod in products.EnumerateArray())
            {
                prodList.Add((
                    prod.GetProperty("name").GetString() ?? "",
                    prod.GetProperty("team").GetString() ?? "",
                    prod.GetProperty("price").GetDouble(),
                    prod.GetProperty("category").GetString() ?? "",
                    prod.TryGetProperty("inStock", out var s) && s.GetBoolean()
                ));
            }

            var totalProducts = prodList.Count;
            var inStockCount = prodList.Count(p => p.inStock);

            var categoryIcons = new Dictionary<string, (string icon, string color)>
            {
                ["Apparel"] = ("👕", "#6366f1"), ["Headwear"] = ("🧢", "#0d9488"), ["Accessories"] = ("🎒", "#f59e0b"),
                ["Drinkware"] = ("☕", "#ef4444"), ["Collectibles"] = ("🏆", "#bd93f9"), ["Home"] = ("🏠", "#059669")
            };

            var sb = new System.Text.StringBuilder();

            // Summary
            sb.Append($"""
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="stat-value">{totalProducts}</div>
                        <div class="stat-label">Products Found</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="-webkit-text-fill-color:#50fa7b">{inStockCount}</div>
                        <div class="stat-label">In Stock</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="-webkit-text-fill-color:#ff5555">{totalProducts - inStockCount}</div>
                        <div class="stat-label">Out of Stock</div>
                    </div>
                </div>
                """);

            sb.Append("<div class=\"grid\">");
            for (int i = 0; i < prodList.Count; i++)
            {
                var (name, team, price, category, inStock) = prodList[i];
                var (catIcon, catColor) = categoryIcons.GetValueOrDefault(category, ("📦", "#888"));
                var stockColor = inStock ? "#50fa7b" : "#ff5555";
                var stockText = inStock ? "In Stock" : "Out of Stock";
                var delay = i * 60;
                sb.Append($"""
                    <div class="card" style="animation-delay:{delay}ms">
                        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
                            <div class="product-icon" style="background:{catColor}20">{catIcon}</div>
                            <div style="flex:1">
                                <div style="font-weight:700;font-size:14px;line-height:1.3;margin-bottom:4px">{name}</div>
                                <div style="font-size:12px;color:#888">{team}</div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                            <span class="badge" style="background:{catColor}18;color:{catColor}">{category}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid rgba(42,42,74,.5)">
                            <span style="font-size:22px;font-weight:800;color:#8be9fd">${price:F2}</span>
                            <span style="display:flex;align-items:center;font-size:12px;font-weight:600;color:{stockColor}"><span class="stock-dot" style="background:{stockColor}"></span>{stockText}</span>
                        </div>
                    </div>
                    """);
            }
            sb.Append("</div>");

            return WrapHtml("Merchandise Catalog", "🛍️", sb.ToString());
        }
        catch { return null; }
    }

    private static string? BuildRecommendationsHtml(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("recommendations", out var recs)) return null;

            var fanName = root.TryGetProperty("fanName", out var fn) ? fn.GetString() ?? "" : "";

            var sb = new System.Text.StringBuilder();

            if (!string.IsNullOrEmpty(fanName))
            {
                sb.Append($"""
                    <div style="margin-bottom:16px;animation:fadeIn .4s ease-out;font-size:14px;color:#bd93f9">
                        <span style="font-size:18px">🎯</span> Personalized picks for <strong style="color:#e0e0e0">{fanName}</strong>
                    </div>
                    """);
            }

            var gradients = new[] { "#ff6b6b,#ee5a24", "#f9ca24,#f0932b", "#6ab04c,#009432", "#22a6b3,#0652DD", "#e056fd,#6c5ce7" };

            sb.Append("<div class=\"grid\">");
            int rank = 0;
            foreach (var rec in recs.EnumerateArray())
            {
                rank++;
                // Handle both flat format {name, price, reason} and nested {product: {name, price}, reason}
                var nameEl = rec;
                if (rec.TryGetProperty("product", out var productEl))
                    nameEl = productEl;
                var name = nameEl.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                var price = nameEl.TryGetProperty("price", out var p) ? p.GetDouble() : 0;
                var reason = rec.TryGetProperty("reason", out var r) ? r.GetString() ?? "" : "";
                var grad = gradients[(rank - 1) % gradients.Length];
                var delay = (rank - 1) * 100;
                sb.Append($"""
                    <div class="card" style="animation-delay:{delay}ms">
                        <div style="display:flex;gap:14px;align-items:flex-start">
                            <div class="rank-badge" style="background:linear-gradient(135deg,{grad})">{rank}</div>
                            <div style="flex:1">
                                <div style="font-weight:700;font-size:15px;margin-bottom:4px">{name}</div>
                                <div style="font-size:22px;font-weight:800;color:#8be9fd;margin-bottom:8px">${price:F2}</div>
                                <div style="font-size:12px;color:#aaa;line-height:1.5;display:flex;gap:6px;align-items:flex-start">
                                    <span style="flex-shrink:0">💡</span>
                                    <span style="font-style:italic">{reason}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    """);
            }
            sb.Append("</div>");

            return WrapHtml("Recommended For You", "🎯", sb.ToString());
        }
        catch { return null; }
    }

    private static string? BuildPromoHtml(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var name = root.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "Promotion";
            var discount = root.TryGetProperty("discountPercent", out var d) ? d.GetInt32() : 0;
            var target = root.TryGetProperty("targetSegment", out var t) ? t.GetString() ?? "" : "";
            var promoId = root.TryGetProperty("promoId", out var p) ? p.GetString() ?? "" : "";

            var body = $"""
                <div class="card promo-card" style="text-align:center;padding:32px;border:1px solid rgba(80,250,123,.25);position:relative;overflow:hidden">
                    <div class="confetti-particle cp1"></div>
                    <div class="confetti-particle cp2"></div>
                    <div class="confetti-particle cp3"></div>
                    <div class="confetti-particle cp4"></div>
                    <div class="confetti-particle cp5"></div>
                    <div class="confetti-particle cp6"></div>

                    <div style="margin-bottom:16px"><span class="success-badge">✓ Promotion Created</span></div>

                    <div style="font-size:48px;margin-bottom:8px">🎉</div>
                    <div style="font-size:22px;font-weight:800;color:#e0e0e0;margin-bottom:16px">{name}</div>

                    <div class="discount-text" style="margin:16px 0">{discount}% OFF</div>

                    <div style="display:flex;justify-content:center;gap:24px;margin:20px 0;flex-wrap:wrap">
                        <div style="text-align:center">
                            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Target Segment</div>
                            <div style="font-size:15px;font-weight:700;color:#bd93f9">{target}</div>
                        </div>
                        <div style="width:1px;background:rgba(42,42,74,.8)"></div>
                        <div style="text-align:center">
                            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Discount</div>
                            <div style="font-size:15px;font-weight:700;color:#50fa7b">{discount}%</div>
                        </div>
                        <div style="width:1px;background:rgba(42,42,74,.8)"></div>
                        <div style="text-align:center">
                            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Promo ID</div>
                            <div style="font-size:13px;font-weight:600;color:#888;font-family:monospace">{promoId}</div>
                        </div>
                    </div>
                </div>
                """;
            return WrapHtml("Promotion Created", "🎯", body);
        }
        catch { return null; }
    }

    public async ValueTask DisposeAsync()
    {
        if (_chatClient is IDisposable disposable) disposable.Dispose();
        if (_csharpClient != null) await _csharpClient.DisposeAsync();
        if (_appsClient != null) await _appsClient.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}
