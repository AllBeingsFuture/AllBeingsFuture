#!/usr/bin/env npx tsx
/**
 * Start one or more servers, wait for them to be ready, run a command, then clean up.
 *
 * Usage:
 *   # Single server
 *   npx tsx scripts/with_server.ts --server "npm run dev" --port 5173 -- npx tsx automation.ts
 *
 *   # Multiple servers
 *   npx tsx scripts/with_server.ts \
 *     --server "cd backend && python server.py" --port 3000 \
 *     --server "cd frontend && npm run dev" --port 5173 \
 *     -- npx tsx test.ts
 */

import { spawn, spawnSync, ChildProcess } from "child_process";
import * as net from "net";

function isServerReady(port: number, timeout: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const tryConnect = () => {
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }

      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.on("timeout", () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.connect(port, "localhost");
    };

    tryConnect();
  });
}

interface ParsedArgs {
  servers: string[];
  ports: number[];
  timeout: number;
  command: string[];
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const servers: string[] = [];
  const ports: number[] = [];
  let timeout = 30;
  let command: string[] = [];
  let seenSeparator = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") {
      seenSeparator = true;
      command = args.slice(i + 1);
      break;
    }

    switch (args[i]) {
      case "--server":
        servers.push(args[++i]);
        break;
      case "--port":
        ports.push(parseInt(args[++i], 10));
        break;
      case "--timeout":
        timeout = parseInt(args[++i], 10);
        break;
      default:
        // If we haven't seen -- separator, remaining args might be the command
        if (!seenSeparator) {
          command = args.slice(i);
          i = args.length; // break the loop
        }
        break;
    }
  }

  return { servers, ports, timeout, command };
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.command.length === 0) {
    console.error("Error: No command specified to run");
    process.exit(1);
  }

  if (args.servers.length === 0) {
    console.error("Error: No --server specified");
    process.exit(1);
  }

  if (args.servers.length !== args.ports.length) {
    console.error(
      "Error: Number of --server and --port arguments must match"
    );
    process.exit(1);
  }

  const serverConfigs = args.servers.map((cmd, i) => ({
    cmd,
    port: args.ports[i],
  }));

  const serverProcesses: ChildProcess[] = [];

  const cleanup = () => {
    console.log(`\nStopping ${serverProcesses.length} server(s)...`);
    for (let i = 0; i < serverProcesses.length; i++) {
      try {
        serverProcesses[i].kill("SIGTERM");
        console.log(`Server ${i + 1} stopped`);
      } catch {
        try {
          serverProcesses[i].kill("SIGKILL");
        } catch {
          // already dead
        }
      }
    }
    console.log("All servers stopped");
  };

  try {
    // Start all servers
    for (let i = 0; i < serverConfigs.length; i++) {
      const server = serverConfigs[i];
      console.log(
        `Starting server ${i + 1}/${serverConfigs.length}: ${server.cmd}`
      );

      // Use shell=true to support commands with cd and &&
      const proc = spawn(server.cmd, [], {
        shell: true,
        stdio: "pipe",
      });
      serverProcesses.push(proc);

      // Wait for this server to be ready
      console.log(`Waiting for server on port ${server.port}...`);
      const ready = await isServerReady(
        server.port,
        args.timeout * 1000
      );
      if (!ready) {
        throw new Error(
          `Server failed to start on port ${server.port} within ${args.timeout}s`
        );
      }

      console.log(`Server ready on port ${server.port}`);
    }

    console.log(`\nAll ${serverConfigs.length} server(s) ready`);

    // Run the command
    console.log(`Running: ${args.command.join(" ")}\n`);
    const result = spawnSync(args.command[0], args.command.slice(1), {
      stdio: "inherit",
    });

    cleanup();
    process.exit(result.status ?? 1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    cleanup();
    process.exit(1);
  }
}

main();
