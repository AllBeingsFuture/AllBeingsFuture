import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpLeft, Bot, GitBranch, Loader2, Pencil, RotateCcw, Sparkles, Square, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { SessionItemProps } from './types'
import { ACTIVE_STATUSES, STATUS_LABELS } from './types'
import { formatSessionTime, getShortPath } from './utils'
import AgentSubList from './AgentSubList'
import { useSessionStore } from '../../../stores/sessionStore'
import ContextMenu from '../../common/ContextMenu'
import type { MenuItem } from '../../common/ContextMenu'

const modeLabels: Record<string, string> = {
  normal: 'Normal',
  supervisor: 'Supervisor',
  mission: 'Mission',
}

export default function SessionItem({
  session,
  selected,
  onSelect,
  onResume,
  onEnd,
  onRemove,
  onRename,
  onSmartRename,
  agents,
}: SessionItemProps) {
  const isActive = ACTIVE_STATUSES.has(session.status)
  const { childToParent, sessions } = useSessionStore(useShallow((state) => ({
    childToParent: state.childToParent,
    sessions: state.sessions,
  })))
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(session.name)
  const [renaming, setRenaming] = useState(false)
  const [smartRenaming, setSmartRenaming] = useState(false)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const renameInFlightRef = useRef(false)
  const smartRenameInFlightRef = useRef(false)
  const parentBinding = childToParent[session.id]
  const parentSession = useMemo(
    () => (parentBinding ? sessions.find((item) => item.id === parentBinding.parentSessionId) : undefined),
    [parentBinding, sessions],
  )

  useEffect(() => {
    if (!editingName) {
      setDraftName(session.name)
    }
  }, [editingName, session.name])

  useEffect(() => {
    if (!editingName) return
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [editingName])

  const closeContextMenu = () => {
    setContextMenu((current) => (current.visible ? { ...current, visible: false } : current))
  }

  const startRename = () => {
    if (!onRename || renaming) return
    closeContextMenu()
    setDraftName(session.name)
    setEditingName(true)
  }

  const cancelRename = () => {
    if (renameInFlightRef.current) return
    setDraftName(session.name)
    setEditingName(false)
  }

  const commitRename = async () => {
    if (!editingName || renameInFlightRef.current) return

    const nextName = draftName.trim()
    if (!nextName) {
      setDraftName(session.name)
      setEditingName(false)
      return
    }

    if (!onRename || nextName === session.name) {
      setDraftName(nextName)
      setEditingName(false)
      return
    }

    renameInFlightRef.current = true
    setRenaming(true)
    try {
      await onRename(session.id, nextName)
      setEditingName(false)
    } catch (error) {
      console.error('Rename session failed:', error)
      setDraftName(session.name)
    } finally {
      renameInFlightRef.current = false
      setRenaming(false)
    }
  }

  const triggerSmartRename = async () => {
    if (!onSmartRename || smartRenameInFlightRef.current) return

    closeContextMenu()
    smartRenameInFlightRef.current = true
    setSmartRenaming(true)
    try {
      await onSmartRename(session.id)
      setEditingName(false)
    } catch (error) {
      console.error('Smart rename session failed:', error)
    } finally {
      smartRenameInFlightRef.current = false
      setSmartRenaming(false)
    }
  }

  const menuItems: MenuItem[] = []
  if (onRename) {
    menuItems.push({
      key: 'rename',
      label: '重命名',
      icon: <Pencil size={13} />,
      disabled: renaming,
      onClick: startRename,
    })
  }
  if (onSmartRename) {
    menuItems.push({
      key: 'smart-rename',
      label: smartRenaming ? '智能命名中...' : '智能命名',
      icon: smartRenaming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />,
      disabled: smartRenaming,
      onClick: () => { void triggerSmartRename() },
    })
  }
  if (menuItems.length > 0 && onRemove) {
    menuItems.push({ key: 'divider-actions', type: 'divider' })
  }
  if (onRemove) {
    menuItems.push({
      key: 'remove',
      label: '删除会话',
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: () => onRemove(session.id),
    })
  }

  return (
    <div
      className={[
        'group relative rounded-xl border p-2.5 transition-all duration-200 cursor-pointer',
        selected
          ? 'border-blue-500/25 bg-blue-500/[0.08] shadow-[0_2px_12px_rgba(59,130,246,0.12)]'
          : 'border-white/[0.04] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.04] hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
      ].join(' ')}
      data-session-id={session.id}
      onClick={() => onSelect(session.id)}
      onContextMenu={(event) => {
        if (menuItems.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(session.id)
        setContextMenu({
          visible: true,
          x: event.clientX,
          y: event.clientY,
        })
      }}
    >
      {selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-scale-in origin-left" />
      )}

      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1 py-0.5">
          <div className="relative mt-1 shrink-0">
            <div className={['h-2.5 w-2.5 rounded-full ring-2', isActive ? 'bg-emerald-400 ring-emerald-400/20' : 'bg-gray-600 ring-gray-600/20'].join(' ')} />
            {isActive && <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping opacity-30" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Bot size={13} className={`shrink-0 ${selected ? 'text-blue-400' : 'text-blue-400/50'}`} />
              {editingName ? (
                <input
                  ref={inputRef}
                  value={draftName}
                  disabled={renaming}
                  aria-label={`重命名 ${session.name}`}
                  onChange={(event) => setDraftName(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                  onBlur={() => { void commitRename() }}
                  className="min-w-0 flex-1 rounded-md border border-blue-500/20 bg-slate-950/70 px-2 py-1 text-[12px] font-medium leading-tight text-gray-100 outline-none ring-0 placeholder:text-gray-600 focus:border-blue-500/40"
                />
              ) : (
                <p
                  className={`truncate text-[13px] font-medium leading-tight ${selected ? 'text-gray-100' : 'text-gray-300'}`}
                  title={onRename ? `${session.name}（双击重命名）` : session.name}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startRename()
                  }}
                >
                  {session.name}
                </p>
              )}
              {renaming && <Loader2 size={12} className="shrink-0 animate-spin text-blue-400" />}
            </div>
            <p className="mt-1 truncate text-[11px] leading-tight text-gray-500">{getShortPath(session.workingDirectory)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-medium uppercase tracking-wider text-gray-400">
                {session.providerId}
              </span>
              <span className={[
                'rounded-md px-1.5 py-0.5 font-medium',
                isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-white/[0.03] text-gray-500',
              ].join(' ')}>
                {STATUS_LABELS[session.status] || session.status}
              </span>
              <span className="text-gray-600">{modeLabels[session.mode] || session.mode}</span>
              <span className="tabular-nums text-gray-600">{formatSessionTime(session)}</span>
              {parentBinding && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelect(parentBinding.parentSessionId) }}
                  className="inline-flex items-center gap-0.5 rounded-md border border-purple-400/15 bg-purple-500/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-purple-300 transition-all hover:bg-purple-500/15 hover:text-purple-200"
                  title={`来自: ${parentSession?.name || parentBinding.parentSessionId}`}
                >
                  <ArrowUpLeft size={9} />
                  <span className="max-w-[60px] truncate">{parentSession?.name || '主会话'}</span>
                </button>
              )}
            </div>
            {session.worktreeBranch && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${session.worktreeMerged ? 'border-green-400/15 bg-green-500/[0.08] text-green-400' : 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-400'}`}>
                  <GitBranch size={10} />
                  <span className="max-w-[100px] truncate">{session.worktreeBranch}</span>
                </div>
                {session.worktreeMerged && (
                  <span className="rounded-md bg-green-900/30 px-1 py-0.5 text-[9px] font-medium text-green-400">已合并</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:transition-all md:duration-200 md:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {onSmartRename && (
            <button
              type="button"
              aria-label={`智能命名 ${session.name}`}
              onClick={() => { void triggerSmartRename() }}
              disabled={smartRenaming}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              title="智能命名"
            >
              {smartRenaming ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            </button>
          )}
          {onRename && !editingName && (
            <button
              type="button"
              aria-label={`重命名 ${session.name}`}
              onClick={startRename}
              disabled={renaming}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
              title="重命名"
            >
              <Pencil size={11} />
            </button>
          )}
          {!isActive && onResume && (
            <button
              type="button"
              aria-label={`恢复 ${session.name}`}
              onClick={() => onResume(session.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-400/20 bg-blue-400/[0.08] px-2 py-1 text-[11px] text-blue-300 transition-all hover:bg-blue-400/15 hover:border-blue-400/30"
            >
              <RotateCcw size={11} />
            </button>
          )}
          {isActive && onEnd && (
            <button
              type="button"
              aria-label={`结束 ${session.name}`}
              onClick={() => onEnd(session.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-gray-300"
            >
              <Square size={11} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`删除 ${session.name}`}
              onClick={() => onRemove(session.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-400"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {agents && agents.length > 0 && (
        <AgentSubList agents={agents} onSelectSession={onSelect} />
      )}

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={menuItems}
        onClose={closeContextMenu}
      />
    </div>
  )
}
