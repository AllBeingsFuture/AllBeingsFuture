#!/usr/bin/env npx tsx
/**
 * DuckDuckGo based MCP web search server.
 * Available tools: web_search, news_search.
 *
 * This is a standalone MCP server using stdio JSON-RPC transport.
 * Run: npx tsx server.ts
 */

import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

interface WebResult {
  title?: string;
  href?: string;
  link?: string;
  body?: string;
  snippet?: string;
}

interface NewsResult {
  title?: string;
  url?: string;
  link?: string;
  body?: string;
  excerpt?: string;
  date?: string;
  source?: string;
}

function formatWebResults(results: WebResult[]): string {
  if (!results || results.length === 0) return "No relevant results found.";
  return results
    .map((item, i) => {
      const title = item.title ?? "Untitled";
      const url = item.href ?? item.link ?? "";
      const body = item.body ?? item.snippet ?? "";
      return `**${i + 1}. ${title}**\n${url}\n${body}\n`;
    })
    .join("\n");
}

function formatNewsResults(results: NewsResult[]): string {
  if (!results || results.length === 0) return "No relevant news found.";
  return results
    .map((item, i) => {
      const title = item.title ?? "Untitled";
      const url = item.url ?? item.link ?? "";
      const body = item.body ?? item.excerpt ?? "";
      const date = item.date ?? "";
      const source = item.source ?? "";
      const suffix = [source, date].filter(Boolean).join(" ");
      let header = `**${i + 1}. ${title}**`;
      if (suffix) header += ` (${suffix})`;
      return `${header}\n${url}\n${body}\n`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// DuckDuckGo search via HTML-based lite endpoint
// ---------------------------------------------------------------------------

async function ddgWebSearch(
  query: string,
  maxResults: number,
  region: string,
  safesearch: string,
): Promise<WebResult[]> {
  // Use the DuckDuckGo HTML lite search and parse results
  const params = new URLSearchParams({
    q: query,
    kl: region,
    kp: safesearch === "strict" ? "1" : safesearch === "off" ? "-2" : "-1",
  });

  const resp = await fetch(`https://html.duckduckgo.com/html/?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await resp.text();
  const results: WebResult[] = [];

  // Parse result blocks from DDG HTML lite page
  const resultBlockRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const body = match[3].replace(/<[^>]+>/g, "").trim();

    // DDG lite wraps URLs with a redirect; extract the actual URL
    let url = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (title) {
      results.push({ title, href: url, body });
    }
  }

  // Fallback: simpler regex if above didn't match
  if (results.length === 0) {
    const simpleRegex =
      /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const urlRegex =
      /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>/gi;

    const titles: string[] = [];
    const snippets: string[] = [];
    const urls: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = simpleRegex.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, "").trim());
    while ((m = snippetRegex.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
    while ((m = urlRegex.exec(html)) !== null) {
      let u = m[1];
      const uddg = u.match(/uddg=([^&]+)/);
      if (uddg) u = decodeURIComponent(uddg[1]);
      urls.push(u);
    }

    for (let i = 0; i < Math.min(titles.length, maxResults); i++) {
      results.push({
        title: titles[i] || "Untitled",
        href: urls[i] || "",
        body: snippets[i] || "",
      });
    }
  }

  return results;
}

async function ddgNewsSearch(
  query: string,
  maxResults: number,
  region: string,
  safesearch: string,
  _timelimit?: string | null,
): Promise<NewsResult[]> {
  // DuckDuckGo doesn't have a clean news-only HTML endpoint,
  // so we use the same lite endpoint with "news" appended to query
  const params = new URLSearchParams({
    q: `${query} news`,
    kl: region,
    kp: safesearch === "strict" ? "1" : safesearch === "off" ? "-2" : "-1",
  });

  const resp = await fetch(`https://html.duckduckgo.com/html/?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await resp.text();
  const results: NewsResult[] = [];

  const resultBlockRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const body = match[3].replace(/<[^>]+>/g, "").trim();

    let url = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (title) {
      results.push({ title, url, body });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// MCP tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "web_search",
    description: "Search the web using DuckDuckGo.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: {
          type: "number",
          description: "Maximum number of results (1-20, default 5)",
          default: 5,
        },
        region: {
          type: "string",
          description: "Region code (default: wt-wt for worldwide)",
          default: "wt-wt",
        },
        safesearch: {
          type: "string",
          description: "Safe search level: off, moderate, strict",
          default: "moderate",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "news_search",
    description: "Search news using DuckDuckGo.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: {
          type: "number",
          description: "Maximum number of results (1-20, default 5)",
          default: 5,
        },
        region: {
          type: "string",
          description: "Region code (default: wt-wt for worldwide)",
          default: "wt-wt",
        },
        safesearch: {
          type: "string",
          description: "Safe search level: off, moderate, strict",
          default: "moderate",
        },
        timelimit: {
          type: "string",
          description: "Time limit for results (e.g., d for day, w for week, m for month)",
        },
      },
      required: ["query"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleWebSearch(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string;
  let maxResults = (args.max_results as number) ?? 5;
  const region = (args.region as string) ?? "wt-wt";
  const safesearch = (args.safesearch as string) ?? "moderate";

  maxResults = Math.min(Math.max(1, maxResults), 20);

  try {
    const results = await ddgWebSearch(query, maxResults, region, safesearch);
    return formatWebResults(results);
  } catch (err) {
    const e = err as Error;
    return `web_search failed: ${e.constructor.name}: ${e.message}`;
  }
}

async function handleNewsSearch(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string;
  let maxResults = (args.max_results as number) ?? 5;
  const region = (args.region as string) ?? "wt-wt";
  const safesearch = (args.safesearch as string) ?? "moderate";
  const timelimit = (args.timelimit as string) ?? null;

  maxResults = Math.min(Math.max(1, maxResults), 20);

  try {
    const results = await ddgNewsSearch(query, maxResults, region, safesearch, timelimit);
    return formatNewsResults(results);
  } catch (err) {
    const e = err as Error;
    return `news_search failed: ${e.constructor.name}: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC stdio MCP server
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendResponse(response: JsonRpcResponse): void {
  const json = JSON.stringify(response);
  process.stdout.write(json + "\n");
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const { id, method, params } = request;

  switch (method) {
    case "initialize": {
      sendResponse({
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "web-search",
            version: "1.0.0",
          },
        },
      });
      break;
    }

    case "notifications/initialized": {
      // No response needed for notifications
      break;
    }

    case "tools/list": {
      sendResponse({
        jsonrpc: "2.0",
        id: id ?? null,
        result: { tools: TOOLS },
      });
      break;
    }

    case "tools/call": {
      const toolName = (params?.name as string) ?? "";
      const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};

      let text: string;
      if (toolName === "web_search") {
        text = await handleWebSearch(toolArgs);
      } else if (toolName === "news_search") {
        text = await handleNewsSearch(toolArgs);
      } else {
        sendResponse({
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        });
        return;
      }

      sendResponse({
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          content: [{ type: "text", text }],
        },
      });
      break;
    }

    default: {
      if (id != null) {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const request: JsonRpcRequest = JSON.parse(trimmed);
      await handleRequest(request);
    } catch (err) {
      const e = err as Error;
      sendResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `Parse error: ${e.message}` },
      });
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
