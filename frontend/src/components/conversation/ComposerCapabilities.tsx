/**
 * Composer affordances for browsing / toggling Skills and MCP from chat.
 * Integrates with the modern floating composer (+ menu may also attach files).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Plus, Server, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useMcpStore } from '../../stores/mcpStore'
import { useSkillStore } from '../../stores/skillStore'
import CapabilityPicker, { type CapabilityKind } from './CapabilityPicker'
import { countEnabled } from './capabilityUtils'

interface Props {
  disabled?: boolean
  /** When set, the + menu includes an attach-files action (modern composer). */
  onAttachFiles?: () => void
}

export default function ComposerCapabilities({ disabled = false, onAttachFiles }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [picker, setPicker] = useState<CapabilityKind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { skills, loadSkills } = useSkillStore(useShallow((s) => ({
    skills: s.skills,
    loadSkills: s.load,
  })))
  const { servers, loadMcp } = useMcpStore(useShallow((s) => ({
    servers: s.servers,
    loadMcp: s.load,
  })))

  useEffect(() => {
    void loadSkills()
    void loadMcp()
  }, [loadSkills, loadMcp])

  const skillEnabled = countEnabled(skills)
  const mcpEnabled = countEnabled(servers)

  const openPicker = useCallback((kind: CapabilityKind) => {
    setMenuOpen(false)
    setPicker(kind)
  }, [])

  const closePicker = useCallback(() => setPicker(null), [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid="composer-capabilities">
      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            aria-label="打开能力菜单"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="添加"
            onClick={() => {
              setPicker(null)
              setMenuOpen((v) => !v)
            }}
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={18} strokeWidth={2} />
          </button>

          {menuOpen ? (
            <div
              ref={menuRef}
              role="menu"
              data-testid="composer-capability-menu"
              className="absolute bottom-full left-0 z-30 mb-2 min-w-[168px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0c121c] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            >
              {onAttachFiles ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-white/[0.05]"
                  onClick={() => {
                    setMenuOpen(false)
                    onAttachFiles()
                  }}
                >
                  <Paperclip size={13} className="text-zinc-400" />
                  添加附件
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-white/[0.05]"
                onClick={() => openPicker('skills')}
              >
                <Sparkles size={13} className="text-sky-400" />
                技能
                <span className="ml-auto text-[10px] text-gray-500">{skillEnabled}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-white/[0.05]"
                onClick={() => openPicker('mcp')}
              >
                <Server size={13} className="text-sky-400" />
                MCP
                <span className="ml-auto text-[10px] text-gray-500">{mcpEnabled}</span>
              </button>
            </div>
          ) : null}
        </div>

        {(skillEnabled > 0 || mcpEnabled > 0) ? (
          <div className="mb-0.5 flex items-center gap-1">
            {skillEnabled > 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => openPicker('skills')}
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 transition hover:border-sky-500/35 hover:bg-sky-500/15 disabled:opacity-40"
                aria-label={`已启用 ${skillEnabled} 个技能`}
              >
                <Sparkles size={10} />
                {skillEnabled}
              </button>
            ) : null}
            {mcpEnabled > 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => openPicker('mcp')}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 transition hover:border-emerald-500/35 hover:bg-emerald-500/15 disabled:opacity-40"
                aria-label={`已启用 ${mcpEnabled} 个 MCP`}
              >
                <Server size={10} />
                {mcpEnabled}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <CapabilityPicker
        kind="skills"
        open={picker === 'skills'}
        onClose={closePicker}
      />
      <CapabilityPicker
        kind="mcp"
        open={picker === 'mcp'}
        onClose={closePicker}
      />
    </div>
  )
}
