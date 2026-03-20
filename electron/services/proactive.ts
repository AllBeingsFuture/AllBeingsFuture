/**
 * ProactiveService - Proactive message engine
 * Replaces Go internal/services/proactive.go
 */

interface ProactiveConfig {
  enabled: boolean
  intervalMinutes: number
  maxDailyMessages: number
  quietHoursStart: string
  quietHoursEnd: string
}

interface ProactiveRecord {
  id: string
  message: string
  timestamp: string
  userResponse: string
  responseTimestamp: string
}

interface ProactiveStatus {
  active: boolean
  lastHeartbeat: string
  messagesSentToday: number
  nextScheduled: string
}

const DEFAULT_CONFIG: ProactiveConfig = {
  enabled: false,
  intervalMinutes: 30,
  maxDailyMessages: 5,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
}

export class ProactiveService {
  private config: ProactiveConfig = { ...DEFAULT_CONFIG }
  private records: ProactiveRecord[] = []
  private active = false
  private lastHeartbeat = ''
  private lastUserInteraction = ''
  private timer: ReturnType<typeof setInterval> | null = null

  getConfig(): ProactiveConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<ProactiveConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getStatus(): ProactiveStatus {
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = this.records.filter(r => r.timestamp.startsWith(today)).length

    return {
      active: this.active,
      lastHeartbeat: this.lastHeartbeat,
      messagesSentToday: todayCount,
      nextScheduled: '',
    }
  }

  getRecords(limit: number = 50): ProactiveRecord[] {
    return this.records.slice(-limit)
  }

  heartbeat(): void {
    this.lastHeartbeat = new Date().toISOString()
  }

  processUserResponse(responseText: string, _delayMinutes: number): void {
    if (this.records.length > 0) {
      const last = this.records[this.records.length - 1]
      if (!last.userResponse) {
        last.userResponse = responseText
        last.responseTimestamp = new Date().toISOString()
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    if (!enabled) this.stop()
  }

  start(): void {
    if (this.active) return
    this.active = true
  }

  stop(): void {
    this.active = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  updateUserInteraction(): void {
    this.lastUserInteraction = new Date().toISOString()
  }
}
