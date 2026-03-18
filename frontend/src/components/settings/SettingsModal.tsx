import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2,
  UserCircle2,
  Palette,
  Sparkles,
  Bot,
  FolderKanban,
  Plug2,
  Wrench,
  MessageSquareHeart,
  ScrollText,
  ChevronRight,
  Sticker,
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
import McpTab from './McpTab'
import SkillsTab from './SkillsTab'
import FeedbackTab from './FeedbackTab'
import LogsTab from './LogsTab'
import BotManagementTab from './BotManagementTab'
import StickerTab from '../sticker/StickerTab'
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
  | 'mcp'
  | 'skills'
  | 'sticker'
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
    icon: <Settings2 size={16} />,
  },
  {
    id: 'account',
    label: '账号',
    description: '身份、授权与连接状态',
    group: 'core',
    icon: <UserCircle2 size={16} />,
  },
  {
    id: 'theme',
    label: '主题',
    description: '色板、密度和界面氛围',
    group: 'core',
    icon: <Palette size={16} />,
  },
  {
    id: 'appearance',
    label: '外观',
    description: '布局细节和显示选项',
    group: 'core',
    icon: <Sparkles size={16} />,
  },
  {
    id: 'providers',
    label: 'AI Provider',
    description: '管理 CLI 和 API 适配器',
    group: 'integrations',
    icon: <Bot size={16} />,
  },
  {
    id: 'workspace',
    label: '工作区',
    description: '仓库、目录和工作空间',
    group: 'integrations',
    icon: <FolderKanban size={16} />,
  },
  {
    id: 'mcp',
    label: 'MCP',
    description: '工具服务器和连接配置',
    group: 'integrations',
    icon: <Plug2 size={16} />,
  },
  {
    id: 'skills',
    label: '技能',
    description: '启用、安装与调度能力',
    group: 'integrations',
    icon: <Wrench size={16} />,
  },
  {
    id: 'sticker',
    label: '贴纸',
    description: '5700+ 款表情包，情绪感知匹配',
    group: 'integrations',
    icon: <Sticker size={16} />,
  },
  {
    id: 'queue',
    label: '任务队列',
    description: '后台任务管理、重试和状态监控',
    group: 'support',
    icon: <ListTodo size={16} />,
  },
  {
    id: 'system',
    label: '系统配置',
    description: '日志、队列、遥测等底层参数',
    group: 'support',
    icon: <Server size={16} />,
  },
  {
    id: 'policy',
    label: '安全与治理',
    description: '策略引擎、危险操作确认、审计日志',
    group: 'security',
    icon: <Shield size={16} />,
  },
  {
    id: 'feedback',
    label: '反馈',
    description: '问题回报与体验收集',
    group: 'support',
    icon: <MessageSquareHeart size={16} />,
  },
  {
    id: 'logs',
    label: '日志',
    description: '运行状态与调试输出',
    group: 'support',
    icon: <ScrollText size={16} />,
  },
  {
    id: 'botmanagement',
    label: 'Bot 管理',
    description: '统一管理所有 IM 机器人',
    group: 'botmanagement',
    icon: <Bot size={16} />,
  },
]

const GROUP_META: Record<TabDefinition['group'], { label: string; description: string }> = {
  core: {
    label: '核心设置',
    description: '应用行为和界面体验',
  },
  integrations: {
    label: '能力接入',
    description: 'Provider、MCP、贴纸和工作区能力',
  },
  security: {
    label: '安全与治理',
    description: 'POLICIES.yaml 策略、操作审计',
  },
  support: {
    label: '支持与诊断',
    description: '反馈、排障与运行信息',
  },
  botmanagement: {
    label: 'Bot 管理',
    description: '统一管理所有平台 IM 机器人',
  },
}

export default function SettingsModal({ onClose, initialTab = 'general' }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const activeDefinition = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <DraggableDialog
      title="设置中心"
      subtitle="AllBeingsFuture"
      icon={<Settings2 size={16} />}
      widthClass="w-full max-w-7xl"
      heightClass="h-[min(92vh,calc(100vh-2rem))]"
      onClose={onClose}
      testId="settings-modal"
    >
      <div className="flex min-h-0 flex-1 h-full overflow-hidden">
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/10 bg-slate-950/70">
          <div className="flex-1 overflow-y-auto px-4 py-5">
            {(['core', 'integrations', 'security', 'support', 'botmanagement'] as const).map((group) => {
              const groupTabs = TABS.filter((tab) => tab.group === group)
              const meta = GROUP_META[group]

              return (
                <section key={group} className="mb-6 last:mb-0">
                  <div className="mb-3 px-2">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{meta.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{meta.description}</p>
                  </div>
                  <div className="space-y-1.5">
                    {groupTabs.map((tab) => {
                      const selected = tab.id === activeTab

                      return (
                        <button
                          key={tab.id}
                          aria-label={tab.label}
                          className={[
                            'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition duration-150',
                            selected
                              ? 'border-blue-400/40 bg-blue-500/10 text-white shadow-[0_12px_30px_rgba(59,130,246,0.12)]'
                              : 'border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                          ].join(' ')}
                          onClick={() => setActiveTab(tab.id)}
                          type="button"
                        >
                          <span
                            className={[
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                              selected
                                ? 'border-blue-400/40 bg-blue-500/15 text-blue-200'
                                : 'border-white/10 bg-white/5 text-slate-400',
                            ].join(' ')}
                          >
                            {tab.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{tab.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-400">{tab.description}</span>
                          </span>
                          <ChevronRight size={16} className={selected ? 'text-blue-200' : 'text-slate-500'} />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))]">
          <div className="border-b border-white/10 px-7 py-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{GROUP_META[activeDefinition.group].label}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-blue-200">
                    {activeDefinition.icon}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{activeDefinition.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{activeDefinition.description}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <div className="surface-card min-h-full rounded-[28px] border-white/10 bg-slate-950/45 p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                >
                  {renderTab(activeTab)}
                </motion.div>
              </AnimatePresence>
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
    case 'mcp':
      return <McpTab />
    case 'skills':
      return <SkillsTab />
    case 'sticker':
      return <StickerTab />
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
