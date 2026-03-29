import { create } from 'zustand'
import { SettingsService } from '../../bindings/allbeingsfuture/internal/services'
import { AppSettings } from '../../bindings/allbeingsfuture/internal/models/models'

type ProxyType = 'none' | 'http' | 'socks5'
type VoiceTranscriptionMode = 'openai' | 'volcengine'

interface SettingsState {
  settings: AppSettings
  loaded: boolean

  load: () => Promise<void>
  update: (key: string, value: string) => Promise<void>
  setProxy: (type: ProxyType, host: string, port: string, username?: string, password?: string) => Promise<void>
  setAutoWorktree: (enabled: boolean) => Promise<void>
  setAutoLaunch: (enabled: boolean) => Promise<void>
  setNotification: (enabled: boolean) => Promise<void>
  setLanguage: (chinese: boolean) => Promise<void>
  setVoice: (mode: VoiceTranscriptionMode, providerId: string) => Promise<void>
}

const defaultSettings = AppSettings.createFrom({
  proxyType: 'none' as AppSettings['proxyType'],
  voiceTranscriptionMode: 'openai' as AppSettings['voiceTranscriptionMode'],
  autoWorktree: true,
  alwaysReplyInChinese: true,
  autoLaunch: false,
  notificationEnabled: true,
  fontSize: 14,
  theme: 'dark',
})

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  loaded: false,

  load: async () => {
    try {
      const s = await SettingsService.GetAll()
      if (s) set({ settings: s, loaded: true })
    } catch { /* use defaults */ }
  },

  update: async (key, value) => {
    await SettingsService.Update(key, value)
    await get().load()
  },

  setProxy: async (type, host, port, username, password) => {
    await SettingsService.UpdateBatch({
      proxyType: type,
      proxyHost: host,
      proxyPort: port,
      proxyUsername: username ?? '',
      proxyPassword: password ?? '',
    })
    await get().load()
  },

  setAutoWorktree: async (enabled) => {
    await SettingsService.SetAutoWorktree(enabled)
    set(s => ({ settings: { ...s.settings, autoWorktree: enabled } }))
  },

  setAutoLaunch: async (enabled) => {
    await SettingsService.SetAutoLaunch(enabled)
    set(s => ({ settings: { ...s.settings, autoLaunch: enabled } }))
  },

  setNotification: async (enabled) => {
    await get().update('notificationEnabled', String(enabled))
  },

  setLanguage: async (chinese) => {
    await get().update('alwaysReplyInChinese', String(chinese))
  },

  setVoice: async (mode, providerId) => {
    await SettingsService.UpdateBatch({
      voiceTranscriptionMode: mode,
      voiceTranscriptionProviderId: providerId,
    })
    await get().load()
  },
}))
