export function resolveApplicationInsightsConnectionString(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.APPLICATIONINSIGHTS_CONNECTION_STRING ?? (env.APPINSIGHTS_INSTRUMENTATIONKEY ? `InstrumentationKey=${env.APPINSIGHTS_INSTRUMENTATIONKEY}` : undefined);
}
