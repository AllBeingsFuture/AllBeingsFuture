/**
 * Diff 内容查看器组件
 * 以类 git diff 格式展示文件变更内容，支持新增/删除/上下文行及 hunk 分隔
 */

import React from 'react'
import { FilePlus, FileEdit, FileX, Loader2 } from 'lucide-react'

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk-header'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffViewerProps {
  filePath: string
  changeType: 'create' | 'modify' | 'delete'
  hunks: DiffHunk[]
  isLoading?: boolean
  error?: string
}

// ── 常量 ──────────────────────────────────────────────────────────────────

const changeConfig = {
  create: { Icon: FilePlus, color: 'text-green-400' },
  modify: { Icon: FileEdit, color: 'text-blue-400' },
  delete: { Icon: FileX, color: 'text-red-400' },
} as const

const emptyMessage: Record<DiffViewerProps['changeType'], string> = {
  create: '新建文件，暂无 diff 记录',
  delete: '文件已删除',
  modify: '无内容变化',
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}

// ── 子组件：单行渲染 ──────────────────────────────────────────────────────

interface DiffLineRowProps {
  line: DiffLine
}

function DiffLineRow({ line }: DiffLineRowProps) {
  if (line.type === 'hunk-header') {
    return (
      <div className="flex bg-bg-tertiary text-text-muted select-none">
        {/* 行号占位 */}
        <span className="w-10 flex-shrink-0 border-r border-border" />
        <span className="w-10 flex-shrink-0 border-r border-border" />
        {/* 符号占位 */}
        <span className="w-5 flex-shrink-0 border-r border-border" />
        {/* header 内容 */}
        <span className="px-2 py-0.5 flex-1 font-mono text-xs">{line.content}</span>
      </div>
    )
  }

  const isAdd = line.type === 'add'
  const isRemove = line.type === 'remove'

  const rowBg = isAdd
    ? 'bg-green-950/40'
    : isRemove
      ? 'bg-red-950/40'
      : ''

  const textColor = isAdd
    ? 'text-green-300'
    : isRemove
      ? 'text-red-300'
      : 'text-text-secondary'

  const prefix = isAdd ? '+' : isRemove ? '-' : ' '

  const oldNo = isRemove ? (line.oldLineNo ?? '') : ''
  const newNo = !isRemove ? (line.newLineNo ?? '') : ''

  return (
    <div className={`flex items-stretch font-mono text-xs leading-5 ${rowBg}`}>
      {/* 旧行号 */}
      <span
        className="w-10 flex-shrink-0 px-1 text-right text-text-muted border-r border-border select-none"
        aria-hidden
      >
        {oldNo}
      </span>
      {/* 新行号 */}
      <span
        className="w-10 flex-shrink-0 px-1 text-right text-text-muted border-r border-border select-none"
        aria-hidden
      >
        {newNo}
      </span>
      {/* +/- 符号 */}
      <span
        className={`w-5 flex-shrink-0 text-center border-r border-border select-none ${textColor}`}
        aria-hidden
      >
        {prefix}
      </span>
      {/* 代码内容 */}
      <span className={`flex-1 px-2 whitespace-pre ${textColor}`}>{line.content}</span>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────

export default function DiffViewer({
  filePath,
  changeType,
  hunks,
  isLoading = false,
  error,
}: DiffViewerProps) {
  const { Icon, color } = changeConfig[changeType]
  const fileName = getFileName(filePath)

  // 标题栏
  const header = (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-bg-secondary"
    >
      <Icon size={13} className={`flex-shrink-0 ${color}`} />
      <span
        className="text-xs font-medium truncate text-text-primary"
        title={filePath}
      >
        {fileName}
      </span>
    </div>
  )

  // 加载态
  if (isLoading) {
    return (
      <div className="flex flex-col overflow-hidden rounded bg-bg-primary">
        {header}
        <div className="flex items-center justify-center gap-2 flex-1 py-8 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          <span>加载 diff...</span>
        </div>
      </div>
    )
  }

  // 错误态
  if (error) {
    return (
      <div className="flex flex-col overflow-hidden rounded bg-bg-primary">
        {header}
        <div className="mx-3 my-3 px-3 py-2 rounded bg-red-950/50 border border-red-800/50 text-xs text-red-300">
          {error}
        </div>
      </div>
    )
  }

  // 空态
  if (hunks.length === 0) {
    return (
      <div className="flex flex-col overflow-hidden rounded bg-bg-primary">
        {header}
        <div className="flex items-center justify-center flex-1 py-8 text-xs text-text-muted">
          {emptyMessage[changeType]}
        </div>
      </div>
    )
  }

  // Diff 内容
  return (
    <div className="flex flex-col overflow-hidden rounded bg-bg-primary">
      {header}
      <div className="overflow-y-auto flex-1">
        {hunks.map((hunk, hunkIdx) => (
          <div key={`hunk-${hunkIdx}-${hunk.header}`}>
            <DiffLineRow
              line={{ type: 'hunk-header', content: hunk.header }}
            />
            {hunk.lines.map((line, lineIdx) => (
              <DiffLineRow key={`${hunkIdx}-${lineIdx}-${line.type}`} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
