import { startTransition, useState } from 'react'
import { Plug2, Wrench } from 'lucide-react'
import McpTab from './McpTab'
import SkillsTab from './SkillsTab'

type SubTab = 'skills' | 'mcp'

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'skills', label: '技能', icon: <Wrench size={14} /> },
  { id: 'mcp', label: 'MCP 服务', icon: <Plug2 size={14} /> },
]

export default function ExtensionsTab() {
  const [active, setActive] = useState<SubTab>('skills')
  const [visitedTabs, setVisitedTabs] = useState<Record<SubTab, boolean>>({
    skills: true,
    mcp: false,
  })

  const handleTabChange = (tabId: SubTab) => {
    startTransition(() => {
      setActive(tabId)
      setVisitedTabs((current) => (
        current[tabId]
          ? current
          : { ...current, [tabId]: true }
      ))
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-900/50 p-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              active === tab.id
                ? 'bg-blue-500/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white',
            ].join(' ')}
            type="button"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {visitedTabs.skills ? (
        <div aria-hidden={active !== 'skills'} className={active === 'skills' ? 'block' : 'hidden'}>
          <SkillsTab />
        </div>
      ) : null}
      {visitedTabs.mcp ? (
        <div aria-hidden={active !== 'mcp'} className={active === 'mcp' ? 'block' : 'hidden'}>
          <McpTab />
        </div>
      ) : null}
    </div>
  )
}
