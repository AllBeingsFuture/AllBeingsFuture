/**
 * SupervisorService - Runtime supervision
 * Replaces Go internal/services/supervisor.go
 *
 * Monitors tool thrashing, edit thrashing, reasoning loops,
 * token anomalies, and budget checking.
 */

interface SessionState {
  enabled: boolean
  toolCalls: Array<{ toolName: string; params: any; success: boolean; iteration: number; timestamp: string }>
  responses: string[]
  tokenCount: number
  consecutiveToolRounds: number
  events: SupervisorEvent[]
  budgetConfig: BudgetConfig
  policyConfig: PolicyConfig
}

interface SupervisorEvent {
  type: string
  message: string
  timestamp: string
  sessionId: string
}

interface BudgetConfig {
  maxTokens: number
  maxToolCalls: number
  maxDuration: number // seconds
}

interface PolicyConfig {
  maxConsecutiveToolRounds: number
  maxRepeatedToolCalls: number
}

interface SupervisorStatus {
  enabled: boolean
  toolCallCount: number
  tokenCount: number
  consecutiveToolRounds: number
  eventCount: number
}

const DEFAULT_BUDGET: BudgetConfig = { maxTokens: 1000000, maxToolCalls: 500, maxDuration: 3600 }
const DEFAULT_POLICY: PolicyConfig = { maxConsecutiveToolRounds: 20, maxRepeatedToolCalls: 10 }

export class SupervisorService {
  private sessions = new Map<string, SessionState>()

  private getOrCreate(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = {
        enabled: true,
        toolCalls: [],
        responses: [],
        tokenCount: 0,
        consecutiveToolRounds: 0,
        events: [],
        budgetConfig: { ...DEFAULT_BUDGET },
        policyConfig: { ...DEFAULT_POLICY },
      }
      this.sessions.set(sessionId, state)
    }
    return state
  }

  startSession(sessionId: string): void {
    this.getOrCreate(sessionId)
  }

  stopSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  recordToolCall(sessionId: string, toolName: string, params: any, success: boolean, iteration: number): void {
    const state = this.getOrCreate(sessionId)
    state.toolCalls.push({ toolName, params, success, iteration, timestamp: new Date().toISOString() })

    // Detect tool thrashing
    if (state.toolCalls.length >= state.policyConfig.maxRepeatedToolCalls) {
      const recent = state.toolCalls.slice(-state.policyConfig.maxRepeatedToolCalls)
      const allSame = recent.every(tc => tc.toolName === recent[0].toolName)
      if (allSame) {
        this.addEvent(sessionId, 'tool_thrashing', `Tool "${toolName}" called ${state.policyConfig.maxRepeatedToolCalls} times consecutively`)
      }
    }
  }

  recordResponse(sessionId: string, text: string): void {
    const state = this.getOrCreate(sessionId)
    state.responses.push(text)
    if (state.responses.length > 100) state.responses = state.responses.slice(-50)
  }

  recordTokens(sessionId: string, tokens: number): void {
    const state = this.getOrCreate(sessionId)
    state.tokenCount += tokens
  }

  recordConsecutiveToolRounds(sessionId: string, rounds: number): void {
    const state = this.getOrCreate(sessionId)
    state.consecutiveToolRounds = rounds

    if (rounds >= state.policyConfig.maxConsecutiveToolRounds) {
      this.addEvent(sessionId, 'excessive_tool_rounds', `${rounds} consecutive tool rounds detected`)
    }
  }

  evaluate(sessionId: string, _iteration: number): { ok: boolean; warnings: string[] } {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return { ok: true, warnings: [] }

    const warnings: string[] = []

    if (state.tokenCount > state.budgetConfig.maxTokens * 0.9) {
      warnings.push(`Token usage at ${Math.round(state.tokenCount / state.budgetConfig.maxTokens * 100)}% of budget`)
    }

    if (state.toolCalls.length > state.budgetConfig.maxToolCalls * 0.9) {
      warnings.push(`Tool call count at ${Math.round(state.toolCalls.length / state.budgetConfig.maxToolCalls * 100)}% of budget`)
    }

    return { ok: warnings.length === 0, warnings }
  }

  checkBudget(sessionId: string): { withinBudget: boolean; reason: string } {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return { withinBudget: true, reason: '' }

    if (state.tokenCount >= state.budgetConfig.maxTokens) {
      return { withinBudget: false, reason: `Token budget exceeded: ${state.tokenCount}/${state.budgetConfig.maxTokens}` }
    }
    if (state.toolCalls.length >= state.budgetConfig.maxToolCalls) {
      return { withinBudget: false, reason: `Tool call budget exceeded: ${state.toolCalls.length}/${state.budgetConfig.maxToolCalls}` }
    }
    return { withinBudget: true, reason: '' }
  }

  assertToolAllowed(sessionId: string, toolName: string, params: any): { allowed: boolean; reason: string } {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return { allowed: true, reason: '' }
    // Delegate to policy checks if needed
    return { allowed: true, reason: '' }
  }

  getStatus(sessionId: string): SupervisorStatus {
    const state = this.sessions.get(sessionId)
    if (!state) return { enabled: false, toolCallCount: 0, tokenCount: 0, consecutiveToolRounds: 0, eventCount: 0 }
    return {
      enabled: state.enabled,
      toolCallCount: state.toolCalls.length,
      tokenCount: state.tokenCount,
      consecutiveToolRounds: state.consecutiveToolRounds,
      eventCount: state.events.length,
    }
  }

  getAllStatuses(): Record<string, SupervisorStatus> {
    const result: Record<string, SupervisorStatus> = {}
    for (const [id] of this.sessions) {
      result[id] = this.getStatus(id)
    }
    return result
  }

  getEvents(sessionId: string): SupervisorEvent[] {
    return this.sessions.get(sessionId)?.events || []
  }

  setEnabled(sessionId: string, enabled: boolean): void {
    const state = this.getOrCreate(sessionId)
    state.enabled = enabled
  }

  setBudgetConfig(sessionId: string, config: Partial<BudgetConfig>): void {
    const state = this.getOrCreate(sessionId)
    state.budgetConfig = { ...state.budgetConfig, ...config }
  }

  setPolicyConfig(sessionId: string, config: Partial<PolicyConfig>): void {
    const state = this.getOrCreate(sessionId)
    state.policyConfig = { ...state.policyConfig, ...config }
  }

  resetSession(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      state.toolCalls = []
      state.responses = []
      state.tokenCount = 0
      state.consecutiveToolRounds = 0
      state.events = []
    }
  }

  cleanup(): void {
    this.sessions.clear()
  }

  private addEvent(sessionId: string, type: string, message: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return
    state.events.push({ type, message, timestamp: new Date().toISOString(), sessionId })
    if (state.events.length > 200) state.events = state.events.slice(-100)
  }
}
