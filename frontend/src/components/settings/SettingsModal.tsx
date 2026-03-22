import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2,
  UserCircle2,
  Palette,
  Sparkles,
  Bot,
  FolderKanban,
  Wrench,
  MessageSquareHeart,
  ScrollText,
  Shield,
  ListTodo,
  Server,
} from 'lucide-react'
import GeneralSettings from './GeneralSettings'
import ProviderManager from './ProviderManager'
import AccountTab from './AccountTab'
import ThemeTab from './ThemeTab'
import AppearanceTab from './AppearanceTab'
import WorkspaceTab from './WorkspaceTab'
import ExtensionsTab from './ExtensionsTab'
import FeedbackTab from './FeedbackTab'
import LogsTab from './LogsTab'
import BotManagementTab from './BotManagementTab'
import PolicyTab from './PolicyTab'
import QueueTab from './QueueTab'
import SystemSettingsTab from './SystemSettingsTab'
import DraggableDialog from '../common/DraggableDialog'

type TabId =
  | 'general'
  | 'account'
  | 'theme'
  | 'appearance'
  | 'providers'
  | 'workspace'
  | 'skills'
  | 'queue'
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
    id: 'account',
    label: '账号',
    description: '身份、授权与连接状态',
    group: 'core',
    icon: <UserCircle2 size={15} />,
  },
  {
    id: 'theme',
    label: '主题',
    description: '色板、密度和界面氛围',
    group: 'core',
    icon: <Palette size={15} />,
  },
  {
    id: 'appearance',
    label: '外观',
    description: '布局细节和显示选项',
    group: 'core',
    icon: <Sparkles size={15} />,
  },
  {
    id: 'providers',
    label: 'AI Provider',
    description: '管理 CLI 和 API 适配器',
    group: 'integrations',
    icon: <Bot size={15} />,
  },
  {
    id: 'workspace',
    label: '工作区',
    description: '仓库、目录和工作空间',
    group: 'integrations',
    icon: <FolderKanban size={15} />,
  },
  {
    id: 'skills',
    label: '扩展',
    description: 'MCP 服务器与技能管理',
    group: 'integrations',
    icon: <Wrench size={15} />,
  },
  {
    id: 'queue',
    label: '任务队列',
    description: '后台任务管理与状态监控',
    group: 'support',
    icon: <ListTodo size={15} />,
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

  const activeDefinition = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <DraggableDialog
      title="设置"
      subtitle="AllBeingsFuture"
      icon={<Settings2 size={14} />}
      widthClass="w-full max-w-4xl"
      heightClass="h-[min(78vh,720px)]"
      onClose={onClose}
      testId="settings-modal"
    >
      <div className="flex min-h-0 flex-1 h-full overflow-hidden">
        {/* Compact sidebar */}
        <aside className="flex w-[180px] shrink-0 flex-col border-r border-white/10 bg-slate-950/70">
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {(['core', 'integrations', 'security', 'support', 'botmanagement'] as const).map((group) => {
              const groupTabs = TABS.filter((tab) => tab.group === group)

              return (
                <section key={group} className="mb-2 last:mb-0">
                  <p className="mb-0.5 px-2 pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">
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
                            'flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left transition duration-100',
                            selected
                              ? 'bg-blue-500/15 text-white'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white',
                          ].join(' ')}
                          onClick={() => setActiveTab(tab.id)}
                          type="button"
                        >
                          <span className={selected ? 'text-blue-300' : 'text-slate-500'}>
                            {tab.icon}
                          </span>
                          <span className="text-[13px] truncate">{tab.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </aside>

        {/* Content area */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-5 py-2.5 flex items-center gap-2">
            <span className="text-blue-300">{activeDefinition.icon}</span>
            <h3 className="text-sm font-medium text-white">{activeDefinition.label}</h3>
            <span className="text-xs text-slate-500">{activeDefinition.description}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                {renderTab(activeTab)}
              </motion.div>
            </AnimatePresence>
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
    case 'account':
      return <AccountTab />
    case 'theme':
      return <ThemeTab />
    case 'appearance':
      return <AppearanceTab />
    case 'providers':
      return <ProviderManager />
    case 'workspace':
      return <WorkspaceTab />
    case 'skills':
      return <ExtensionsTab />
    case 'queue':
      return <QueueTab />
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
