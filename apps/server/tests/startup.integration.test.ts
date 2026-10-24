import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase, type IntegrationDatabase } from "./helpers/postgres.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("production startup", () => {
  let db: IntegrationDatabase;
  let server: ChildProcess | undefined;
  let output = "";

  beforeAll(async () => {
    execFileSync(process.execPath, [path.join(serverRoot, "../../node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], {
      cwd: serverRoot,
      stdio: "inherit"
    });
    db = await startIntegrationDatabase();
  }, 180_000);

  afterAll(async () => {
    await stopServer(server);
    await db?.stop();
  });

  it("boots via the npm start command with Azure Monitor enabled and serves /health", async () => {
    const port = await freePort();
    const [command, ...args] = startScript().split(" ");
    expect(command).toBe("node");

    server = spawn(process.execPath, args, {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "Production",
        PORT: String(port),
        DATABASE_CONNECTION_STRING: db.connectionString,
        TWITCH_CLIENT_ID: "startup-client",
        TWITCH_CLIENT_SECRET: "startup-secret",
        COOKIE_SECRET: "startup-cookie-secret",
        LOG_LEVEL: "warn",
        APPLICATIONINSIGHTS_CONNECTION_STRING:
          "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://127.0.0.1:9/;LiveEndpoint=http://127.0.0.1:9/"
      }
    });
    server.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    server.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

    const status = await waitForHealth(server, `http://127.0.0.1:${port}/health`, 60_000);

    expect(status, output).toBe(200);
  }, 90_000);

  function startScript(): string {
    const packageJson = JSON.parse(fs.readFileSync(path.join(serverRoot, "package.json"), "utf8")) as { scripts: { start: string } };
    return packageJson.scripts.start;
  }

  async function waitForHealth(child: ChildProcess, url: string, timeoutMs: number): Promise<number | string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        return `exited with code ${child.exitCode}`;
      }
      const status = await fetch(url).then(
        (response) => response.status,
        () => undefined
      );
      if (status === 200) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return "timed out";
  }
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}
