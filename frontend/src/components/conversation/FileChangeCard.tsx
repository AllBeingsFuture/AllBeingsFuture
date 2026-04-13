/**
 * 文件变更卡片组件
 *
 * 在对话流中展示 AI 对文件的改动，支持 diff 语法高亮。
 */

import React, { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, FileEdit, FilePlus, FileX, File,
  Copy, ExternalLink, FolderOpen, Plus, Minus,
} from 'lucide-react'
import type { ConversationMessage } from '../../types/conversationTypes'
import ContextMenu from '../common/ContextMenu'
import type { MenuItem } from '../common/ContextMenu'
import { workbenchApi } from '../../app/api/workbench'

const CHANGE_TYPE_STYLES = {
  edit:   { icon: FileEdit, color: 'text-yellow-400', label: '编辑', bgColor: 'bg-yellow-400/10' },
  create: { icon: FilePlus, color: 'text-green-400',  label: '创建', bgColor: 'bg-green-400/10' },
  write:  { icon: File,     color: 'text-blue-400',   label: '写入', bgColor: 'bg-blue-400/10' },
  delete: { icon: FileX,    color: 'text-red-400',    label: '删除', bgColor: 'bg-red-400/10' },
}

interface FileChangeCardProps {
  message: ConversationMessage
}

const FileChangeCard: React.FC<FileChangeCardProps> = ({ message }) => {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'operation' | 'cumulative'>('operation')
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0 })

  const fc = message.fileChange
  if (!fc) return null

  const style = CHANGE_TYPE_STYLES[fc.changeType] || CHANGE_TYPE_STYLES.edit
  const Icon = style.icon
  const fileName = fc.filePath.split(/[/\\]/).pop() || fc.filePath
  const dirPath = fc.filePath.split(/[/\\]/).slice(0, -1).join('/')

  const diffLines = useMemo(() => {
    const diffText = activeTab === 'cumulative' && fc.cumulativeDiff
      ? fc.cumulativeDiff
      : fc.operationDiff
    return parseDiffLines(diffText)
  }, [fc, activeTab])

  const menuItems = useMemo<MenuItem[]>(() => [
    {
      key: 'toggle',
      label: expanded ? '折叠' : '展开 Diff',
      icon: expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />,
      onClick: () => setExpanded(v => !v),
    },
    { key: 'div1', type: 'divider' },
    {
      key: 'open-file',
      label: '在编辑器中打开',
      icon: <ExternalLink size={14} />,
      onClick: () => { void workbenchApi.editor.openFile(fc.filePath) },
    },
    {
      key: 'copy-path',
      label: '复制文件路径',
      icon: <FolderOpen size={14} />,
      onClick: () => navigator.clipboard.writeText(fc.filePath),
    },
    {
      key: 'copy-diff',
      label: '复制 Diff',
      icon: <Copy size={14} />,
      onClick: () => navigator.clipboard.writeText(fc.operationDiff),
    },
  ], [expanded, fc])

  return (
    <div className="my-2 mx-2">
      <button
        onClick={() => setExpanded(!expanded)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setCtxMenu({ visible: true, x: e.clientX, y: e.clientY })
        }}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono
          ${style.bgColor} hover:brightness-110 transition-all border border-white/10`}
      >
        <span className="text-[10px] text-gray-500">{expanded ? '▼' : '▶'}</span>
        <Icon size={14} className={style.color} />
        <span className={`font-semibold ${style.color}`}>{style.label}</span>
        <span className="text-gray-100 font-medium truncate">{fileName}</span>
        <span className="text-gray-500 truncate flex-1 text-[11px]">{dirPath}</span>

        <span className="flex items-center gap-1.5 flex-shrink-0">
          {fc.additions > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus size={10} />
              <span>{fc.additions}</span>
            </span>
          )}
          {fc.deletions > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus size={10} />
              <span>{fc.deletions}</span>
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 mx-0.5 rounded-lg bg-gray-900/60 border border-white/10 overflow-hidden">
          {fc.cumulativeDiff && (
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('operation')}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  activeTab === 'operation'
                    ? 'text-gray-100 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                本次改动
              </button>
              <button
                onClick={() => setActiveTab('cumulative')}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  activeTab === 'cumulative'
                    ? 'text-gray-100 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                累积改动
              </button>
            </div>
          )}

          <div className="overflow-auto max-h-[400px] text-[12px] font-mono leading-[1.6]">
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
            {diffLines.length === 0 && (
              <div className="px-4 py-3 text-gray-500 text-center">
                {fc.changeType === 'delete' ? '文件已删除' : '无差异'}
              </div>
            )}
          </div>
        </div>
      )}

      <ContextMenu
        visible={ctxMenu.visible}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={menuItems}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
      />
    </div>
  )
}

interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header' | 'info'
  prefix: string
  content: string
  lineNum?: string
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

FileChangeCard.displayName = 'FileChangeCard'
export default React.memo(FileChangeCard)
