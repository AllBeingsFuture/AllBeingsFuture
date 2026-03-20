/**
 * 终端管理 Hook
 *
 * 负责 AI 会话终端的生命周期管理和交互。
 * 注意：allbeingsfuture 暂不集成 xterm.js，此 hook 提供 stub 实现。
 * 实际终端输出通过 ConversationView 的消息流展示。
 */

import { type RefObject } from 'react'

interface UseTerminalReturn {
  terminal: null
  fitAddon: null
}

/**
 * 终端 Hook（stub）
 *
 * allbeingsfuture 使用 ConversationView 展示对话，不依赖 xterm.js。
 * 此 hook 保留接口兼容性，实际不创建终端实例。
 */
export default function useTerminal(
  _sessionId: string,
  _containerRef: RefObject<HTMLDivElement>
): UseTerminalReturn {
  return {
    terminal: null,
    fitAddon: null,
  }
}
