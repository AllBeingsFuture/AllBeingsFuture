import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

type TestElectronBridge = {
  invoke?: (...args: any[]) => Promise<any>
  on?: (...args: any[]) => unknown
  off?: (...args: any[]) => unknown
  once?: (...args: any[]) => unknown
  removeListener?: (...args: any[]) => unknown
  quickOpen?: {
    search?: (...args: any[]) => Promise<any>
    openFile?: (...args: any[]) => Promise<any>
  }
}

type TestWindowBridge = Window & {
  electronAPI?: TestElectronBridge
  electron?: TestElectronBridge
}

const electronBridgeMock = {
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
}
const globalWindow = window as unknown as TestWindowBridge

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!window.ResizeObserver) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {}
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () =>
    ({
      fillStyle: '',
      strokeStyle: '',
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
      putImageData: () => {},
      measureText: () => ({ width: 0 }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: () => {},
    }) as unknown as CanvasRenderingContext2D,
})

if (!globalWindow.electronAPI) {
  Object.defineProperty(globalWindow, 'electronAPI', {
    writable: true,
    value: electronBridgeMock,
  })
}

if (!globalWindow.electron) {
  Object.defineProperty(globalWindow, 'electron', {
    writable: true,
    value: electronBridgeMock,
  })
}
