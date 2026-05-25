import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { resolveApplicationInsightsConnectionString } from "./telemetryConfig.js";

export function configureTelemetry(): void {
  const connectionString = resolveApplicationInsightsConnectionString();
  if (!connectionString) {
    return;
  }

  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString
    },
    enableLiveMetrics: true,
    enableStandardMetrics: true,
    instrumentationOptions: {
      http: { enabled: true },
      postgreSql: { enabled: true }
    }
  });
}
