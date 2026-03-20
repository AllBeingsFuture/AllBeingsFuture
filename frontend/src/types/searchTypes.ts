/**
 * 文件内容搜索 / 替换共享类型
 * @author weibin
 */

export type SearchEngine = 'ripgrep' | 'node'

export interface SearchInFilesOptions {
  /** 搜索关键字或正则表达式 */
  query: string
  /** 搜索根路径（绝对路径，文件或目录） */
  rootPath: string
  /** 是否按正则表达式搜索 */
  isRegex?: boolean
  /** 是否大小写敏感 */
  caseSensitive?: boolean
  /** 是否按整词匹配 */
  wholeWord?: boolean
  /** 可选 glob 过滤（支持单个或多个） */
  glob?: string | string[]
  /** 每个命中项携带的前后上下文行数 */
  contextLines?: number
  /** 最大返回命中数（按实际匹配次数统计，而非按行统计） */
  maxResults?: number
}

export interface SearchContextLine {
  /** 1-based 行号 */
  lineNumber: number
  text: string
}

export interface SearchSubmatch {
  /** 0-based 起始列（按 JS 字符索引） */
  start: number
  /** 0-based 结束列（exclusive） */
  end: number
  text: string
}

export interface SearchMatch {
  /** 1-based 行号 */
  lineNumber: number
  /** 当前行完整文本 */
  lineText: string
  /** 当前行内所有匹配片段 */
  submatches: SearchSubmatch[]
  /** 匹配前的上下文 */
  contextBefore: SearchContextLine[]
  /** 匹配后的上下文 */
  contextAfter: SearchContextLine[]
}

export interface FileSearchResult {
  filePath: string
  relativePath: string
  /** 当前文件的实际匹配次数 */
  matchCount: number
  matches: SearchMatch[]
}

export interface SearchResult {
  query: string
  rootPath: string
  files: FileSearchResult[]
  totalFiles: number
  /** 实际匹配次数总和 */
  totalMatches: number
  /** 是否因 maxResults 被截断 */
  truncated: boolean
  /** 实际使用的搜索引擎 */
  engine: SearchEngine
}

export interface ReplaceInFilesOptions extends SearchInFilesOptions {
  replaceValue: string
}

export interface ReplaceFileResult {
  filePath: string
  relativePath: string
  replacements: number
}

export interface ReplaceFileError {
  filePath: string
  relativePath: string
  error: string
}

export interface ReplaceFileSkip {
  filePath: string
  relativePath: string
  reason: 'no-longer-matched'
}

export interface ReplaceResult {
  query: string
  replaceValue: string
  rootPath: string
  files: ReplaceFileResult[]
  errors: ReplaceFileError[]
  skippedFiles: ReplaceFileSkip[]
  /** 与搜索阶段匹配到的文件数 */
  matchedFiles: number
  /** 实际发生写入的文件数（与 totalFiles 含义一致，便于前端直读） */
  changedFiles: number
  /** 保持向后兼容：表示实际发生写入的文件数 */
  totalFiles: number
  totalMatches: number
  totalReplacements: number
  truncated: boolean
  engine: SearchEngine
}
