import { configureTelemetry } from "./telemetry.js";

configureTelemetry();

const [{ loadConfig }, { startApp }] = await Promise.all([import("./config.js"), import("./server.js")]);

const config = loadConfig();
await startApp(config);
