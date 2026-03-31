#!/usr/bin/env npx tsx
/**
 * MCP Server Evaluation Harness
 *
 * Evaluates MCP servers by running test questions against them using Claude.
 *
 * Usage:
 *   npx tsx evaluation.ts <eval_file> [options]
 *
 * Options:
 *   -t, --transport <type>    Transport type: stdio, sse, http (default: stdio)
 *   -m, --model <model>       Claude model to use (default: claude-3-7-sonnet-20250219)
 *   -c, --command <cmd>       Command for stdio transport
 *   -a, --args <arg1 arg2>    Arguments for stdio command
 *   -e, --env <KEY=VALUE>     Environment variables for stdio
 *   -u, --url <url>           Server URL for sse/http transport
 *   -H, --header <Key: Val>   HTTP headers for sse/http transport
 *   -o, --output <file>       Output file for report (default: stdout)
 *
 * Examples:
 *   npx tsx evaluation.ts eval.xml -t stdio -c python -a my_server.py
 *   npx tsx evaluation.ts eval.xml -t sse -u https://example.com/mcp -H "Authorization: Bearer token"
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";
import { createConnection, MCPConnection } from "./connections.js";

// ---------------------------------------------------------------------------
// Evaluation prompt
// ---------------------------------------------------------------------------

const EVALUATION_PROMPT = `You are an AI assistant with access to tools.

When given a task, you MUST:
1. Use the available tools to complete the task
2. Provide summary of each step in your approach, wrapped in <summary> tags
3. Provide feedback on the tools provided, wrapped in <feedback> tags
4. Provide your final response, wrapped in <response> tags

Summary Requirements:
- In your <summary> tags, you must explain:
  - The steps you took to complete the task
  - Which tools you used, in what order, and why
  - The inputs you provided to each tool
  - The outputs you received from each tool
  - A summary for how you arrived at the response

Feedback Requirements:
- In your <feedback> tags, provide constructive feedback on the tools:
  - Comment on tool names: Are they clear and descriptive?
  - Comment on input parameters: Are they well-documented? Are required vs optional parameters clear?
  - Comment on descriptions: Do they accurately describe what the tool does?
  - Comment on any errors encountered during tool usage: Did the tool fail to execute? Did the tool return too many tokens?
  - Identify specific areas for improvement and explain WHY they would help
  - Be specific and actionable in your suggestions

Response Requirements:
- Your response should be concise and directly address what was asked
- Always wrap your final response in <response> tags
- If you cannot solve the task return <response>NOT_FOUND</response>
- For numeric responses, provide just the number
- For IDs, provide just the ID
- For names or text, provide the exact text requested
- Your response should go last`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QaPair {
  question: string;
  answer: string;
}

interface ToolMetrics {
  count: number;
  durations: number[];
}

interface EvalResult {
  question: string;
  expected: string;
  actual: string | null;
  score: number;
  total_duration: number;
  tool_calls: Record<string, ToolMetrics>;
  num_tool_calls: number;
  summary: string | null;
  feedback: string | null;
}

// ---------------------------------------------------------------------------
// XML evaluation file parser
// ---------------------------------------------------------------------------

function parseEvaluationFile(filePath: string): QaPair[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const evaluations: QaPair[] = [];

    // Simple XML parsing for <qa_pair><question>...</question><answer>...</answer></qa_pair>
    const qaPairRegex = /<qa_pair>([\s\S]*?)<\/qa_pair>/g;
    let match: RegExpExecArray | null;

    while ((match = qaPairRegex.exec(content)) !== null) {
      const block = match[1];
      const questionMatch = block.match(/<question>([\s\S]*?)<\/question>/);
      const answerMatch = block.match(/<answer>([\s\S]*?)<\/answer>/);

      if (questionMatch && answerMatch) {
        evaluations.push({
          question: questionMatch[1].trim(),
          answer: answerMatch[1].trim(),
        });
      }
    }

    return evaluations;
  } catch (e) {
    console.error(`Error parsing evaluation file ${filePath}: ${(e as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Extract XML content from text
// ---------------------------------------------------------------------------

function extractXmlContent(text: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push(m[1].trim());
  }
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Agent loop - calls Claude API with tool use
// ---------------------------------------------------------------------------

async function agentLoop(
  apiKey: string,
  model: string,
  question: string,
  tools: Array<{ name: string; description: string; input_schema: unknown }>,
  connection: MCPConnection,
): Promise<[string, Record<string, ToolMetrics>]> {
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: question },
  ];

  // Convert tools to Claude API format
  const claudeTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  let response = await callClaude(apiKey, model, messages, claudeTools);
  messages.push({ role: "assistant", content: response.content });

  const toolMetrics: Record<string, ToolMetrics> = {};

  while (response.stop_reason === "tool_use") {
    const toolUse = (response.content as Array<Record<string, unknown>>).find(
      (block: Record<string, unknown>) => block.type === "tool_use",
    );

    if (!toolUse) break;

    const toolName = toolUse.name as string;
    const toolInput = toolUse.input as Record<string, unknown>;

    const toolStart = performance.now();
    let toolResponse: string;
    try {
      const toolResult = await connection.callTool(toolName, toolInput);
      toolResponse =
        typeof toolResult === "object" ? JSON.stringify(toolResult) : String(toolResult);
    } catch (e) {
      toolResponse = `Error executing tool ${toolName}: ${(e as Error).message}\n${(e as Error).stack}`;
    }
    const toolDuration = (performance.now() - toolStart) / 1000;

    if (!toolMetrics[toolName]) {
      toolMetrics[toolName] = { count: 0, durations: [] };
    }
    toolMetrics[toolName].count++;
    toolMetrics[toolName].durations.push(toolDuration);

    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolResponse,
        },
      ],
    });

    response = await callClaude(apiKey, model, messages, claudeTools);
    messages.push({ role: "assistant", content: response.content });
  }

  const responseText = (response.content as Array<Record<string, unknown>>)
    .filter((block: Record<string, unknown>) => block.type === "text")
    .map((block: Record<string, unknown>) => block.text as string)
    .join("");

  return [responseText, toolMetrics];
}

async function callClaude(
  apiKey: string,
  model: string,
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: EVALUATION_PROMPT,
      messages,
      tools,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Evaluate a single task
// ---------------------------------------------------------------------------

async function evaluateSingleTask(
  apiKey: string,
  model: string,
  qaPair: QaPair,
  tools: Array<{ name: string; description: string; input_schema: unknown }>,
  connection: MCPConnection,
  taskIndex: number,
): Promise<EvalResult> {
  const startTime = performance.now();

  console.log(`Task ${taskIndex + 1}: Running task with question: ${qaPair.question}`);
  const [response, toolMetrics] = await agentLoop(
    apiKey,
    model,
    qaPair.question,
    tools,
    connection,
  );

  const responseValue = extractXmlContent(response, "response");
  const summary = extractXmlContent(response, "summary");
  const feedback = extractXmlContent(response, "feedback");

  const durationSeconds = (performance.now() - startTime) / 1000;

  return {
    question: qaPair.question,
    expected: qaPair.answer,
    actual: responseValue,
    score: responseValue === qaPair.answer ? 1 : 0,
    total_duration: durationSeconds,
    tool_calls: toolMetrics,
    num_tool_calls: Object.values(toolMetrics).reduce(
      (sum, m) => sum + m.durations.length,
      0,
    ),
    summary,
    feedback,
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(qaPairs: QaPair[], results: EvalResult[]): string {
  const correct = results.reduce((sum, r) => sum + r.score, 0);
  const accuracy = results.length > 0 ? (correct / results.length) * 100 : 0;
  const avgDuration =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.total_duration, 0) / results.length
      : 0;
  const totalToolCalls = results.reduce((sum, r) => sum + r.num_tool_calls, 0);
  const avgToolCalls = results.length > 0 ? totalToolCalls / results.length : 0;

  let report = `
# Evaluation Report

## Summary

- **Accuracy**: ${correct}/${results.length} (${accuracy.toFixed(1)}%)
- **Average Task Duration**: ${avgDuration.toFixed(2)}s
- **Average Tool Calls per Task**: ${avgToolCalls.toFixed(2)}
- **Total Tool Calls**: ${totalToolCalls}

---
`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const qaPair = qaPairs[i];

    report += `
### Task ${i + 1}

**Question**: ${qaPair.question}
**Ground Truth Answer**: \`${qaPair.answer}\`
**Actual Answer**: \`${result.actual || "N/A"}\`
**Correct**: ${result.score ? "YES" : "NO"}
**Duration**: ${result.total_duration.toFixed(2)}s
**Tool Calls**: ${JSON.stringify(result.tool_calls, null, 2)}

**Summary**
${result.summary || "N/A"}

**Feedback**
${result.feedback || "N/A"}

---
`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// Main evaluation runner
// ---------------------------------------------------------------------------

async function runEvaluation(
  evalPath: string,
  connection: MCPConnection,
  model: string,
): Promise<string> {
  console.log("Starting Evaluation");

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const tools = await connection.listTools();
  console.log(`Loaded ${tools.length} tools from MCP server`);

  const qaPairs = parseEvaluationFile(evalPath);
  console.log(`Loaded ${qaPairs.length} evaluation tasks`);

  const results: EvalResult[] = [];
  for (let i = 0; i < qaPairs.length; i++) {
    console.log(`Processing task ${i + 1}/${qaPairs.length}`);
    const result = await evaluateSingleTask(apiKey, model, qaPairs[i], tools, connection, i);
    results.push(result);
  }

  return generateReport(qaPairs, results);
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseHeaders(headerList: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of headerList) {
    const colonIdx = header.indexOf(":");
    if (colonIdx !== -1) {
      headers[header.slice(0, colonIdx).trim()] = header.slice(colonIdx + 1).trim();
    } else {
      console.warn(`Warning: Ignoring malformed header: ${header}`);
    }
  }
  return headers;
}

function parseEnvVars(envList: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const envVar of envList) {
    const eqIdx = envVar.indexOf("=");
    if (eqIdx !== -1) {
      env[envVar.slice(0, eqIdx).trim()] = envVar.slice(eqIdx + 1).trim();
    } else {
      console.warn(`Warning: Ignoring malformed environment variable: ${envVar}`);
    }
  }
  return env;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  let evalFile = "";
  let transport = "stdio";
  let model = "claude-3-7-sonnet-20250219";
  let command: string | undefined;
  const cmdArgs: string[] = [];
  const envVars: string[] = [];
  let url: string | undefined;
  const headerStrs: string[] = [];
  let outputFile: string | undefined;

  // Parse arguments
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "-t":
      case "--transport":
        transport = argv[++i];
        break;
      case "-m":
      case "--model":
        model = argv[++i];
        break;
      case "-c":
      case "--command":
        command = argv[++i];
        break;
      case "-a":
      case "--args":
        i++;
        while (i < argv.length && !argv[i].startsWith("-")) {
          cmdArgs.push(argv[i++]);
        }
        i--;
        break;
      case "-e":
      case "--env":
        i++;
        while (i < argv.length && !argv[i].startsWith("-")) {
          envVars.push(argv[i++]);
        }
        i--;
        break;
      case "-u":
      case "--url":
        url = argv[++i];
        break;
      case "-H":
      case "--header":
        headerStrs.push(argv[++i]);
        break;
      case "-o":
      case "--output":
        outputFile = argv[++i];
        break;
      default:
        if (!argv[i].startsWith("-")) {
          positional.push(argv[i]);
        }
    }
  }

  if (positional.length > 0) {
    evalFile = positional[0];
  }

  if (!evalFile) {
    console.error(
      "Usage: npx tsx evaluation.ts <eval_file> [options]\n\n" +
        "Options:\n" +
        "  -t, --transport <type>     stdio, sse, http (default: stdio)\n" +
        "  -m, --model <model>        Claude model (default: claude-3-7-sonnet-20250219)\n" +
        "  -c, --command <cmd>        Command for stdio\n" +
        "  -a, --args <arg1 arg2>     Args for stdio command\n" +
        "  -e, --env <KEY=VALUE>      Env vars for stdio\n" +
        "  -u, --url <url>            Server URL for sse/http\n" +
        "  -H, --header <Key: Val>    HTTP headers\n" +
        "  -o, --output <file>        Output file",
    );
    process.exit(1);
  }

  if (!fs.existsSync(evalFile)) {
    console.error(`Error: Evaluation file not found: ${evalFile}`);
    process.exit(1);
  }

  const headers =
    headerStrs.length > 0 ? parseHeaders(headerStrs) : undefined;
  const env =
    envVars.length > 0 ? parseEnvVars(envVars) : undefined;

  let connection: MCPConnection;
  try {
    connection = createConnection({
      transport,
      command,
      args: cmdArgs.length > 0 ? cmdArgs : undefined,
      env,
      url,
      headers,
    });
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`Connecting to MCP server via ${transport}...`);
  await connection.connect();
  console.log("Connected successfully");

  try {
    const report = await runEvaluation(evalFile, connection, model);

    if (outputFile) {
      fs.writeFileSync(outputFile, report);
      console.log(`\nReport saved to ${outputFile}`);
    } else {
      console.log("\n" + report);
    }
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
