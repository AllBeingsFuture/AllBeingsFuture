/**
 * OpenCode 专属 Parser 规则
 */

import type { ParserRule } from './types.js'

/**
 * OpenCode 使用 HTTP SDK 模式，主要事件通过结构化 SSE 传递，
 * 此规则文件作为兜底保留，暂无规则。
 */
export const OPENCODE_RULES: ParserRule[] = []
