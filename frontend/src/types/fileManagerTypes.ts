/**
 * 文件管理器共享类型定义
 * @author weibin
 */

/** 文件或目录条目 */
export interface FileEntry {
  name: string
  path: string        // 绝对路径
  type: 'file' | 'directory'
  size?: number       // 字节，仅文件有效
  modified?: number   // Unix 时间戳（毫秒）
  extension?: string  // 文件扩展名，如 '.ts'、'.tsx'
  isHidden?: boolean  // 以 '.' 开头的文件/目录
}

/** 目录列表结果 */
export interface DirListing {
  path: string
  entries: FileEntry[]
}

/** 文件监听变化事件（main → renderer 推送） */
export interface FileWatchEvent {
  eventType: 'rename' | 'change'
  filename: string | null
  dirPath: string     // 被监听的目录路径
}
