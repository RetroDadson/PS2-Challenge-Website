import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { loadConfig } from "./config.js";
import { startApp } from "./server.js";

const config = loadConfig();

if (config.applicationInsightsConnectionString) {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: config.applicationInsightsConnectionString
    }
  });
}

await startApp(config);
