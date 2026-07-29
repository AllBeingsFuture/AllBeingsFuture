/**
 * Slash-command suggest list for enabled skills while typing in the composer.
 */

import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Skill } from '../../stores/skillStore'
import { filterSlashSkills, getSlashQuery } from './capabilityUtils'

interface Props {
  value: string
  skills: Skill[]
  onPick: (slashCommand: string) => void
}

export default function SlashSkillSuggest({ value, skills, onPick }: Props) {
  const query = useMemo(() => getSlashQuery(value), [value])
  const matches = useMemo(() => filterSlashSkills(skills, query).slice(0, 8), [skills, query])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [query, matches.length])

  useEffect(() => {
    if (matches.length === 0) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % matches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        const pick = matches[activeIndex]
        if (!pick?.slashCommand) return
        // Only intercept Enter/Tab when we're completing a slash token
        event.preventDefault()
        event.stopPropagation()
        onPick(pick.slashCommand)
      }
    }

    // Capture phase so we can intercept before MessageTextEditor submits on Enter
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [matches, activeIndex, onPick])

  if (query === null || matches.length === 0) return null

  return (
    <div
      role="listbox"
      aria-label="技能斜杠命令"
      data-testid="slash-skill-suggest"
      className="absolute bottom-full left-0 z-20 mb-1 w-[min(100%,320px)] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0c121c] shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
    >
      <div className="border-b border-white/[0.06] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
        技能命令
      </div>
      <ul className="max-h-[200px] overflow-y-auto py-1">
        {matches.map((skill, index) => {
          const active = index === activeIndex
          return (
            <li key={skill.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition ${
                  active ? 'bg-blue-500/15' : 'hover:bg-white/[0.04]'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  if (skill.slashCommand) onPick(skill.slashCommand)
                }}
              >
                <Sparkles size={12} className="mt-0.5 shrink-0 text-blue-400" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-blue-300">
                      /{skill.slashCommand}
                    </span>
                    <span className="truncate text-[11px] text-gray-400">{skill.name}</span>
                  </div>
                  {skill.description ? (
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-600">{skill.description}</p>
                  ) : null}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
