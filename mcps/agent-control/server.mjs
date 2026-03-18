#!/usr/bin/env node
/**
 * Agent Control MCP Server
 *
 * Provides tools for the main Agent to manage persistent child agents.
 * Communicates with the Electron main process via a lightweight HTTP API.
 *
 * Environment variables (set by the Electron host):
 *   ABF_AGENT_API_PORT      - localhost port of the Agent API
 *   ABF_PARENT_SESSION_ID   - session ID of the parent agent
 */

import http from 'node:http';
import { createInterface } from 'node:readline';

const API_PORT = process.env.ABF_AGENT_API_PORT;
const PARENT_SESSION_ID = process.env.ABF_PARENT_SESSION_ID;

if (!API_PORT || !PARENT_SESSION_ID) {
  process.stderr.write(
    '[agent-control] Fatal: missing ABF_AGENT_API_PORT or ABF_PARENT_SESSION_ID\n',
  );
  process.exit(1);
}

const BASE_URL = `http://127.0.0.1:${API_PORT}`;

// ─── HTTP helper ─────────────────────────────────────────────

function httpRequest(method, urlPath, body, timeoutMs = 600_000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const payload = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ error: data || 'Empty response' });
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });
    req.on('error', reject);

    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Tool definitions ────────────────────────────────────────

const TOOLS = [
  {
    name: 'spawn_agent',
    description:
      'Spawn a new persistent child agent. It stays alive and can receive follow-up messages via send_to_agent. Returns the child session ID and the agent\'s initial response.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name for the agent (e.g. "Research Agent", "Code Review Agent")',
        },
        prompt: {
          type: 'string',
          description: 'Initial instruction / task for the agent',
        },
        provider: {
          type: 'string',
          description:
            'Optional provider type for the child agent, e.g. "codex" or "claude". Defaults to the same provider as the parent session.',
        },
      },
      required: ['name', 'prompt'],
    },
  },
  {
    name: 'send_to_agent',
    description:
      'Send a follow-up message to an existing persistent child agent and wait for its response.',
    inputSchema: {
      type: 'object',
      properties: {
        child_session_id: {
          type: 'string',
          description: 'The child session ID (returned by spawn_agent)',
        },
        message: {
          type: 'string',
          description: 'The message / instruction to send',
        },
      },
      required: ['child_session_id', 'message'],
    },
  },
  {
    name: 'list_agents',
    description:
      'List all persistent child agents spawned by this session with their current status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'close_agent',
    description:
      'Close (terminate) a persistent child agent. Its bridge adapter is destroyed and final result injected into the parent context.',
    inputSchema: {
      type: 'object',
      properties: {
        child_session_id: {
          type: 'string',
          description: 'The child session ID of the agent to close',
        },
      },
      required: ['child_session_id'],
    },
  },
  {
    name: 'wait_agent_idle',
    description:
      'Wait until a persistent child agent finishes its current turn (becomes idle). Returns immediately if the agent already completed its turn. Use this after spawn_agent or send_to_agent when you want to check the result without blocking on the synchronous response.',
    inputSchema: {
      type: 'object',
      properties: {
        child_session_id: {
          type: 'string',
          description: 'The child session ID to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 300000 = 5 min)',
        },
      },
      required: ['child_session_id'],
    },
  },
  {
    name: 'get_agent_output',
    description:
      'Get the output (assistant messages) from a child agent. Optionally limit to the last N lines.',
    inputSchema: {
      type: 'object',
      properties: {
        child_session_id: {
          type: 'string',
          description: 'The child session ID',
        },
        lines: {
          type: 'number',
          description: 'Limit output to last N lines (optional)',
        },
      },
      required: ['child_session_id'],
    },
  },
  {
    name: 'get_agent_status',
    description:
      'Get the current status of a child agent (pending, running, idle, completed, failed, cancelled).',
    inputSchema: {
      type: 'object',
      properties: {
        child_session_id: {
          type: 'string',
          description: 'The child session ID',
        },
      },
      required: ['child_session_id'],
    },
  },

  // ─── Cross-Session Awareness tools ────────────────────────────

  {
    name: 'list_sessions',
    description:
      'List all active and recent sessions in AllBeingsFuture. Use this to understand what other sessions are working on.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: running / idle / completed / error / all (default: all)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'get_session_summary',
    description:
      "Get a summary of a specific session's conversation, including AI responses and tools used.",
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The target session ID',
        },
        max_messages: {
          type: 'number',
          description: 'Maximum number of recent assistant messages to include (default: 10)',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'search_sessions',
    description:
      'Search across all session conversations for specific content. Returns matching sessions with relevant snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matching sessions to return (default: 20)',
        },
      },
      required: ['query'],
    },
  },
];

// ─── Tool handlers ───────────────────────────────────────────

async function handleToolCall(name, args) {
  switch (name) {
    case 'spawn_agent': {
      const res = await httpRequest('POST', '/spawn', {
        parentSessionId: PARENT_SESSION_ID,
        name: args.name,
        prompt: args.prompt,
        providerId: args.provider || undefined,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: [
              `Agent "${args.name}" spawned successfully.`,
              `Child Session ID: ${res.childSessionId}`,
              '',
              `Agent response:`,
              res.result || '(no output)',
            ].join('\n'),
          },
        ],
      };
    }

    case 'send_to_agent': {
      const res = await httpRequest('POST', '/send', {
        parentSessionId: PARENT_SESSION_ID,
        childSessionId: args.child_session_id,
        message: args.message,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Agent response:\n\n${res.result || '(no output)'}`,
          },
        ],
      };
    }

    case 'list_agents': {
      const res = await httpRequest('POST', '/list', {
        parentSessionId: PARENT_SESSION_ID,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      const agents = res.agents || [];
      if (agents.length === 0) {
        return { content: [{ type: 'text', text: 'No child agents found.' }] };
      }
      const lines = agents.map(
        (a) =>
          `- ${a.name} [${a.status}] (ID: ${a.childSessionId})${a.summary ? ` — ${a.summary.slice(0, 120)}` : ''}`,
      );
      return { content: [{ type: 'text', text: `Child agents:\n${lines.join('\n')}` }] };
    }

    case 'close_agent': {
      const res = await httpRequest('POST', '/close', {
        parentSessionId: PARENT_SESSION_ID,
        childSessionId: args.child_session_id,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      return {
        content: [{ type: 'text', text: `Agent ${args.child_session_id} closed successfully.` }],
      };
    }

    case 'wait_agent_idle': {
      const res = await httpRequest('POST', '/wait-idle', {
        parentSessionId: PARENT_SESSION_ID,
        childSessionId: args.child_session_id,
        timeout: args.timeout || 300000,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      const statusText = res.idle ? 'Agent is idle (turn completed)' : 'Agent timed out (still running)';
      return {
        content: [{
          type: 'text',
          text: `${statusText}\n\nOutput:\n${res.output || '(no output)'}`,
        }],
      };
    }

    case 'get_agent_output': {
      const res = await httpRequest('POST', '/get-output', {
        childSessionId: args.child_session_id,
        lines: args.lines || undefined,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      return {
        content: [{
          type: 'text',
          text: res.output || '(no output)',
        }],
      };
    }

    case 'get_agent_status': {
      const res = await httpRequest('POST', '/get-status', {
        parentSessionId: PARENT_SESSION_ID,
        childSessionId: args.child_session_id,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      return {
        content: [{
          type: 'text',
          text: `Agent: ${res.name || 'unknown'}\nStatus: ${res.status}\nID: ${res.agentId}`,
        }],
      };
    }

    // ─── Cross-Session Awareness handlers ──────────────────────

    case 'list_sessions': {
      const res = await httpRequest('POST', '/list-sessions', {
        status: args.status || 'all',
        limit: args.limit || 20,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      const sessions = res.sessions || [];
      if (sessions.length === 0) {
        return { content: [{ type: 'text', text: 'No sessions found.' }] };
      }
      const lines = sessions.map(
        (s) =>
          `- ${s.name} [${s.status}] (ID: ${s.id})${s.parentSessionId ? ' (child)' : ''}\n  Provider: ${s.providerId || 'default'} | Dir: ${s.workDir || 'N/A'} | Created: ${s.createdAt || 'N/A'}`,
      );
      return { content: [{ type: 'text', text: `Sessions (${sessions.length}):\n\n${lines.join('\n\n')}` }] };
    }

    case 'get_session_summary': {
      const res = await httpRequest('POST', '/get-session-summary', {
        sessionId: args.session_id,
        maxMessages: args.max_messages || 10,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      const parts = [
        `Session: ${res.name} [${res.status}]`,
        `ID: ${res.sessionId}`,
        `Provider: ${res.providerId || 'default'}`,
        `Working Dir: ${res.workDir || 'N/A'}`,
        `Created: ${res.createdAt || 'N/A'}`,
      ];
      if (res.toolsUsed && res.toolsUsed.length > 0) {
        parts.push(`\nTools used: ${res.toolsUsed.join(', ')}`);
      }
      if (res.filesModified && res.filesModified.length > 0) {
        parts.push(`\nFiles modified:\n${res.filesModified.map((f) => `  - ${f}`).join('\n')}`);
      }
      if (res.assistantMessages && res.assistantMessages.length > 0) {
        parts.push(`\nRecent assistant messages (${res.assistantMessages.length}):`);
        for (const msg of res.assistantMessages) {
          parts.push(`\n[${msg.timestamp}]\n${msg.content}`);
        }
      }
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }

    case 'search_sessions': {
      const res = await httpRequest('POST', '/search-sessions', {
        query: args.query,
        limit: args.limit || 20,
      });
      if (res.error) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${res.error}` }] };
      }
      const results = res.results || [];
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No sessions match "${args.query}".` }] };
      }
      const parts = [`Search results for "${args.query}" (${results.length} sessions):\n`];
      for (const r of results) {
        parts.push(`--- ${r.name} [${r.status}] (ID: ${r.sessionId}) ---`);
        for (const m of r.matches) {
          parts.push(`  [${m.role}] ${m.snippet}`);
        }
        parts.push('');
      }
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }

    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
  }
}

// ─── MCP Protocol (JSON-RPC over stdio) ──────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'agent-control', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      break;

    case 'notifications/initialized':
      // Notification — no response
      break;

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
      break;

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      try {
        const result = await handleToolCall(name, toolArgs || {});
        send({ jsonrpc: '2.0', id, result });
      } catch (err) {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
          },
        });
      }
      break;
    }

    default:
      // Unknown method — respond with error for requests, ignore notifications
      if (id !== undefined) {
        send({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
      break;
  }
});

rl.on('close', () => {
  process.exit(0);
});

process.stderr.write(
  `[agent-control] MCP server started (API: 127.0.0.1:${API_PORT}, session: ${PARENT_SESSION_ID})\n`,
);
