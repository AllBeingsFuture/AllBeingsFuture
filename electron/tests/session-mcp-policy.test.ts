/**
 * Unit tests: three-gen session MCP injection policy.
 * Nested sons: no agent-control; still keep enabled user MCPs.
 * Top-level + direct child: agent-control when provided.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_CONTROL_MCP_ID,
  buildUserMcpServersForRole,
  resolveAbfSessionRole,
  resolveSessionMcpServers,
  shouldInjectAgentControl,
  type McpServerConfig,
} from '../services/session-mcp-policy.js'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')

function userMcp(id: string): McpServerConfig {
  return {
    command: 'npx',
    args: ['-y', id],
    env: { FROM: id },
  }
}

const agentControl: McpServerConfig = {
  command: 'node',
  args: ['/app/mcps/agent-control/server.mjs'],
  env: {
    ABF_AGENT_API_PORT: '9999',
    ABF_PARENT_SESSION_ID: 'sess-x',
  },
}

const enabledUserMcps: Record<string, McpServerConfig> = {
  mempalace: userMcp('mempalace'),
  'custom-mcp': userMcp('custom-mcp'),
}

test('resolveAbfSessionRole: top-level / direct-child / nested-child', () => {
  assert.equal(resolveAbfSessionRole(''), 'top-level')
  assert.equal(resolveAbfSessionRole(null), 'top-level')
  assert.equal(resolveAbfSessionRole(undefined), 'top-level')
  assert.equal(resolveAbfSessionRole('father-id', ''), 'direct-child')
  assert.equal(resolveAbfSessionRole('father-id', null), 'direct-child')
  // parent row missing → same as !parentSession?.parentSessionId → direct-child
  assert.equal(resolveAbfSessionRole('orphan-parent'), 'direct-child')
  assert.equal(resolveAbfSessionRole('father-id', 'grandpa-id'), 'nested-child')
})

test('shouldInjectAgentControl: only top-level and direct-child', () => {
  assert.equal(shouldInjectAgentControl('top-level'), true)
  assert.equal(shouldInjectAgentControl('direct-child'), true)
  assert.equal(shouldInjectAgentControl('nested-child'), false)
})

test('nested child keeps enabled user MCPs and never gets agent-control', () => {
  const servers = resolveSessionMcpServers({
    role: 'nested-child',
    enabledUserMcps,
    agentControl,
  })
  assert.ok(servers.mempalace, 'nested child must keep mempalace')
  assert.ok(servers['custom-mcp'], 'nested child must keep custom user MCP')
  assert.equal(servers[AGENT_CONTROL_MCP_ID], undefined, 'nested child must not get agent-control')
  assert.deepEqual(Object.keys(servers).sort(), ['custom-mcp', 'mempalace'])
})

test('nested child strips accidental user-supplied agent-control id', () => {
  const withFake = {
    ...enabledUserMcps,
    [AGENT_CONTROL_MCP_ID]: userMcp('evil-agent-control'),
  }
  const stripped = buildUserMcpServersForRole(withFake, 'nested-child')
  assert.equal(stripped[AGENT_CONTROL_MCP_ID], undefined)
  assert.ok(stripped.mempalace)

  const resolved = resolveSessionMcpServers({
    role: 'nested-child',
    enabledUserMcps: withFake,
    agentControl,
  })
  assert.equal(resolved[AGENT_CONTROL_MCP_ID], undefined)
})

test('direct child + top-level get agent-control and same user MCPs', () => {
  for (const role of ['top-level', 'direct-child'] as const) {
    const servers = resolveSessionMcpServers({
      role,
      enabledUserMcps,
      agentControl,
    })
    assert.ok(servers.mempalace, `${role} keeps user MCP`)
    assert.ok(servers['custom-mcp'], `${role} keeps custom MCP`)
    assert.deepEqual(servers[AGENT_CONTROL_MCP_ID], agentControl, `${role} gets agent-control`)
  }
})

test('when agentControl missing, top-level/direct still keep user MCPs only', () => {
  const servers = resolveSessionMcpServers({
    role: 'direct-child',
    enabledUserMcps,
    agentControl: null,
  })
  assert.ok(servers.mempalace)
  assert.equal(servers[AGENT_CONTROL_MCP_ID], undefined)
})

test('empty enabled user MCPs: only agent-control when allowed', () => {
  const top = resolveSessionMcpServers({
    role: 'top-level',
    enabledUserMcps: {},
    agentControl,
  })
  assert.deepEqual(Object.keys(top), [AGENT_CONTROL_MCP_ID])

  const nested = resolveSessionMcpServers({
    role: 'nested-child',
    enabledUserMcps: {},
    agentControl,
  })
  assert.deepEqual(nested, {})
})

test('process.ts wires global getEnabledServerConfigs + role policy (source contract)', () => {
  const source = readFileSync(path.join(workspaceRoot, 'electron/services/process.ts'), 'utf8')
  assert.match(source, /resolveAbfSessionRole/)
  assert.match(source, /resolveSessionMcpServers/)
  assert.match(source, /shouldInjectAgentControl/)
  assert.match(source, /getEnabledServerConfigs\s*\(/)
  assert.match(source, /buildAgentControlMcpConfig/)
  // agent-control only via shouldInjectAgentControl path — not unconditionally for every child
  assert.match(source, /Skipped worker prompt \+ agent-control for nested child/)
  assert.match(source, /Nested child .+ user MCPs injected, skipped/)
  // Must not re-introduce old injectAgentControlMcp-for-all-children pattern name without role gate
  assert.doesNotMatch(
    source,
    /Inject agent-control \+ ABF rules for ALL sessions/,
  )
})
