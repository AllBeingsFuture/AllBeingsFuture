/**
 * 确认请求检测器
 * 支持按 Provider 配置不同的确认模式
 */

import type { ConfirmationDetection, ProviderConfirmationConfig } from './types.js'

/** 默认高置信度确认模式 */
const DEFAULT_HIGH_PATTERNS = [
  /\(Y\/n\)/,
  /\(y\/N\)/,
  /\[Y\/n\]/i,
  /\[y\/N\]/i,
  /\(yes\/no\)/i,
]

/** 默认中等置信度确认模式 */
const DEFAULT_MEDIUM_PATTERNS = [
  /Do you want to proceed/i,
  /Continue\?/i,
  /Are you sure/i,
]

/**
 * 确认请求检测器
 */
export class ConfirmationDetector {
  private highPatterns: RegExp[]
  private mediumPatterns: RegExp[]

  constructor(highPatterns?: RegExp[], mediumPatterns?: RegExp[]) {
    this.highPatterns = highPatterns || DEFAULT_HIGH_PATTERNS
    this.mediumPatterns = mediumPatterns || DEFAULT_MEDIUM_PATTERNS
  }

  /**
   * 从 Provider 配置创建检测器实例
   */
  static fromConfig(config: ProviderConfirmationConfig): ConfirmationDetector {
    const high = config.highPatterns.map(p => {
      try { return new RegExp(p, 'i') } catch { return null }
    }).filter((r): r is RegExp => r !== null)

    const medium = config.mediumPatterns.map(p => {
      try { return new RegExp(p, 'i') } catch { return null }
    }).filter((r): r is RegExp => r !== null)

    return new ConfirmationDetector(
      [...high, ...DEFAULT_HIGH_PATTERNS],
      [...medium, ...DEFAULT_MEDIUM_PATTERNS]
    )
  }

  /**
   * 检测输出行是否包含确认请求
   */
  detect(line: string): ConfirmationDetection | null {
    for (const pattern of this.highPatterns) {
      if (pattern.test(line)) {
        const match = line.match(/Allow\s+(.+?)\s*\?/i)
        return {
          confidence: 'high',
          promptText: match ? match[1] : line.trim(),
          originalLine: line
        }
      }
    }

    for (const pattern of this.mediumPatterns) {
      if (pattern.test(line)) {
        return {
          confidence: 'medium',
          promptText: line.trim(),
          originalLine: line
        }
      }
    }

    return null
  }
}
