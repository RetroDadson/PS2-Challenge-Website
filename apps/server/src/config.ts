import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveApplicationInsightsConnectionString } from "./telemetryConfig.js";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseConnectionString: string;
  twitchClientId: string;
  twitchClientSecret: string;
  twitchChannelLogin: string;
  youtubeApiKey?: string;
  publicBaseUrl: string;
  cookieSecret: string;
  logLevel: string;
  applicationInsightsConnectionString?: string;
};

type AppSettings = {
  ConnectionStrings?: {
    DefaultConnection?: string;
  };
  Twitch?: {
    ClientId?: string;
    ClientSecret?: string;
    ChannelLogin?: string;
  };
  YouTube?: {
    ApiKey?: string;
  };
  ApiBaseUrl?: string;
  PublicBaseUrl?: string;
};

function firstEnvWithPrefix(prefix: string): string | undefined {
  const found = Object.entries(process.env).find(([key, value]) => key.toUpperCase().startsWith(prefix.toUpperCase()) && value);
  return found?.[1];
}

function resolveConnectionString(settings: AppSettings): string {
  const raw =
    process.env.POSTGRESQLCONNSTR_DefaultConnection ??
    process.env.CUSTOMCONNSTR_DefaultConnection ??
    firstEnvWithPrefix("POSTGRESQLCONNSTR_") ??
    firstEnvWithPrefix("CUSTOMCONNSTR_") ??
    process.env.DATABASE_CONNECTION_STRING ??
    process.env.ConnectionStrings__DefaultConnection ??
    settings.ConnectionStrings?.DefaultConnection ??
    "";

  return normalizePostgresConnectionString(raw);
}

export function loadConfig(validate = true): AppConfig {
  const nodeEnv = resolveNodeEnv();
  const normalizedNodeEnv = nodeEnv.toLocaleLowerCase("en-GB");
  const settings = loadAppSettings(nodeEnv);
  const port = Number.parseInt(process.env.PORT ?? "5001", 10);
  const databaseConnectionString = resolveConnectionString(settings);
  const twitchClientId = firstNonBlank(process.env.TWITCH_CLIENT_ID, process.env.Twitch__ClientId, settings.Twitch?.ClientId) ?? "";
  const twitchClientSecret = firstNonBlank(process.env.TWITCH_CLIENT_SECRET, process.env.Twitch__ClientSecret, settings.Twitch?.ClientSecret) ?? "";
  const twitchChannelLogin =
    firstNonBlank(process.env.TWITCH_CHANNEL_LOGIN, process.env.Twitch__ChannelLogin, settings.Twitch?.ChannelLogin) ?? "retrodadson";
  const youtubeApiKey = firstNonBlank(process.env.YOUTUBE_API_KEY, process.env.YouTube__ApiKey, settings.YouTube?.ApiKey) ?? "";
  const configuredPort = Number.isFinite(port) ? port : 5001;
  const fallbackPublicBaseUrl = new URL(`http://localhost:${configuredPort}`).toString().replace(/\/$/, "");
  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ?? settings.PublicBaseUrl ?? settings.ApiBaseUrl ?? fallbackPublicBaseUrl;
  const configuredCookieSecret = process.env.COOKIE_SECRET ?? process.env.ADMIN_API_KEY;
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const applicationInsightsConnectionString = resolveApplicationInsightsConnectionString();

  const config: AppConfig = {
    nodeEnv,
    port: configuredPort,
    databaseConnectionString,
    twitchClientId,
    twitchClientSecret,
    twitchChannelLogin,
    youtubeApiKey,
    publicBaseUrl,
    cookieSecret: configuredCookieSecret ?? crypto.randomBytes(32).toString("hex"),
    logLevel,
    ...(applicationInsightsConnectionString ? { applicationInsightsConnectionString } : {})
  };

  if (shouldValidateConfig(validate, normalizedNodeEnv)) {
    validateConfig(config, configuredCookieSecret, normalizedNodeEnv);
  }

  return config;
}

function shouldValidateConfig(validate: boolean, normalizedNodeEnv: string): boolean {
  return validate && normalizedNodeEnv !== "test" && normalizedNodeEnv !== "testing";
}

function validateConfig(config: AppConfig, configuredCookieSecret: string | undefined, normalizedNodeEnv: string): void {
  const errors = configValidationErrors(config, configuredCookieSecret, normalizedNodeEnv);
  if (errors.length) {
    throw new Error(`Environment configuration is invalid:\n${errors.join("\n")}`);
  }
}

function configValidationErrors(config: AppConfig, configuredCookieSecret: string | undefined, normalizedNodeEnv: string): string[] {
  const errors: string[] = [];
  if (!config.databaseConnectionString) {
    errors.push(
      "A database connection string is required (DATABASE_CONNECTION_STRING, apps/server/appsettings.Development.json ConnectionStrings:DefaultConnection, or App Service POSTGRESQLCONNSTR_*)"
    );
  }
  if (!config.twitchClientId) {
    errors.push("TWITCH_CLIENT_ID is required");
  }
  if (!config.twitchClientSecret) {
    errors.push("TWITCH_CLIENT_SECRET is required");
  }
  if (!configuredCookieSecret && normalizedNodeEnv === "production") {
    errors.push("COOKIE_SECRET or ADMIN_API_KEY is required in Production");
  }
  return errors;
}

function resolveNodeEnv(): string {
  return (
    process.env.NODE_ENV ??
    process.env.ASPNETCORE_ENVIRONMENT ??
    process.env.DOTNET_ENVIRONMENT ??
    (process.env.npm_lifecycle_event === "dev" ? "Development" : "Production")
  );
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function loadAppSettings(nodeEnv: string): AppSettings {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const candidates = [
    path.join(repoRoot, "apps", "server", "appsettings.json"),
    path.join(repoRoot, "apps", "server", `appsettings.${nodeEnv}.json`),
    ...(process.env.APPSETTINGS_DIR
      ? [
          path.join(process.env.APPSETTINGS_DIR, "appsettings.json"),
          path.join(process.env.APPSETTINGS_DIR, `appsettings.${nodeEnv}.json`)
        ]
      : [])
  ];

  return candidates.reduce<AppSettings>((settings, candidate) => {
    if (!fs.existsSync(candidate)) {
      return settings;
    }
    return mergeSettings(settings, readJson(candidate));
  }, {});
}

function readJson(filePath: string): AppSettings {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as AppSettings;
}

function mergeSettings(left: AppSettings, right: AppSettings): AppSettings {
  const settings: AppSettings = { ...left, ...right };
  const connectionStrings = mergeSettingsSection(left.ConnectionStrings, right.ConnectionStrings);
  const twitch = mergeSettingsSection(left.Twitch, right.Twitch);
  const youtube = mergeSettingsSection(left.YouTube, right.YouTube);

  if (connectionStrings) {
    settings.ConnectionStrings = connectionStrings;
  } else {
    delete settings.ConnectionStrings;
  }

  if (twitch) {
    settings.Twitch = twitch;
  } else {
    delete settings.Twitch;
  }

  if (youtube) {
    settings.YouTube = youtube;
  } else {
    delete settings.YouTube;
  }

  return settings;
}

function mergeSettingsSection<T extends object>(left: T | undefined, right: T | undefined): T | undefined {
  if (left && right) {
    return { ...left, ...right };
  }
  if (right) {
    return { ...right };
  }
  if (left) {
    return { ...left };
  }
  return undefined;
}

export function normalizePostgresConnectionString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.includes("://")) {
    return normalizePostgresUrlConnectionString(trimmed);
  }

  if (!trimmed.includes("=")) {
    return trimmed;
  }

  const parts = Object.fromEntries(
    trimmed
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        const key = part.slice(0, separator).trim().toLocaleLowerCase("en-GB").replace(/\s+/g, "");
        const partValue = part.slice(separator + 1).trim();
        return [key, partValue] as const;
      })
  );

  const host = parts.host ?? parts.server;
  const database = parts.database ?? parts.db;
  if (!host || !database) {
    return trimmed;
  }

  const username = parts.username ?? parts.userid ?? parts.user;
  const password = parts.password ?? parts.pwd;
  const port = parts.port ? `:${parts.port}` : "";
  const encodedPassword = password ? `:${encodeURIComponent(password)}` : "";
  const credentials = username ? `${encodeURIComponent(username)}${encodedPassword}@` : "";
  const normalizedSslMode = normalizePostgresSslMode(parts.sslmode, host);
  const sslMode = normalizedSslMode ? `?sslmode=${encodeURIComponent(normalizedSslMode)}` : "";

  return `postgresql://${credentials}${host}${port}/${encodeURIComponent(database)}${sslMode}`;
}

function normalizePostgresUrlConnectionString(value: string): string {
  try {
    const url = new URL(value);
    const sslMode = normalizePostgresSslMode(url.searchParams.get("sslmode") ?? undefined, url.hostname);
    if (sslMode) {
      url.searchParams.set("sslmode", sslMode);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function normalizePostgresSslMode(value: string | undefined, host: string): string | undefined {
  const mode = value?.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, "-");
  if (mode === "require" || mode === "verifyfull" || mode === "verify-full") {
    return "verify-full";
  }
  if (mode) {
    return mode;
  }
  return isAzurePostgresHost(host) ? "verify-full" : undefined;
}

function isAzurePostgresHost(host: string): boolean {
  return host.toLocaleLowerCase("en-GB").endsWith(".postgres.database.azure.com");
}
