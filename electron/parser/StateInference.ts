/**
 * 状态推断引擎
 * 结合 prompt marker 检测和超时推断，判断会话状态
 */

import { EventEmitter } from 'events'
import type { SessionStatus, ProviderStateConfig } from './types.js'
import { THRESHOLDS } from './constants.js'
import {
  TailBuffer,
  stripAnsi,
  chunkContainsPromptMarker,
  looksLikeQuestion,
  normalizeForComparison
} from './ansiUtils.js'

/** 默认状态推断参数 */
const DEFAULT_STATE_CONFIG: Required<ProviderStateConfig> = {
  startupPattern: '',
  idleTimeoutMs: THRESHOLDS.IDLE_TIMEOUT_MS,
  possibleStuckMs: THRESHOLDS.POSSIBLE_STUCK_MS,
  stuckInterventionMs: THRESHOLDS.STUCK_INTERVENTION_MS,
  startupStuckMs: THRESHOLDS.STARTUP_STUCK_MS,
}

/** Prompt marker 检测稳定性参数 */
const PROMPT_STABILITY_DELAY_MS = 1000
const PROMPT_STABILITY_CHECKS = 2

/** 每个会话的 prompt marker 检测状态 */
interface PromptDetectionState {
  tailBuffer: TailBuffer
  promptDetected: boolean
  stabilityChecksRemaining: number
  stabilitySnapshot: string
  stabilityTimer: NodeJS.Timeout | null
  lastNormalized: string
  stableSince: number
}

/**
 * 状态推断引擎
 */
export class StateInference extends EventEmitter {
  private lastOutputTime: Map<string, number> = new Map()
  private sessionStatus: Map<string, SessionStatus> = new Map()
  private notifiedStuck: Set<string> = new Set()
  private notifiedPossibleStuck: Set<string> = new Set()
  private startupPhase: Set<string> = new Set()
  private notifiedStartupStuck: Set<string> = new Set()
  private awaitingUserInput: Set<string> = new Set()
  private intervalId: NodeJS.Timeout | null = null
  private sessionStateConfig: Map<string, Required<ProviderStateConfig>> = new Map()
  private startupPatterns: Map<string, RegExp | null> = new Map()
  private promptDetection: Map<string, PromptDetectionState> = new Map()
  private removedSessions: Set<string> = new Set()

  registerSessionConfig(sessionId: string, config?: ProviderStateConfig): void {
    const merged: Required<ProviderStateConfig> = {
      ...DEFAULT_STATE_CONFIG,
      ...config,
    }
    this.sessionStateConfig.set(sessionId, merged)

    if (merged.startupPattern) {
      try {
        this.startupPatterns.set(sessionId, new RegExp(merged.startupPattern, 'i'))
      } catch {
        this.startupPatterns.set(sessionId, null)
      }
    } else {
      this.startupPatterns.set(sessionId, null)
    }
  }

  private getConfig(sessionId: string): Required<ProviderStateConfig> {
    return this.sessionStateConfig.get(sessionId) || DEFAULT_STATE_CONFIG
  }

  private getOrCreatePromptState(sessionId: string): PromptDetectionState {
    let state = this.promptDetection.get(sessionId)
    if (!state) {
      state = {
        tailBuffer: new TailBuffer(4096),
        promptDetected: false,
        stabilityChecksRemaining: 0,
        stabilitySnapshot: '',
        stabilityTimer: null,
        lastNormalized: '',
        stableSince: Date.now(),
      }
      this.promptDetection.set(sessionId, state)
    }
    return state
  }

  checkStartupPattern(sessionId: string, cleanData: string): boolean {
    const pattern = this.startupPatterns.get(sessionId)
    if (!pattern) return false
    if (!this.startupPhase.has(sessionId)) return false

    if (pattern.test(cleanData)) {
      this.markStartupComplete(sessionId)
      return true
    }
    return false
  }

  onOutputData(sessionId: string, data: string): void {
    if (this.removedSessions.has(sessionId)) return

    const pState = this.getOrCreatePromptState(sessionId)
    const currentStatus = this.sessionStatus.get(sessionId)

    pState.tailBuffer.append(data)

    if (!currentStatus || currentStatus === 'completed' || currentStatus === 'terminated' || currentStatus === 'error') {
      return
    }

    const bufferText = pState.tailBuffer.getText()
    const stripped = stripAnsi(bufferText)
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // 检测确认提示
    if (looksLikeQuestion(bufferText)) {
      if (currentStatus !== 'waiting_input' && currentStatus !== 'paused') {
        this.awaitingUserInput.add(sessionId)
        this.sessionStatus.set(sessionId, 'waiting_input')
        this.emit('status-change', sessionId, 'waiting_input')
      }
      pState.promptDetected = false
      pState.stabilityChecksRemaining = 0
      return
    }

    // 检测 prompt marker
    if (chunkContainsPromptMarker(stripped)) {
      if (!pState.promptDetected) {
        pState.promptDetected = true
        pState.stabilitySnapshot = normalizeForComparison(bufferText)
        pState.stabilityChecksRemaining = PROMPT_STABILITY_CHECKS

        this.schedulePromptStabilityCheck(sessionId, pState)
      }
    }
  }

  private schedulePromptStabilityCheck(sessionId: string, pState: PromptDetectionState): void {
    if (pState.stabilityTimer) {
      clearTimeout(pState.stabilityTimer)
    }

    pState.stabilityTimer = setTimeout(() => {
      pState.stabilityTimer = null

      const currentStatus = this.sessionStatus.get(sessionId)
      if (!currentStatus || currentStatus === 'completed' || currentStatus === 'terminated' || currentStatus === 'error') {
        return
      }

      const bufferText = pState.tailBuffer.getText()
      const currentStripped = stripAnsi(bufferText)
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!chunkContainsPromptMarker(currentStripped)) {
        pState.promptDetected = false
        pState.stabilityChecksRemaining = 0
        pState.stabilitySnapshot = ''
        return
      }

      const currentNormalized = normalizeForComparison(bufferText)
      if (currentNormalized !== pState.stabilitySnapshot) {
        pState.promptDetected = false
        pState.stabilityChecksRemaining = 0
        pState.stabilitySnapshot = ''
        return
      }

      pState.stabilityChecksRemaining--

      if (pState.stabilityChecksRemaining <= 0) {
        pState.promptDetected = false
        pState.stabilitySnapshot = ''

        if (currentStatus !== 'waiting_input' && currentStatus !== 'paused') {
          this.awaitingUserInput.add(sessionId)
          this.sessionStatus.set(sessionId, 'waiting_input')
          this.emit('status-change', sessionId, 'waiting_input')
        }
      } else {
        pState.stabilitySnapshot = currentNormalized
        this.schedulePromptStabilityCheck(sessionId, pState)
      }
    }, PROMPT_STABILITY_DELAY_MS)
  }

  private tick(): void {
    const now = Date.now()

    for (const [sessionId, lastTime] of this.lastOutputTime.entries()) {
      const elapsedMs = now - lastTime
      const currentStatus = this.sessionStatus.get(sessionId)
      const config = this.getConfig(sessionId)

      if (currentStatus === 'completed' || currentStatus === 'terminated' || currentStatus === 'error') {
        continue
      }

      if (this.startupPhase.has(sessionId) && elapsedMs >= config.startupStuckMs) {
        if (!this.notifiedStartupStuck.has(sessionId)) {
          this.notifiedStartupStuck.add(sessionId)
          this.emit('startup-stuck', sessionId)
        }
      }

      const isWaitingUser =
        currentStatus === 'paused' ||
        currentStatus === 'waiting_input' ||
        this.awaitingUserInput.has(sessionId)

      if (elapsedMs >= config.idleTimeoutMs && currentStatus !== 'idle' && !isWaitingUser) {
        this.sessionStatus.set(sessionId, 'idle')
        this.emit('status-change', sessionId, 'idle')
      }

      if (elapsedMs >= config.possibleStuckMs && elapsedMs < config.stuckInterventionMs) {
        if (!isWaitingUser && !this.notifiedPossibleStuck.has(sessionId)) {
          this.notifiedPossibleStuck.add(sessionId)
          this.emit('possible-stuck', sessionId)
        }
      }

      if (elapsedMs >= config.stuckInterventionMs) {
        if (!isWaitingUser && !this.notifiedStuck.has(sessionId)) {
          this.notifiedStuck.add(sessionId)
          this.emit('intervention-needed', sessionId, 'stuck')
        }
      }
    }
  }

  onOutput(sessionId: string, data?: string): void {
    if (this.removedSessions.has(sessionId)) return

    const now = Date.now()
    const current = this.sessionStatus.get(sessionId)
    const wasIdle = current === 'idle'
    const wasWaitingInput = current === 'waiting_input'

    this.lastOutputTime.set(sessionId, now)

    const wasStuck = this.notifiedStuck.has(sessionId) || this.notifiedPossibleStuck.has(sessionId)
    this.notifiedStuck.delete(sessionId)
    this.notifiedPossibleStuck.delete(sessionId)
    if (wasStuck) {
      this.emit('output-recovered', sessionId)
    }

    if (wasIdle || wasWaitingInput) {
      if (data) {
        const substantive = data
          .replace(/\x1B\[[?>=!]*[0-9;]*[a-zA-Z~@`]/g, '')
          .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
          .replace(/\x1B./g, '')
          .replace(/[\x00-\x1f\x7f]/g, '')
          .replace(/\s+/g, '')
          .trim()
        if (substantive.length < 2) {
          return
        }
      }
      this.awaitingUserInput.delete(sessionId)
      this.sessionStatus.set(sessionId, 'running')
      this.emit('status-change', sessionId, 'running')
    } else if (!this.sessionStatus.has(sessionId)) {
      this.sessionStatus.set(sessionId, 'running')
      this.startupPhase.add(sessionId)
    }
  }

  markStartupComplete(sessionId: string): void {
    this.startupPhase.delete(sessionId)
    const wasNotified = this.notifiedStartupStuck.delete(sessionId)
    if (wasNotified) {
      this.emit('startup-recovered', sessionId)
    }
  }

  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.tick(), 2000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  removeSession(sessionId: string): void {
    this.removedSessions.add(sessionId)

    this.lastOutputTime.delete(sessionId)
    this.sessionStatus.delete(sessionId)
    this.notifiedStuck.delete(sessionId)
    this.notifiedPossibleStuck.delete(sessionId)
    this.startupPhase.delete(sessionId)
    this.notifiedStartupStuck.delete(sessionId)
    this.awaitingUserInput.delete(sessionId)
    this.sessionStateConfig.delete(sessionId)
    this.startupPatterns.delete(sessionId)

    const pState = this.promptDetection.get(sessionId)
    if (pState) {
      if (pState.stabilityTimer) clearTimeout(pState.stabilityTimer)
      this.promptDetection.delete(sessionId)
    }
  }

  setSessionStatus(sessionId: string, status: SessionStatus): void {
    if (this.removedSessions.has(sessionId)) return
    this.sessionStatus.set(sessionId, status)
    if (status === 'waiting_input' || status === 'paused') {
      this.awaitingUserInput.add(sessionId)
    } else {
      this.awaitingUserInput.delete(sessionId)
    }
    this.emit('status-change', sessionId, status)
  }

  markAwaitingUserInput(sessionId: string): void {
    if (this.removedSessions.has(sessionId)) return
    this.awaitingUserInput.add(sessionId)
    if (this.sessionStatus.get(sessionId) !== 'paused') {
      this.sessionStatus.set(sessionId, 'waiting_input')
      this.emit('status-change', sessionId, 'waiting_input')
    }
  }

  markWorkStarted(sessionId: string): void {
    if (this.removedSessions.has(sessionId)) return
    this.awaitingUserInput.delete(sessionId)
    this.notifiedStuck.delete(sessionId)
    this.notifiedPossibleStuck.delete(sessionId)
    this.lastOutputTime.set(sessionId, Date.now())
    this.sessionStatus.set(sessionId, 'running')
    this.emit('status-change', sessionId, 'running')

    const pState = this.promptDetection.get(sessionId)
    if (pState) {
      if (pState.stabilityTimer) clearTimeout(pState.stabilityTimer)
      pState.promptDetected = false
      pState.stabilityChecksRemaining = 0
      pState.stabilitySnapshot = ''
      pState.tailBuffer.clear()
    }
  }
}
