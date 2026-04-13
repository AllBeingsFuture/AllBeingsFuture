/**
 * Renderer 侧快捷键工具：统一处理 Ctrl/Cmd 差异与文案展示
 */

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent)
}

/** 统一主修饰键：macOS=Cmd，其他平台=Ctrl */
export function isPrimaryModifierPressed(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return isMacPlatform() ? !!event.metaKey : !!event.ctrlKey
}

/** 将文案中的 Ctrl 快捷键转换为当前平台显示（macOS -> Cmd） */
export function toPlatformShortcutLabel(label: string): string {
  if (!isMacPlatform()) return label
  return label
    .replace(/Ctrl(?=\+)/g, 'Cmd')
    .replace(/\bCtrl\b/g, 'Cmd')
    .replace(/\bAlt\b/g, 'Option')
}
