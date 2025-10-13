using PS2Challenge.Backend.Configuration;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend;
using PS2Challenge.Backend.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel to listen on both HTTP and HTTPS
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(5001); // HTTP
    options.ListenAnyIP(5003, listenOptions =>
    {
        listenOptions.UseHttps(); // HTTPS
    });
});

// Load and validate environment configuration
var envConfig = EnvironmentConfig.Instance;
envConfig.Validate();

// Initialize backend (configuration validation and migrations)
BackendInitializer.Initialize();

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register EnvironmentConfig as a singleton for DI
builder.Services.AddSingleton(envConfig);

// Register DbContext with PostgreSQL
builder.Services.AddDbContext<Ps2ChallengeDbContext>(options =>
    options.UseNpgsql(envConfig.ConnectionString));

// Register GameService from backend (no direct SQL/DbContext/migration references)
builder.Services.AddSingleton<GameService>();

// Add CORS for Blazor frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowBlazorApp", policy =>
    {
        policy.WithOrigins("http://localhost:5002", "http://localhost:5000")
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Remove or comment out HTTPS redirection for development
// app.UseHttpsRedirection();

app.UseCors("AllowBlazorApp");
app.UseAuthorization();
app.MapControllers();

app.Run();
