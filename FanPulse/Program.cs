using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FanPulse.Data;
using FanPulse.Tools;

// Initialize the SQLite database with schema and seed data
DatabaseInitializer.Initialize();

var builder = Host.CreateApplicationBuilder(args);

builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()
    .WithTools<FanTools>();

await builder.Build().RunAsync();
