import { Suspense, lazy, startTransition, useEffect, useState, type ReactNode } from 'react'
import {
  Settings2,
  Palette,
  Bot,
  Wrench,
  MessageSquareHeart,
  ScrollText,
  Shield,
  Server,
} from 'lucide-react'
import DraggableDialog from '../common/DraggableDialog'

const GeneralSettings = lazy(() => import('./GeneralSettings'))
const ProviderManager = lazy(() => import('./ProviderManager'))
const ThemeTab = lazy(() => import('./ThemeTab'))
const AppearanceTab = lazy(() => import('./AppearanceTab'))
const ExtensionsTab = lazy(() => import('./ExtensionsTab'))
const FeedbackTab = lazy(() => import('./FeedbackTab'))
const LogsTab = lazy(() => import('./LogsTab'))
const BotManagementTab = lazy(() => import('./BotManagementTab'))
const PolicyTab = lazy(() => import('./PolicyTab'))
const SystemSettingsTab = lazy(() => import('./SystemSettingsTab'))

type TabId =
  | 'general'
  | 'theme'
  | 'providers'
  | 'skills'
  | 'system'
  | 'policy'
  | 'feedback'
  | 'logs'
  | 'botmanagement'

interface TabDefinition {
  id: TabId
  label: string
  description: string
  group: 'core' | 'integrations' | 'security' | 'support' | 'botmanagement'
  icon: ReactNode
}

interface Props {
  onClose: () => void
  initialTab?: TabId
}

const TABS: TabDefinition[] = [
  {
    id: 'general',
    label: '通用',
    description: '代理、语言和启动行为',
    group: 'core',
    icon: <Settings2 size={15} />,
  },
  {
    id: 'theme',
    label: '主题与外观',
    description: '配色方案、字体大小和显示选项',
    group: 'core',
    icon: <Palette size={15} />,
  },
  {
    id: 'providers',
    label: 'AI Provider',
    description: '管理 CLI 和 API 适配器',
    group: 'integrations',
    icon: <Bot size={15} />,
  },
  {
    id: 'skills',
    label: '扩展',
    description: 'MCP 服务器与技能管理',
    group: 'integrations',
    icon: <Wrench size={15} />,
  },
  {
    id: 'system',
    label: '系统配置',
    description: '底层参数与遥测',
    group: 'support',
    icon: <Server size={15} />,
  },
  {
    id: 'policy',
    label: '安全与治理',
    description: '策略引擎与审计日志',
    group: 'security',
    icon: <Shield size={15} />,
  },
  {
    id: 'feedback',
    label: '反馈',
    description: '问题回报与体验收集',
    group: 'support',
    icon: <MessageSquareHeart size={15} />,
  },
  {
    id: 'logs',
    label: '日志',
    description: '运行状态与调试输出',
    group: 'support',
    icon: <ScrollText size={15} />,
  },
  {
    id: 'botmanagement',
    label: 'Bot 管理',
    description: '统一管理所有 IM 机器人',
    group: 'botmanagement',
    icon: <Bot size={15} />,
  },
]

const GROUP_LABELS: Record<TabDefinition['group'], string> = {
  core: '基本',
  integrations: '能力',
  security: '安全',
  support: '诊断',
  botmanagement: 'Bot',
}

export default function SettingsModal({ onClose, initialTab = 'general' }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const handleTabChange = (tabId: TabId) => {
    startTransition(() => {
      setActiveTab(tabId)
    })
  }

  const activeDefinition = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <DraggableDialog
      title="设置"
      subtitle="AllBeingsFuture"
      icon={<Settings2 size={14} />}
      widthClass="w-full max-w-5xl"
      heightClass="h-[min(85vh,800px)]"
      onClose={onClose}
      testId="settings-modal"
    >
      <div className="flex h-full min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-white/10 bg-slate-950/70">
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {(['core', 'integrations', 'security', 'support', 'botmanagement'] as const).map((group) => {
              const groupTabs = TABS.filter((tab) => tab.group === group)

              return (
                <section key={group} className="mb-2 last:mb-0">
                  <p className="mb-0.5 px-2 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    {GROUP_LABELS[group]}
                  </p>
                  <div>
                    {groupTabs.map((tab) => {
                      const selected = tab.id === activeTab

                      return (
                        <button
                          key={tab.id}
                          aria-label={tab.label}
                          className={[
                            'flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-left transition duration-100',
                            selected
                              ? 'bg-blue-500/15 text-white'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white',
                          ].join(' ')}
                          onClick={() => handleTabChange(tab.id)}
                          type="button"
                        >
                          <span className={selected ? 'text-blue-300' : 'text-slate-500'}>
                            {tab.icon}
                          </span>
                          <span className="truncate text-[13px]">{tab.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
            <span className="text-blue-300">{activeDefinition.icon}</span>
            <h3 className="text-sm font-medium text-white">{activeDefinition.label}</h3>
            <span className="text-xs text-slate-500">{activeDefinition.description}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ contain: 'layout paint' }}>
            <div key={activeTab}>
              <Suspense fallback={<SettingsTabFallback />}>
                {renderTab(activeTab)}
              </Suspense>
            </div>
          </div>
        </section>
      </div>
    </DraggableDialog>
  )
}

function renderTab(activeTab: TabId) {
  switch (activeTab) {
    case 'general':
      return <GeneralSettings />
    case 'theme':
      return (
        <div className="space-y-8">
          <ThemeTab />
          <div className="border-t border-white/10 pt-6">
            <AppearanceTab />
          </div>
        </div>
      )
    case 'providers':
      return <ProviderManager />
    case 'skills':
      return <ExtensionsTab />
    case 'system':
      return <SystemSettingsTab />
    case 'policy':
      return <PolicyTab />
    case 'feedback':
      return <FeedbackTab />
    case 'logs':
      return <LogsTab />
    case 'botmanagement':
      return <BotManagementTab />
    default:
      return <GeneralSettings />
  }
}

function SettingsTabFallback() {
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="h-10 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
      <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
      <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
    </div>
  )
}
