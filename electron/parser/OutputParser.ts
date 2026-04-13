/**
 * 输出解析引擎核心
 */

import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { ParserRule, ActivityEvent, ActivityEventType, AIProvider, ParserState } from './types.js'
import { PARSER_RULES } from './rules.js'
import { ConfirmationDetector } from './ConfirmationDetector.js'
import { UsageEstimator } from './UsageEstimator.js'
import { stripAnsi } from './ansiUtils.js'

/** 自定义规则 JSON 格式 */
interface CustomRuleJson {
  type: string
  priority?: number
  patterns: string[]
  detailTemplate: string
}

/**
 * 输出解析引擎
 * 负责解析 CLI 输出，识别活动事件
 */
export class OutputParser extends EventEmitter {
  /** 行缓冲区 */
  private lineBuffer: Map<string, string> = new Map()
  /** 解析器状态映射 */
  private stateMap: Map<string, ParserState> = new Map()
  /** 去重缓存 */
  private dedupeCache: Map<string, Map<string, number>> = new Map()
  /** 会话 → Provider ID 映射 */
  private sessionProviderMap: Map<string, string> = new Map()
  /** Provider → 确认检测器缓存 */
  private providerConfirmDetectors: Map<string, ConfirmationDetector> = new Map()
  /** 已启用结构化读取器的会话 */
  private structuredReaderSessions: Set<string> = new Set()

  /** AI 文本累积 flush 延迟 */
  private readonly TEXT_FLUSH_DELAY = 2000
  /** 普通事件去重窗口 */
  private readonly DEDUPE_WINDOW = 3000
  /** 干预类事件去重窗口 */
  private readonly INTERVENTION_DEDUPE_WINDOW = 30000

  /** 确认请求检测器 */
  private confirmationDetector: ConfirmationDetector
  /** Token 用量估算器 */
  private usageEstimator: UsageEstimator
  /** 解析规则列表 */
  private rules: ParserRule[]
  /** 自定义规则文件路径 */
  private customRulesPath: string
  /** 是否已启动自定义规则文件监听 */
  private fileWatching = false

  constructor() {
    super()
    this.confirmationDetector = new ConfirmationDetector()
    this.usageEstimator = new UsageEstimator()

    this.customRulesPath = path.join(os.homedir(), '.allbeingsfuture', 'custom-rules.json')

    const customRules = this.loadCustomRules()
    this.rules = [...PARSER_RULES, ...customRules].sort((a, b) => b.priority - a.priority)

    this.watchCustomRules()
  }

  private loadCustomRules(): ParserRule[] {
    try {
      if (!fs.existsSync(this.customRulesPath)) return []

      const content = fs.readFileSync(this.customRulesPath, 'utf-8')
      const jsonRules: CustomRuleJson[] = JSON.parse(content)

      if (!Array.isArray(jsonRules)) {
        console.warn('[OutputParser] custom-rules.json must be an array')
        return []
      }

      const parsed: ParserRule[] = []
      for (const rule of jsonRules) {
        const validated = this.validateAndConvertRule(rule)
        if (validated) {
          parsed.push(validated)
        }
      }

      if (parsed.length > 0) {
        console.log(`[OutputParser] Loaded ${parsed.length} custom rules`)
      }
      return parsed
    } catch (err) {
      console.warn('[OutputParser] Failed to load custom rules:', err)
      return []
    }
  }

  private validateAndConvertRule(rule: CustomRuleJson): ParserRule | null {
    if (!rule.type || typeof rule.type !== 'string') {
      console.warn('[OutputParser] Custom rule missing or invalid "type"')
      return null
    }

    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      console.warn(`[OutputParser] Custom rule "${rule.type}" missing or empty "patterns"`)
      return null
    }

    if (!rule.detailTemplate || typeof rule.detailTemplate !== 'string') {
      console.warn(`[OutputParser] Custom rule "${rule.type}" missing "detailTemplate"`)
      return null
    }

    const compiledPatterns: RegExp[] = []
    for (const patternStr of rule.patterns) {
      try {
        compiledPatterns.push(new RegExp(patternStr, 'i'))
      } catch (err) {
        console.warn(`[OutputParser] Invalid regex in rule "${rule.type}": ${patternStr}`)
        return null
      }
    }

    const template = rule.detailTemplate
    const extractDetail = (line: string): string => {
      for (const pattern of compiledPatterns) {
        const match = line.match(pattern)
        if (match) {
          return template.replace(/\$(\d+)/g, (_, idx) => {
            const i = parseInt(idx, 10)
            return (match[i] || '').slice(0, 80)
          })
        }
      }
      return template.replace(/\$\d+/g, '')
    }

    return {
      type: rule.type as ActivityEventType,
      priority: rule.priority ?? 10,
      patterns: compiledPatterns,
      extractDetail
    }
  }

  private watchCustomRules(): void {
    try {
      const dir = path.dirname(this.customRulesPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.watchFile(this.customRulesPath, { interval: 5000 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          console.log('[OutputParser] Custom rules file changed, reloading...')
          const customRules = this.loadCustomRules()
          this.rules = [...PARSER_RULES, ...customRules].sort((a, b) => b.priority - a.priority)
        }
      })
      this.fileWatching = true
    } catch (err) {
      console.warn('[OutputParser] Failed to watch custom rules file:', err)
    }
  }

  stopWatching(): void {
    if (this.fileWatching) {
      fs.unwatchFile(this.customRulesPath)
      this.fileWatching = false
    }
  }

  // ==================== Provider 化方法 ====================

  registerSessionProvider(sessionId: string, provider: AIProvider): void {
    this.sessionProviderMap.set(sessionId, provider.id)

    if (provider.confirmationConfig && !this.providerConfirmDetectors.has(provider.id)) {
      this.providerConfirmDetectors.set(
        provider.id,
        ConfirmationDetector.fromConfig(provider.confirmationConfig)
      )
    }
  }

  setStructuredReaderActive(sessionId: string): void {
    this.structuredReaderSessions.add(sessionId)
  }

  getSessionProviderId(sessionId: string): string {
    return this.sessionProviderMap.get(sessionId) || 'claude-code'
  }

  private getConfirmationDetector(sessionId: string): ConfirmationDetector {
    const providerId = this.getSessionProviderId(sessionId)
    return this.providerConfirmDetectors.get(providerId) || this.confirmationDetector
  }

  private getRulesForSession(sessionId: string): ParserRule[] {
    const providerId = this.getSessionProviderId(sessionId)
    return this.rules.filter(rule => !rule.providerId || rule.providerId === providerId)
  }

  private getOrCreateState(sessionId: string): ParserState {
    if (!this.stateMap.has(sessionId)) {
      this.stateMap.set(sessionId, {
        sessionId,
        lastEventType: null,
        lastOutputTime: Date.now(),
        isThinking: false,
        textBufferLines: [],
        textBufferStartTime: 0,
        flushTimer: null
      })
    }
    return this.stateMap.get(sessionId)!
  }

  private getDedupeWindow(type: ActivityEventType): number {
    if (type === 'waiting_confirmation' || type === 'error') {
      return this.INTERVENTION_DEDUPE_WINDOW
    }
    return this.DEDUPE_WINDOW
  }

  private isDuplicate(sessionId: string, type: ActivityEventType, detail: string): boolean {
    if (!this.dedupeCache.has(sessionId)) {
      this.dedupeCache.set(sessionId, new Map())
    }
    const cache = this.dedupeCache.get(sessionId)!
    const key = `${type}::${detail}`
    const now = Date.now()
    const lastTime = cache.get(key)
    const window = this.getDedupeWindow(type)

    if (lastTime && (now - lastTime) < window) {
      return true
    }

    cache.set(key, now)

    if (cache.size > 100) {
      const maxWindow = Math.max(this.DEDUPE_WINDOW, this.INTERVENTION_DEDUPE_WINDOW)
      for (const [k, t] of cache.entries()) {
        if (now - t > maxWindow * 2) {
          cache.delete(k)
        }
      }
    }

    return false
  }

  clearInterventionDedupe(sessionId: string): void {
    const cache = this.dedupeCache.get(sessionId)
    if (!cache) return

    for (const key of cache.keys()) {
      if (key.startsWith('waiting_confirmation::') || key.startsWith('error::')) {
        cache.delete(key)
      }
    }
  }

  private isSignificantText(line: string): boolean {
    if (line.length < 8) return false
    if (/^[\s\d\W]+$/.test(line)) return false
    if (/^[A-Z]:\\|^\/[\w/]/.test(line) && !line.includes(' ')) return false
    if (/^ {4,}\S/.test(line)) return false
    if (/^[-=─━_]{3,}$/.test(line)) return false
    return /[a-zA-Z\u4e00-\u9fff]/.test(line)
  }

  private flushTextBuffer(sessionId: string, state: ParserState): void {
    if (state.textBufferLines.length === 0) return

    if (state.flushTimer) {
      clearTimeout(state.flushTimer)
      state.flushTimer = null
    }

    const fullText = state.textBufferLines.join('\n').trim()
    if (fullText.length < 8) {
      state.textBufferLines = []
      return
    }

    const preview = fullText.length > 150
      ? fullText.slice(0, 150) + '...'
      : fullText

    if (!this.isDuplicate(sessionId, 'assistant_message', preview)) {
      const event: ActivityEvent = {
        id: uuidv4(),
        sessionId,
        type: 'assistant_message',
        timestamp: new Date(state.textBufferStartTime).toISOString(),
        detail: preview,
        metadata: {
          lineCount: state.textBufferLines.length,
          fullLength: fullText.length
        }
      }

      this.emit('activity', sessionId, event)

      if (fullText.length >= 20) {
        this.emit('ai-response', sessionId, fullText)
      }
    }

    state.textBufferLines = []
    state.textBufferStartTime = 0
  }

  private scheduleFlush(sessionId: string, state: ParserState): void {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer)
    }
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null
      this.flushTextBuffer(sessionId, state)
    }, this.TEXT_FLUSH_DELAY)
  }

  private parseLine(sessionId: string, line: string, state: ParserState): void {
    let cleanLine = stripAnsi(line)

    if (cleanLine.includes('\r')) {
      const segments = cleanLine.split('\r')
      cleanLine = segments.filter(s => s.length > 0).pop() || ''
    }

    const trimmed = cleanLine.trim()
    if (trimmed.length < 3) return

    // 检查确认请求
    const detector = this.getConfirmationDetector(sessionId)
    const confirmation = detector.detect(cleanLine)
    if (confirmation) {
      if (this.isDuplicate(sessionId, 'waiting_confirmation', confirmation.promptText)) return

      this.flushTextBuffer(sessionId, state)

      const event: ActivityEvent = {
        id: uuidv4(),
        sessionId,
        type: 'waiting_confirmation',
        timestamp: new Date().toISOString(),
        detail: confirmation.promptText,
        metadata: {
          confidence: confirmation.confidence,
          originalLine: confirmation.originalLine
        }
      }

      state.lastEventType = 'waiting_confirmation'
      state.lastOutputTime = Date.now()

      this.emit('activity', sessionId, event)
      this.emit('intervention-needed', sessionId, 'confirmation')
      return
    }

    // 按优先级匹配规则
    const applicableRules = this.getRulesForSession(sessionId)
    for (const rule of applicableRules) {
      let matched = false

      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0
        if (pattern.test(cleanLine)) {
          matched = true
          break
        }
      }

      if (matched) {
        if (rule.type === 'error' && this.structuredReaderSessions.has(sessionId)) {
          return
        }

        const detail = rule.extractDetail(cleanLine)

        if (this.isDuplicate(sessionId, rule.type, detail)) return

        this.flushTextBuffer(sessionId, state)

        const event: ActivityEvent = {
          id: uuidv4(),
          sessionId,
          type: rule.type,
          timestamp: new Date().toISOString(),
          detail,
          metadata: {
            originalLine: trimmed
          }
        }

        state.lastEventType = rule.type
        state.lastOutputTime = Date.now()

        if (rule.type === 'thinking') {
          state.isThinking = true
        } else if (state.isThinking) {
          state.isThinking = false
        }

        this.emit('activity', sessionId, event)

        if (rule.type === 'error') {
          this.emit('intervention-needed', sessionId, 'error')
        }

        return
      }
    }

    // 没有规则命中：检查是否为有意义的 AI 文本
    if (this.isSignificantText(trimmed)) {
      if (state.textBufferLines.length === 0) {
        state.textBufferStartTime = Date.now()
      }
      state.textBufferLines.push(trimmed)
      this.scheduleFlush(sessionId, state)
    }
  }

  /**
   * 喂入输出数据
   */
  feed(sessionId: string, data: string): void {
    this.usageEstimator.accumulateUsage(sessionId, data)

    const state = this.getOrCreateState(sessionId)

    const buffer = this.lineBuffer.get(sessionId) || ''
    const newBuffer = buffer + data

    const incompleteLineStartIndex = newBuffer.lastIndexOf('\n')
    if (incompleteLineStartIndex === -1) {
      this.lineBuffer.set(sessionId, newBuffer)
      return
    }

    const incompleteLine = newBuffer.slice(incompleteLineStartIndex + 1)
    this.lineBuffer.set(sessionId, incompleteLine)

    const completeLines = newBuffer.slice(0, incompleteLineStartIndex).split('\n')

    for (const line of completeLines) {
      this.parseLine(sessionId, line, state)
    }
  }

  getUsageSummary() {
    return this.usageEstimator.getSummary()
  }

  getSessionUsage(sessionId: string): number {
    return this.usageEstimator.getSessionUsage(sessionId)
  }

  getUsageEstimator(): UsageEstimator {
    return this.usageEstimator
  }

  markSessionEnded(sessionId: string): void {
    const state = this.stateMap.get(sessionId)
    if (state) {
      this.flushTextBuffer(sessionId, state)
    }
    this.usageEstimator.markSessionEnded(sessionId)
  }

  clearSession(sessionId: string): void {
    const state = this.stateMap.get(sessionId)
    if (state?.flushTimer) {
      clearTimeout(state.flushTimer)
    }
    this.lineBuffer.delete(sessionId)
    this.stateMap.delete(sessionId)
    this.dedupeCache.delete(sessionId)
    this.sessionProviderMap.delete(sessionId)
    this.structuredReaderSessions.delete(sessionId)
    this.usageEstimator.resetSessionUsage(sessionId)
  }

  cleanupUsage(): void {
    this.usageEstimator.cleanup()
  }
}
