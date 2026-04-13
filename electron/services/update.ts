/**
 * UpdateService - Application update management
 * Replaces Go internal/services/update.go
 */

import { shell } from 'electron'

export interface UpdateState {
  available: boolean
  version: string
  downloading: boolean
  downloadProgress: number
  releaseNotes: string
  lastCheck: string
}

const RELEASE_URL = 'https://github.com/1291564486/AllBeingsFuture/releases'

export class UpdateService {
  private state: UpdateState = {
    available: false,
    version: '',
    downloading: false,
    downloadProgress: 0,
    releaseNotes: '',
    lastCheck: '',
  }

  init(): void {
    // Auto-check on startup could be added here
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  async checkForUpdates(manual: boolean): Promise<UpdateState> {
    this.state.lastCheck = new Date().toISOString()
    // In Electron version, update checking would use electron-updater
    // For now, return current state
    if (manual) {
      console.log('[update] Manual update check triggered')
    }
    return this.getState()
  }

  async openDownloadPage(): Promise<string> {
    await shell.openExternal(RELEASE_URL)
    return RELEASE_URL
  }
}
