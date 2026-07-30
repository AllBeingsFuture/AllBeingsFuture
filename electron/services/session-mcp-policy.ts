/**
 * Session MCP injection policy (three-generation ABF roles).
 *
 * - top-level (爷爷) + direct-child (父亲): enabled user MCPs + agent-control
 * - nested-child (儿子, parent is itself a child): enabled user MCPs only — never agent-control
 *
 * Pure helpers so unit tests lock behavior without ProcessService mocks.
 */

export type AbfSessionRole = 'top-level' | 'direct-child' | 'nested-child'

export type McpServerConfig = {
  command: string
  args: string[]
  env: Record<string, string>
  cwd?: string
}

/** Built-in orchestration MCP; never inherited by nested sons. */
export const AGENT_CONTROL_MCP_ID = 'agent-control' as const

/**
 * Classify session role for MCP / prompt policy.
 *
 * @param parentSessionId - session.parentSessionId
 * @param parentParentSessionId - parent row's parentSessionId when parent exists;
 *   omit / undefined when there is no parent row (orphan id → treated as direct-child,
 *   same as historical `!parentSession?.parentSessionId`)
 */
export function resolveAbfSessionRole(
  parentSessionId: string | undefined | null,
  parentParentSessionId?: string | null,
): AbfSessionRole {
  const parentId = (parentSessionId || '').trim()
  if (!parentId) return 'top-level'
  const grandparentId = (parentParentSessionId || '').trim()
  if (grandparentId) return 'nested-child'
  return 'direct-child'
}

/** 爷爷 + 父亲 may spawn; 儿子 must not. */
export function shouldInjectAgentControl(role: AbfSessionRole): boolean {
  return role === 'top-level' || role === 'direct-child'
}

/**
 * Build the user-facing MCP map for a session before optional agent-control merge.
 * Nested sons keep enabled user MCPs but never get agent-control (even if a user
 * server accidentally used that identifier).
 */
export function buildUserMcpServersForRole(
  enabledUserMcps: Record<string, McpServerConfig>,
  role: AbfSessionRole,
): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = { ...enabledUserMcps }
  if (role === 'nested-child' && AGENT_CONTROL_MCP_ID in out) {
    delete out[AGENT_CONTROL_MCP_ID]
  }
  return out
}

/**
 * Final mcpServers map: user MCPs (+ agent-control when allowed and provided).
 * When agent-control is allowed but `agentControl` is null/undefined (e.g. API
 * port setup failed), returns user MCPs only.
 */
export function resolveSessionMcpServers(options: {
  role: AbfSessionRole
  enabledUserMcps: Record<string, McpServerConfig>
  agentControl?: McpServerConfig | null
}): Record<string, McpServerConfig> {
  const base = buildUserMcpServersForRole(options.enabledUserMcps, options.role)
  if (shouldInjectAgentControl(options.role) && options.agentControl) {
    base[AGENT_CONTROL_MCP_ID] = options.agentControl
  }
  return base
}
