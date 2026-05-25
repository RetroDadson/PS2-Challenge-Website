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
        Twitch: { ClientId: "base-client", ClientSecret: "base-secret" }
      })
    );
    fs.writeFileSync(
      path.join(settingsDir, "appsettings.Development.json"),
      JSON.stringify({
        ConnectionStrings: { DefaultConnection: "Host=dev;Database=dev_db;Username=dev_user;Password=dev_password" },
        Twitch: { ClientId: "dev-client", ClientSecret: "dev-secret" }
      })
    );

    process.env = {
      APPSETTINGS_DIR: settingsDir,
      ASPNETCORE_ENVIRONMENT: "Development",
      TWITCH_CLIENT_SECRET: "env-secret"
    };

    const config = loadConfig(false);

    expect(config.nodeEnv).toBe("Development");
    expect(config.databaseConnectionString).toBe("postgresql://dev_user:dev_password@dev/dev_db");
    expect(config.twitchClientId).toBe("dev-client");
    expect(config.twitchClientSecret).toBe("env-secret");
  });

  it("resolves Azure-style connection strings, public base URLs, cookie secrets, and App Insights keys", () => {
    process.env = {
      NODE_ENV: "Production",
      PORT: "not-a-number",
      POSTGRESQLCONNSTR_Main: "Host=azure;Database=ps2;Username=app;Password=secret",
      TWITCH_CLIENT_ID: "env-client",
      TWITCH_CLIENT_SECRET: "env-secret",
      PUBLIC_BASE_URL: "https://ps2.example",
      LOG_LEVEL: "debug",
      ADMIN_API_KEY: "legacy-cookie-secret",
      APPINSIGHTS_INSTRUMENTATIONKEY: "instrumentation-key"
    };

    const config = loadConfig();

    expect(config.port).toBe(5001);
    expect(config.databaseConnectionString).toBe("postgresql://app:secret@azure/ps2");
    expect(config.publicBaseUrl).toBe("https://ps2.example");
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
});
