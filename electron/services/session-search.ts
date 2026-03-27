/**
 * SessionSearchService - cross-session awareness and search functionality.
 * Extracted from ProcessService.
 */

import type { SessionService } from './session.js'
import type { ChatMessage, SessionState } from './process-types.js'

export class SessionSearchService {
  constructor(
    private sessionService: SessionService,
    private sessionStates: Map<string, SessionState>,
  ) {}

  /**
   * List all sessions (active and recent) for cross-session awareness.
   * Excludes child session internal details to keep the response concise.
   */
  listSessionsForAwareness(
    options: { status?: string; limit?: number } = {},
  ): Array<{
    id: string
    name: string
    status: string
    workDir: string
    createdAt: string
    providerId: string
    parentSessionId: string
  }> {
    const { status = 'all', limit = 20 } = options

    let sessions = this.sessionService.getAll()

    // Filter by status if specified
    if (status && status !== 'all') {
      sessions = sessions.filter((s) => s.status === status)
    }

    // Map to a simplified structure
    const result = sessions.slice(0, limit).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      workDir: s.workingDirectory,
      createdAt: s.startedAt,
      providerId: s.providerId,
      parentSessionId: s.parentSessionId,
    }))

    return result
  }

  /**
   * Get a summary of a specific session's conversation.
   * Includes last N assistant messages, tool calls used, and files modified.
   */
  getSessionSummary(
    sessionId: string,
    maxMessages = 10,
  ): {
    sessionId: string
    name: string
    status: string
    providerId: string
    workDir: string
    createdAt: string
    assistantMessages: Array<{ content: string; timestamp: string }>
    toolsUsed: string[]
    filesModified: string[]
  } | null {
    const session = this.sessionService.getById(sessionId)
    if (!session) return null

    // Get messages from in-memory state or DB
    let messages: ChatMessage[] = []
    const state = this.sessionStates.get(sessionId)
    if (state) {
      messages = state.messages
    } else {
      try {
        messages = JSON.parse(session.messagesJson || '[]')
      } catch {}
    }

    // Extract last N assistant messages
    const assistantMsgs = messages
      .filter((m) => m.role === 'assistant' && m.content)
      .slice(-maxMessages)
      .map((m) => ({
        content: m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content,
        timestamp: m.timestamp,
      }))

    // Collect unique tool names used across all messages
    const toolsSet = new Set<string>()
    for (const m of messages) {
      if (m.toolUse && Array.isArray(m.toolUse)) {
        for (const t of m.toolUse) {
          if (t.name) toolsSet.add(t.name)
        }
      }
    }

    // Extract file paths from tool uses (common patterns: file_path, path, filePath)
    const filesSet = new Set<string>()
    for (const m of messages) {
      if (m.toolUse && Array.isArray(m.toolUse)) {
        for (const t of m.toolUse) {
          const input = t.input || {}
          const filePath = input.file_path || input.path || input.filePath
          if (filePath && typeof filePath === 'string') {
            filesSet.add(filePath)
          }
        }
      }
    }

    return {
      sessionId: session.id,
      name: session.name,
      status: session.status,
      providerId: session.providerId,
      workDir: session.workingDirectory,
      createdAt: session.startedAt,
      assistantMessages: assistantMsgs,
      toolsUsed: Array.from(toolsSet),
      filesModified: Array.from(filesSet),
    }
  }

  /**
   * Search across all session messages for a query string.
   * Returns matching sessions with relevant snippets.
   */
  searchSessions(
    query: string,
    limit = 20,
  ): Array<{
    sessionId: string
    name: string
    status: string
    matches: Array<{ role: string; snippet: string; timestamp: string }>
  }> {
    if (!query || query.trim().length === 0) return []

    const lowerQuery = query.toLowerCase()
    const allSessions = this.sessionService.getAll()
    const results: Array<{
      sessionId: string
      name: string
      status: string
      matches: Array<{ role: string; snippet: string; timestamp: string }>
    }> = []

    for (const session of allSessions) {
      if (results.length >= limit) break

      // Get messages from in-memory state or DB
      let messages: ChatMessage[] = []
      const state = this.sessionStates.get(session.id)
      if (state) {
        messages = state.messages
      } else {
        try {
          messages = JSON.parse(session.messagesJson || '[]')
        } catch {
          continue
        }
      }

      const matches: Array<{ role: string; snippet: string; timestamp: string }> = []

      for (const msg of messages) {
        if (!msg.content) continue
        const lowerContent = msg.content.toLowerCase()
        const idx = lowerContent.indexOf(lowerQuery)
        if (idx === -1) continue

        // Extract a snippet around the match (100 chars before, 200 chars after)
        const start = Math.max(0, idx - 100)
        const end = Math.min(msg.content.length, idx + query.length + 200)
        let snippet = msg.content.slice(start, end)
        if (start > 0) snippet = '...' + snippet
        if (end < msg.content.length) snippet = snippet + '...'

        matches.push({
          role: msg.role,
          snippet,
          timestamp: msg.timestamp,
        })

        // Limit matches per session to avoid huge payloads
        if (matches.length >= 5) break
      }

      if (matches.length > 0) {
        results.push({
          sessionId: session.id,
          name: session.name,
          status: session.status,
          matches,
        })
      }
    }

    return results
  }
}
