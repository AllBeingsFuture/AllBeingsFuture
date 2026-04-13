/**
 * DiffViewer 组件
 *
 * 独立的 Diff 查看器，可复用于文件变更展示。
 * 支持 unified diff 格式的解析和语法高亮。
 */

import React, { useMemo } from 'react'

interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header' | 'info'
  prefix: string
  content: string
  lineNum?: string
}

interface DiffViewerProps {
  diff: string
  maxHeight?: number
}

function parseDiffLines(diff: string): DiffLine[] {
  if (!diff) return []

  const lines = diff.split('\n')
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const rawLine of lines) {
    if (rawLine.startsWith('---') || rawLine.startsWith('+++') || rawLine.startsWith('Index:') || rawLine.startsWith('===')) {
      result.push({ type: 'info', prefix: '', content: rawLine })
      continue
    }

    if (rawLine.startsWith('@@')) {
      const match = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
      if (match) {
        oldLine = parseInt(match[1])
        newLine = parseInt(match[2])
      }
      result.push({ type: 'header', prefix: '', content: rawLine })
      continue
    }

    if (rawLine.startsWith('diff ')) {
      result.push({ type: 'info', prefix: '', content: rawLine })
      continue
    }

    if (rawLine.startsWith('+')) {
      result.push({ type: 'add', prefix: '+', content: rawLine.slice(1), lineNum: String(newLine++) })
      continue
    }

    if (rawLine.startsWith('-')) {
      result.push({ type: 'delete', prefix: '-', content: rawLine.slice(1), lineNum: String(oldLine++) })
      continue
    }

    if (rawLine.startsWith(' ') || rawLine === '') {
      result.push({
        type: 'context',
        prefix: ' ',
        content: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine,
        lineNum: String(newLine++),
      })
      oldLine++
      continue
    }

    result.push({ type: 'info', prefix: '', content: rawLine })
  }

  return result
}

function getDiffLineClass(type: DiffLine['type']): string {
  switch (type) {
    case 'add':     return 'bg-green-400/10 text-green-400'
    case 'delete':  return 'bg-red-400/10 text-red-400'
    case 'header':  return 'bg-blue-400/5 text-blue-400'
    case 'info':    return 'text-gray-500'
    case 'context': return 'text-gray-400'
    default:        return ''
  }
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diff, maxHeight = 400 }) => {
  const diffLines = useMemo(() => parseDiffLines(diff), [diff])

  if (!diff || diffLines.length === 0) {
    return (
      <div className="px-4 py-3 text-gray-500 text-center text-sm">
        无差异内容
      </div>
    )
  }

  return (
    <div
      className="overflow-auto text-[12px] font-mono leading-[1.6] rounded-lg bg-gray-900/60 border border-white/10"
      style={{ maxHeight }}
    >
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={`px-3 py-0 whitespace-pre ${getDiffLineClass(line.type)}`}
        >
          <span className="inline-block w-[50px] text-right text-gray-600 select-none mr-2 text-[11px]">
            {line.lineNum || ''}
          </span>
          <span className="text-gray-600 select-none mr-1">{line.prefix}</span>
          <span>{line.content}</span>
        </div>
      ))}
    </div>
  )
}

DiffViewer.displayName = 'DiffViewer'
export default React.memo(DiffViewer)
