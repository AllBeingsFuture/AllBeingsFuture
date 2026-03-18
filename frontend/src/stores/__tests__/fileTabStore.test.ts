import { describe, expect, it, vi } from 'vitest'
import { useFileTabStore } from '../fileTabStore'

describe('fileTabStore', () => {
  it('opens a file and sets content', async () => {
    ;(window as any).allBeingsFuture = { fileManager: { readFile: vi.fn().mockResolvedValue({ content: 'hello' }) } }
    await useFileTabStore.getState().openFile('C:/repo/test.txt')
    const tab = useFileTabStore.getState().tabs[0]
    expect(tab.content).toBe('hello')
  })
})
