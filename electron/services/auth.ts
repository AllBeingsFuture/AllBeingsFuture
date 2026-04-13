/**
 * AuthService - Authentication state management
 * Replaces Go internal/services/auth.go
 */

import type { Database } from './database.js'

export interface AuthState {
  authenticated: boolean
  token: string
  userId: string
  userName: string
  email: string
  avatarUrl: string
  expiresAt: string
}

export class AuthService {
  private state: AuthState = {
    authenticated: false,
    token: '',
    userId: '',
    userName: '',
    email: '',
    avatarUrl: '',
    expiresAt: '',
  }

  constructor(private db: Database) {
    this.loadState()
  }

  private loadState(): void {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'auth_state'").get() as any
      if (row?.value) {
        this.state = JSON.parse(row.value)
      }
    } catch {}
  }

  private saveState(): void {
    this.db.raw.prepare(
      "INSERT INTO settings (key, value) VALUES ('auth_state', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    ).run(JSON.stringify(this.state), JSON.stringify(this.state))
  }

  getState(): AuthState {
    return { ...this.state }
  }

  updateState(state: Partial<AuthState>): AuthState {
    this.state = { ...this.state, ...state }
    this.saveState()
    return this.getState()
  }

  clearState(): void {
    this.state = {
      authenticated: false,
      token: '',
      userId: '',
      userName: '',
      email: '',
      avatarUrl: '',
      expiresAt: '',
    }
    this.saveState()
  }

  canAccess(_feature: string): boolean {
    return true // No feature gating in Electron version
  }

  isAnonymousAllowed(): boolean {
    return true
  }
}
