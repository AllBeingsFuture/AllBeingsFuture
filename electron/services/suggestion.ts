/**
 * SuggestionService - Smart suggestion engine
 * Replaces Go internal/services/suggestion.go
 */

interface Suggestion {
  id: string
  text: string
  type: string
  sessionId: string
  timestamp: string
  dismissed: boolean
}

interface SessionInfo {
  name: string
  status: string
  workDir: string
  lastActivity: string
}

export class SuggestionService {
  private running = false
  private suggestions: Suggestion[] = []
  private sessionInfo = new Map<string, SessionInfo>()
  private activities: Array<{ sessionId: string; type: string; detail: string; timestamp: string }> = []

  start(): void {
    this.running = true
  }

  stop(): void {
    this.running = false
  }

  onActivity(sessionId: string, actType: string, detail: string): void {
    if (!this.running) return

    this.activities.push({
      sessionId,
      type: actType,
      detail,
      timestamp: new Date().toISOString(),
    })

    // Keep only recent activities
    if (this.activities.length > 500) {
      this.activities = this.activities.slice(-250)
    }
  }

  updateSessionInfo(sessionId: string, name: string, status: string, workDir: string): void {
    this.sessionInfo.set(sessionId, {
      name,
      status,
      workDir,
      lastActivity: new Date().toISOString(),
    })
  }

  dismiss(suggestionId: string): void {
    const suggestion = this.suggestions.find(s => s.id === suggestionId)
    if (suggestion) {
      suggestion.dismissed = true
    }
  }

  getActiveSuggestion(): Suggestion | null {
    return this.suggestions.find(s => !s.dismissed) || null
  }
}
