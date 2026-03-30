import { create } from 'zustand'
import { SettingsService } from '../../bindings/allbeingsfuture/internal/services'
import { AppSettings } from '../../bindings/allbeingsfuture/internal/models/models'

type ProxyType = 'none' | 'http' | 'socks5'
type VoiceTranscriptionMode = 'openai' | 'volcengine'

interface SettingsState {
  settings: AppSettings
  loaded: boolean

  load: () => Promise<void>
  update: (key: keyof AppSettings, value: string) => Promise<void>
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

const BOOLEAN_SETTING_KEYS = new Set<keyof AppSettings>([
  'autoWorktree',
  'alwaysReplyInChinese',
  'autoLaunch',
  'notificationEnabled',
])

function parseSettingValue(
  settings: AppSettings,
  key: keyof AppSettings,
  value: string,
): AppSettings[keyof AppSettings] {
  if (key === 'fontSize') {
    const nextSize = Number(value)
    return Number.isFinite(nextSize) ? nextSize : settings.fontSize
  }

  if (BOOLEAN_SETTING_KEYS.has(key)) {
    return (value === 'true') as AppSettings[keyof AppSettings]
  }

  return value as AppSettings[keyof AppSettings]
}

function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...current,
    ...patch,
  }
}

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
    const previousSettings = get().settings
    const nextSettings = mergeSettings(previousSettings, {
      [key]: parseSettingValue(previousSettings, key, value),
    } as Partial<AppSettings>)

    set({ settings: nextSettings, loaded: true })

    try {
      await SettingsService.Update(key, value)
    } catch (error) {
      set({ settings: previousSettings, loaded: true })
      throw error
    }
  },

  setProxy: async (type, host, port, username, password) => {
    const previousSettings = get().settings
    const nextSettings = mergeSettings(previousSettings, {
      proxyType: type as AppSettings['proxyType'],
      proxyHost: host,
      proxyPort: port,
      proxyUsername: username ?? '',
      proxyPassword: password ?? '',
    })

    set({ settings: nextSettings, loaded: true })

    try {
      await SettingsService.UpdateBatch({
        proxyType: type,
        proxyHost: host,
        proxyPort: port,
        proxyUsername: username ?? '',
        proxyPassword: password ?? '',
      })
    } catch (error) {
      set({ settings: previousSettings, loaded: true })
      throw error
    }
  },

  setAutoWorktree: async (enabled) => {
    const previousSettings = get().settings
    set((state) => ({ settings: { ...state.settings, autoWorktree: enabled } }))

    try {
      await SettingsService.SetAutoWorktree(enabled)
    } catch (error) {
      set({ settings: previousSettings, loaded: true })
      throw error
    }
  },

  setAutoLaunch: async (enabled) => {
    const previousSettings = get().settings
    set((state) => ({ settings: { ...state.settings, autoLaunch: enabled } }))

    try {
      await SettingsService.SetAutoLaunch(enabled)
    } catch (error) {
      set({ settings: previousSettings, loaded: true })
      throw error
    }
  },

  setNotification: async (enabled) => {
    await get().update('notificationEnabled', String(enabled))
  },

  setLanguage: async (chinese) => {
    await get().update('alwaysReplyInChinese', String(chinese))
  },

  setVoice: async (mode, providerId) => {
    const previousSettings = get().settings
    const nextSettings = mergeSettings(previousSettings, {
      voiceTranscriptionMode: mode as AppSettings['voiceTranscriptionMode'],
      voiceTranscriptionProviderId: providerId,
    })

    set({ settings: nextSettings, loaded: true })

    try {
      await SettingsService.UpdateBatch({
        voiceTranscriptionMode: mode,
        voiceTranscriptionProviderId: providerId,
      })
    } catch (error) {
      set({ settings: previousSettings, loaded: true })
      throw error
    }
  },
}))
