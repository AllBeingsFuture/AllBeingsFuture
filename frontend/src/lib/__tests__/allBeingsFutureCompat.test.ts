import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installAllBeingsFutureCompat } from '../allBeingsFutureCompat'

const invokeMap = new Map<string, (...args: any[]) => any>()

function mockInvoke(channel: string, ...args: any[]): Promise<any> {
  const handler = invokeMap.get(channel)
  if (handler) return Promise.resolve(handler(...args))
  return Promise.resolve(undefined)
}

beforeEach(() => {
  invokeMap.clear()
  ;(window as any).electronAPI = {
    invoke: vi.fn(mockInvoke),
    on: vi.fn(() => () => {}),
    once: vi.fn(),
    send: vi.fn(),
  }
})

describe('allBeingsFuture compatibility facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'allBeingsFuture')
  })

  it('installs provider, session, app and clipboard bridges', async () => {
    invokeMap.set('ProviderService.GetAll', () => [{ id: 'codex', name: 'Codex' }])
    invokeMap.set('SessionService.GetAll', () => [{ id: 'session-1' }])
    invokeMap.set('SessionService.Create', () => ({ id: 'session-2' }))
    invokeMap.set('SessionService.End', () => undefined)
    invokeMap.set('ProcessService.GetChatState', () => ({
      messages: [{ role: 'assistant', content: 'done' }],
      streaming: false,
      error: '',
    }))
    invokeMap.set('ProcessService.StopProcess', () => undefined)
    invokeMap.set('app:selectDirectory', () => 'C:/repo')
    invokeMap.set('clipboard:writeText', () => undefined)
    invokeMap.set('clipboard:readText', () => 'copied')
    invokeMap.set('UpdateService.GetState', () => ({ status: 'idle' }))
    invokeMap.set('UpdateService.CheckForUpdates', () => ({ status: 'available' }))
    invokeMap.set('UpdateService.OpenDownloadPage', () => 'https://example.com/download')

    installAllBeingsFutureCompat()

    const allBeingsFuture = (window as typeof window & { allBeingsFuture: any }).allBeingsFuture

    await expect(allBeingsFuture.provider.getAll()).resolves.toEqual([{ id: 'codex', name: 'Codex' }])
    await expect(allBeingsFuture.session.getAll()).resolves.toEqual([{ id: 'session-1' }])
    await expect(allBeingsFuture.session.create({ name: 'Test' })).resolves.toEqual({ id: 'session-2' })
    await expect(allBeingsFuture.session.getConversation('session-1')).resolves.toEqual([
      { role: 'assistant', content: 'done' },
    ])

    await allBeingsFuture.session.terminate('session-1')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ProcessService.StopProcess', 'session-1')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('SessionService.End', 'session-1')

    await expect(allBeingsFuture.app.selectDirectory()).resolves.toBe('C:/repo')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:selectDirectory')

    await allBeingsFuture.clipboard.writeText('hello')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('clipboard:writeText', 'hello')
    await expect(allBeingsFuture.clipboard.readText()).resolves.toBe('copied')

    await expect(allBeingsFuture.update.getState()).resolves.toEqual({ status: 'idle' })
    await expect(allBeingsFuture.update.checkForUpdates(true)).resolves.toEqual({ status: 'available' })
    await expect(allBeingsFuture.update.openDownloadPage()).resolves.toBe('https://example.com/download')
  })
})
