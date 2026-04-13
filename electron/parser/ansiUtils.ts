/**
 * ANSI 工具函数 — 终端输出清洗与 Tail Buffer
 */

// ANSI 转义序列正则
const ANSI_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g

/**
 * 移除所有 ANSI 转义序列
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

/**
 * 用于 quiescence 检测时对比输出是否变化
 */
export function normalizeForComparison(text: string): string {
  return stripAnsi(text)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\d+%\s*context\s*(left|remaining|used)/gi, '')
    .replace(/\d+(\.\d+)?%/g, '')
    .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '')
    .replace(/\?\s*for\s*shortcuts?/gi, '')
    .replace(/Run\s+\/\w+\s+on\s+my\s+current\s+changes/gi, '')
    .replace(/Working\s*\(\d+s\s*[•·]\s*esc to interrupt\)/gi, '')
    .replace(/Waiting for auth[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 保留最后 maxSize 个字符的尾部缓冲区
 */
export class TailBuffer {
  private buffer: string = ''
  private maxSize: number
  private _totalAppended: number = 0

  constructor(maxSize: number = 4096) {
    this.maxSize = maxSize
  }

  append(text: string): void {
    this._totalAppended += text.length
    this.buffer += text
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize)
    }
  }

  getText(): string {
    return this.buffer
  }

  getLastChars(n: number): string {
    return this.buffer.slice(-n)
  }

  clear(): void {
    this.buffer = ''
    this._totalAppended = 0
  }

  get length(): number {
    return this.buffer.length
  }

  get totalAppended(): number {
    return this._totalAppended
  }
}

/** 默认 prompt marker 正则数组 */
export const DEFAULT_PROMPT_MARKERS: RegExp[] = [
  /❯/,
  /›/,
  />\s/,
  /\$\s*$/,
  /✦/,
]

/**
 * 检查文本最后 200 字符中是否包含已知的 prompt marker
 */
export function chunkContainsPromptMarker(text: string, markers?: RegExp[]): boolean {
  const tail = text.slice(-200)
  const effectiveMarkers = markers || DEFAULT_PROMPT_MARKERS
  return effectiveMarkers.some((re) => re.test(tail))
}

/** 确认提示正则数组 */
export const QUESTION_PATTERNS: RegExp[] = [
  /\[Y\/n\]\s*$/i,
  /\[y\/N\]\s*$/i,
  /\(y(?:es)?\/n(?:o)?\)\s*$/i,
  /\bproceed\b.*\?/i,
  /\ballow\b.*\?/i,
  /Do you want to/i,
  /Would you like to/i,
  /Are you sure/i,
]

/**
 * 检查文本末尾是否像确认提问
 */
export function looksLikeQuestion(text: string): boolean {
  const tail = text.slice(-500)
  return QUESTION_PATTERNS.some((re) => re.test(tail))
}
