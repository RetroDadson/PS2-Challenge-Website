import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, normalizePostgresConnectionString } from "../src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("config", () => {
  it("normalizes ASP.NET/Npgsql connection strings for node-postgres", () => {
    expect(
      normalizePostgresConnectionString(
        "Host=localhost;Database=dadsons_ps2_challenge;Username=ps2_challenge;Password=SuperSecurePassword123"
      )
    ).toBe("postgresql://ps2_challenge:SuperSecurePassword123@localhost/dadsons_ps2_challenge");
    expect(normalizePostgresConnectionString("postgresql://user:pass@localhost/db")).toBe("postgresql://user:pass@localhost/db");
    expect(normalizePostgresConnectionString("Server=db;Database=challenge;User Id=dadson;Pwd=p a s s;Port=5433;Ssl Mode=Require")).toBe(
      "postgresql://dadson:p%20a%20s%20s@db:5433/challenge?sslmode=verify-full"
    );
    expect(normalizePostgresConnectionString("Host=localhost;Username=user")).toBe("Host=localhost;Username=user");
  });

  it("normalizes Azure Postgres SSL settings without pg SSL-mode warnings", () => {
    expect(
      normalizePostgresConnectionString(
        "Host=pg-retrodadson-prod.postgres.database.azure.com;Port=5432;Database=dadsons_ps2_challenge;Username=ps2_challenge;Password=secret"
      )
    ).toBe("postgresql://ps2_challenge:secret@pg-retrodadson-prod.postgres.database.azure.com:5432/dadsons_ps2_challenge?sslmode=verify-full");
    expect(normalizePostgresConnectionString("postgresql://app:secret@pg-retrodadson-prod.postgres.database.azure.com/ps2?sslmode=require")).toBe(
      "postgresql://app:secret@pg-retrodadson-prod.postgres.database.azure.com/ps2?sslmode=verify-full"
    );
    expect(normalizePostgresConnectionString("Host=db;Database=challenge;Ssl Mode=Verify Full")).toBe(
      "postgresql://db/challenge?sslmode=verify-full"
    );
  });

  it("loads appsettings files using the ASP.NET environment name and lets env vars win", () => {
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ps2-config-"));
    fs.writeFileSync(
      path.join(settingsDir, "appsettings.json"),
      JSON.stringify({
        ConnectionStrings: { DefaultConnection: "Host=base;Database=base_db;Username=base_user;Password=base_password" },
        Twitch: { ClientId: "base-client", ClientSecret: "base-secret", ChannelLogin: "base-channel" },
        YouTube: { ApiKey: "base-youtube-key" }
      })
    );
    fs.writeFileSync(
      path.join(settingsDir, "appsettings.Development.json"),
      JSON.stringify({
        ConnectionStrings: { DefaultConnection: "Host=dev;Database=dev_db;Username=dev_user;Password=dev_password" },
        Twitch: { ClientId: "dev-client", ClientSecret: "dev-secret", ChannelLogin: "dev-channel" },
        YouTube: { ApiKey: "dev-youtube-key" }
      })
    );

    process.env = {
      APPSETTINGS_DIR: settingsDir,
      ASPNETCORE_ENVIRONMENT: "Development",
      TWITCH_CLIENT_SECRET: "env-secret",
      YOUTUBE_API_KEY: "env-youtube-key"
    };

    const config = loadConfig(false);

    expect(config.nodeEnv).toBe("Development");
    expect(config.databaseConnectionString).toBe("postgresql://dev_user:dev_password@dev/dev_db");
    expect(config.twitchClientId).toBe("dev-client");
    expect(config.twitchClientSecret).toBe("env-secret");
    expect(config.twitchChannelLogin).toBe("dev-channel");
    expect(config.youtubeApiKey).toBe("env-youtube-key");
  });

  it("resolves Azure-style connection strings, public base URLs, cookie secrets, and App Insights keys", () => {
    process.env = {
      NODE_ENV: "Production",
      PORT: "not-a-number",
      POSTGRESQLCONNSTR_Main: "Host=azure;Database=ps2;Username=app;Password=secret",
      TWITCH_CLIENT_ID: "env-client",
      TWITCH_CLIENT_SECRET: "env-secret",
      TWITCH_CHANNEL_LOGIN: "env-channel",
      PUBLIC_BASE_URL: "https://ps2.example",
      LOG_LEVEL: "debug",
      ADMIN_API_KEY: "legacy-cookie-secret",
      APPINSIGHTS_INSTRUMENTATIONKEY: "instrumentation-key"
    };

    const config = loadConfig();

    expect(config.port).toBe(5001);
    expect(config.databaseConnectionString).toBe("postgresql://app:secret@azure/ps2");
    expect(config.publicBaseUrl).toBe("https://ps2.example");
    expect(config.twitchChannelLogin).toBe("env-channel");
    expect(config.logLevel).toBe("debug");
    expect(config.cookieSecret).toBe("legacy-cookie-secret");
    expect(config.applicationInsightsConnectionString).toBe("InstrumentationKey=instrumentation-key");
  });

  it("throws a combined validation error outside the test environment", () => {
    process.env = {
      NODE_ENV: "Production"
    };

    expect(() => loadConfig()).toThrow(
      [
        "Environment configuration is invalid:",
        "A database connection string is required (DATABASE_CONNECTION_STRING, apps/server/appsettings.Development.json ConnectionStrings:DefaultConnection, or App Service POSTGRESQLCONNSTR_*)",
        "TWITCH_CLIENT_ID is required",
        "TWITCH_CLIENT_SECRET is required",
        "COOKIE_SECRET or ADMIN_API_KEY is required in Production"
      ].join("\n")
    );
  });

  it("uses npm dev and appsettings PublicBaseUrl fallbacks in development", () => {
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ps2-config-dev-"));
    fs.writeFileSync(
      path.join(settingsDir, "appsettings.json"),
      JSON.stringify({
        PublicBaseUrl: "http://settings-api"
      })
    );
    fs.writeFileSync(
      path.join(settingsDir, "appsettings.Development.json"),
      JSON.stringify({
        ConnectionStrings: { DefaultConnection: "Host=dev;Database=dev_db" },
        Twitch: { ClientId: "settings-client", ClientSecret: "settings-secret" },
        PublicBaseUrl: "http://settings-api"
      })
    );

    process.env = {
      APPSETTINGS_DIR: settingsDir,
      ASPNETCORE_ENVIRONMENT: "Development",
      npm_lifecycle_event: "dev"
    };

    const config = loadConfig(false);

    expect(config.nodeEnv).toBe("Development");
    expect(config.publicBaseUrl).toBe("http://settings-api");
    expect(config.cookieSecret).toHaveLength(64);

    process.env = {
      npm_lifecycle_event: "dev"
    };
    expect(loadConfig(false).nodeEnv).toBe("Development");
  });

  it("uses direct connection settings and runtime defaults in test environments", () => {
    process.env = {
      NODE_ENV: "Test",
      PORT: "6000",
      POSTGRESQLCONNSTR_DefaultConnection: "Host=direct;Database=challenge",
      TWITCH_CLIENT_ID: "client",
      TWITCH_CLIENT_SECRET: "secret"
    };

    const config = loadConfig();

    expect(config.databaseConnectionString).toBe("postgresql://direct/challenge");
    expect(config.publicBaseUrl).toBe("http://localhost:5001");
    expect(config.twitchChannelLogin).toBe("retrodadson");
    expect(config.cookieSecret).toHaveLength(64);
  });

  it("uses ApiBaseUrl and appsetting service fallbacks when environment values are blank", () => {
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ps2-config-api-base-"));
    fs.writeFileSync(path.join(settingsDir, "appsettings.json"), JSON.stringify({
      PublicBaseUrl: null,
      ApiBaseUrl: "https://api-base.example",
      Twitch: { ClientId: "settings-client", ClientSecret: "settings-secret" },
      YouTube: { ApiKey: "settings-youtube-key" }
    }));
    process.env = {
      APPSETTINGS_DIR: settingsDir,
      NODE_ENV: "Testing",
      DATABASE_CONNECTION_STRING: "postgresql://localhost/test",
      TWITCH_CLIENT_ID: "",
      TWITCH_CLIENT_SECRET: "",
      YOUTUBE_API_KEY: ""
    };

    const config = loadConfig();

    expect(config.publicBaseUrl).toBe("https://api-base.example");
    expect(config.twitchClientId).toBe("settings-client");
    expect(config.twitchClientSecret).toBe("settings-secret");
    expect(config.youtubeApiKey).toBe("settings-youtube-key");
  });

  it("preserves opaque connection strings and explicit SSL modes", () => {
    expect(normalizePostgresConnectionString("opaque-connection-name")).toBe("opaque-connection-name");
    expect(normalizePostgresConnectionString("Host=db;Database=challenge;Ssl Mode=disable")).toBe(
      "postgresql://db/challenge?sslmode=disable"
    );
    expect(normalizePostgresConnectionString("not a valid://url")).toBe("not a valid://url");
  });
});
