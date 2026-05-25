import { spawn } from "node:child_process";

const apiReadyUrl = "http://127.0.0.1:5001/api/health/ping";
const npmCli = process.env.npm_execpath && process.env.npm_execpath !== "undefined"
  ? process.env.npm_execpath
  : null;

async function main() {
  console.log("Preparing dev frontend bundle for the Fastify server...");
  await run("npm", ["run", "build", "-w", "@ps2-challenge/shared"]);
  await run("npm", ["run", "build", "-w", "@ps2-challenge/client"]);

  console.log("");
  console.log("Starting API server and Vite client dev server...");
  console.log("API and built client: http://localhost:5001");
  console.log("Live Vite frontend:  http://localhost:5173");
  console.log("");

  const children = [];
  let stopping = false;

  const stop = () => {
    stopping = true;
    for (const child of children) {
      if (!child.killed) child.kill();
    }
  };

  const watchChild = (child) => {
    child.on("exit", (code, signal) => {
      if (stopping) {
        return;
      }
      if (signal) {
        stop();
        process.exit(1);
      }
      if (code && code !== 0) {
        stop();
        process.exit(code);
      }
    });
  };

  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(143);
  });

  const api = spawnNpm(["run", "dev:server"], { label: "api" });
  children.push(api);
  watchChild(api);

  console.log(`Waiting for API readiness at ${apiReadyUrl}...`);
  await waitForApi(apiReadyUrl, api);
  console.log("API is ready. Starting Vite...");

  const web = spawnNpm(["run", "dev:client"], { label: "web" });
  children.push(web);
  watchChild(web);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = command === "npm"
      ? spawnNpm(args)
      : spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function spawnNpm(args, options = {}) {
  const stdio = options.label ? ["inherit", "pipe", "pipe"] : "inherit";
  let child;
  if (npmCli) {
    child = spawn(process.execPath, [npmCli, ...args], { stdio, shell: false });
  } else {
    const executable = "npm";
    child = spawn(executable, args, { stdio, shell: process.platform === "win32" });
  }

  if (options.label) {
    prefixStream(child.stdout, process.stdout, options.label);
    prefixStream(child.stderr, process.stderr, options.label);
  }

  return child;
}

function prefixStream(stream, output, label) {
  let buffered = "";
  stream?.on("data", (chunk) => {
    const text = buffered + chunk.toString();
    const lines = text.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      output.write(line ? `[${label}] ${line}\n` : "\n");
    }
  });
  stream?.on("end", () => {
    if (buffered) {
      output.write(`[${label}] ${buffered}\n`);
    }
  });
}

async function waitForApi(url, child, timeoutMs = 60_000) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited before becoming ready with exit code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`API server did not become ready within ${timeoutMs / 1000}s${lastError ? ` (${lastError})` : ""}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
