#!/usr/bin/env npx tsx
/**
 * Lightweight connection handling for MCP servers.
 *
 * Provides MCPConnection classes for stdio, SSE, and HTTP transports.
 * Uses child_process for stdio and native fetch for SSE/HTTP.
 *
 * Usage as a library:
 *   import { createConnection } from "./connections.js";
 *   const conn = createConnection({ transport: "stdio", command: "node", args: ["server.js"] });
 *   await conn.connect();
 *   const tools = await conn.listTools();
 *   await conn.close();
 *
 * Usage as CLI (test a connection):
 *   npx tsx connections.ts --transport stdio --command node --args server.js
 *   npx tsx connections.ts --transport sse --url https://example.com/mcp
 *   npx tsx connections.ts --transport http --url https://example.com/mcp
 */

import { ChildProcess, spawn } from "node:child_process";
import { createInterface, Interface as ReadlineInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolInfo {
  name: string;
  description: string;
  input_schema: unknown;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

export abstract class MCPConnection {
  protected _nextId = 1;

  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;
  abstract sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown>;

  async listTools(): Promise<ToolInfo[]> {
    const result = (await this.sendRequest("tools/list")) as {
      tools: Array<{ name: string; description: string; inputSchema: unknown }>;
    };
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    })) as { content: unknown };
    return result.content;
  }
}

// ---------------------------------------------------------------------------
// Stdio connection
// ---------------------------------------------------------------------------

export class MCPConnectionStdio extends MCPConnection {
  private command: string;
  private args: string[];
  private env: Record<string, string> | undefined;
  private process: ChildProcess | null = null;
  private rl: ReadlineInterface | null = null;
  private pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(command: string, args: string[] = [], env?: Record<string, string>) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async connect(): Promise<void> {
    const envVars = this.env
      ? { ...process.env, ...this.env }
      : process.env;

    this.process = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: envVars as NodeJS.ProcessEnv,
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error("Failed to spawn process with stdio pipes");
    }

    this.rl = createInterface({ input: this.process.stdout, terminal: false });

    this.rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const response: JsonRpcResponse = JSON.parse(trimmed);
        if (response.id != null && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Ignore non-JSON lines
      }
    });

    // Initialize
    await this.sendRequest("initialize");

    // Send initialized notification (no response expected)
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    this.process.stdin!.write(notification + "\n");
  }

  async close(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    // Reject any pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error("Not connected");
    }

    const id = this._nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }
}

// ---------------------------------------------------------------------------
// SSE connection
// ---------------------------------------------------------------------------

export class MCPConnectionSSE extends MCPConnection {
  private url: string;
  private headers: Record<string, string>;

  constructor(url: string, headers: Record<string, string> = {}) {
    super();
    this.url = url;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    await this.sendRequest("initialize");
  }

  async close(): Promise<void> {
    // SSE connections are stateless per-request in this implementation
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this._nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };

    const resp = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(request),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = (await resp.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`${data.error.message} (code: ${data.error.code})`);
    }
    return data.result;
  }
}

// ---------------------------------------------------------------------------
// HTTP (Streamable HTTP) connection
// ---------------------------------------------------------------------------

export class MCPConnectionHTTP extends MCPConnection {
  private url: string;
  private headers: Record<string, string>;

  constructor(url: string, headers: Record<string, string> = {}) {
    super();
    this.url = url;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    await this.sendRequest("initialize");
  }

  async close(): Promise<void> {
    // HTTP connections are stateless per-request in this implementation
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this._nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };

    const resp = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(request),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = (await resp.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`${data.error.message} (code: ${data.error.code})`);
    }
    return data.result;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateConnectionOptions {
  transport: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export function createConnection(options: CreateConnectionOptions): MCPConnection {
  const transport = options.transport.toLowerCase();

  if (transport === "stdio") {
    if (!options.command) {
      throw new Error("Command is required for stdio transport");
    }
    return new MCPConnectionStdio(options.command, options.args, options.env);
  }

  if (transport === "sse") {
    if (!options.url) {
      throw new Error("URL is required for sse transport");
    }
    return new MCPConnectionSSE(options.url, options.headers);
  }

  if (["http", "streamable_http", "streamable-http"].includes(transport)) {
    if (!options.url) {
      throw new Error("URL is required for http transport");
    }
    return new MCPConnectionHTTP(options.url, options.headers);
  }

  throw new Error(
    `Unsupported transport type: ${transport}. Use 'stdio', 'sse', or 'http'`,
  );
}

// ---------------------------------------------------------------------------
// CLI entry point - test a connection
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  let transport = "stdio";
  let command: string | undefined;
  let args: string[] = [];
  let url: string | undefined;
  const headers: Record<string, string> = {};
  const envVars: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--transport":
      case "-t":
        transport = argv[++i];
        break;
      case "--command":
      case "-c":
        command = argv[++i];
        break;
      case "--args":
      case "-a":
        // Collect remaining args until next flag
        i++;
        while (i < argv.length && !argv[i].startsWith("-")) {
          args.push(argv[i++]);
        }
        i--; // Back up one since the loop will increment
        break;
      case "--url":
      case "-u":
        url = argv[++i];
        break;
      case "-H":
      case "--header": {
        const h = argv[++i];
        const colonIdx = h.indexOf(":");
        if (colonIdx !== -1) {
          headers[h.slice(0, colonIdx).trim()] = h.slice(colonIdx + 1).trim();
        }
        break;
      }
      case "--env":
      case "-e": {
        const e = argv[++i];
        const eqIdx = e.indexOf("=");
        if (eqIdx !== -1) {
          envVars[e.slice(0, eqIdx).trim()] = e.slice(eqIdx + 1).trim();
        }
        break;
      }
    }
  }

  const connection = createConnection({
    transport,
    command,
    args: args.length > 0 ? args : undefined,
    env: Object.keys(envVars).length > 0 ? envVars : undefined,
    url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  console.log(`Connecting to MCP server via ${transport}...`);
  await connection.connect();
  console.log("Connected successfully");

  const tools = await connection.listTools();
  console.log(JSON.stringify({ tools }, null, 2));

  await connection.close();
}

// Only run CLI if this is the main module
const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith("connections.ts") || process.argv[1].endsWith("connections.js"));

if (isMainModule) {
  main().catch((err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  });
}
