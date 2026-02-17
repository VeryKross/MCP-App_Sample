using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FanPulse.Data;
using FanPulse.Tools;

// Initialize the SQLite database with schema and seed data
DatabaseInitializer.Initialize();

var useHttp = args.Contains("--http") ||
              Environment.GetEnvironmentVariable("FANPULSE_HTTP") == "true";

if (useHttp)
{
    var builder = WebApplication.CreateBuilder(args);
    builder.WebHost.UseUrls("http://localhost:5001");
    builder.Services.AddCors();
    builder.Services
        .AddMcpServer()
        .WithHttpTransport()
        .WithTools<FanTools>();

    var app = builder.Build();
    app.UseCors(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
    app.MapMcp();
    app.Run();
}
else
{
    var builder = Microsoft.Extensions.Hosting.Host.CreateApplicationBuilder(args);
    builder.Services
        .AddMcpServer()
        .WithStdioServerTransport()
        .WithTools<FanTools>();

    await builder.Build().RunAsync();
}
