import { Bot, MessageSquarePlus, FolderGit2, Workflow, Keyboard, Image, GitBranch } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import ConversationView from '../conversation/ConversationView'
import { useSessionStore } from '../../stores/sessionStore'

const TIPS = [
  { icon: MessageSquarePlus, title: '多 Provider 支持', desc: '同时配置 Claude、Codex、Gemini 等多种 AI 提供商' },
  { icon: FolderGit2, title: 'Worktree 隔离', desc: '真正写代码前进入独立 Git Worktree，避免直接修改主仓库' },
  { icon: Image, title: '图片识别', desc: '直接粘贴或上传截图，AI 可以理解图片内容' },
  { icon: Workflow, title: '工作流编排', desc: '将多步骤任务编排为自动化工作流，一键执行' },
  { icon: GitBranch, title: '子 Agent', desc: 'AI 可自动派生子 Agent 并行处理子任务' },
  { icon: Keyboard, title: '快捷键', desc: 'Ctrl+N 新建会话，Ctrl+B 切换侧栏，Ctrl+K 快速搜索' },
]

const viewTransition = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.2, ease: 'easeOut' },
}

export default function SessionPanel() {
  const { sessions, selectedId, select } = useSessionStore(useShallow((state) => ({
    sessions: state.sessions,
    selectedId: state.selectedId,
    select: state.select,
  })))

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  useEffect(() => {
    if (!selectedId && sessions.length > 0) {
      select(sessions[0].id)
    }
  }, [select, selectedId, sessions])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="session-workspace">
      <AnimatePresence mode="wait">
        {selectedSession ? (
          <motion.div key={selectedSession.id} className="flex min-h-0 flex-1 flex-col" {...viewTransition}>
            <ConversationView session={selectedSession} />
          </motion.div>
        ) : (
          <motion.div key="empty" className="flex h-full flex-col items-center justify-center px-6 text-center" {...viewTransition}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-gradient-to-br from-blue-500/10 to-purple-500/10 text-gray-400">
              <Bot size={28} />
            </div>
            <h3 className="mt-5 text-base font-semibold text-white">AllBeingsFuture</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
              新建会话开始与 AI 协作，或从左侧选择已有会话
            </p>

            <div className="mt-8 grid max-w-lg w-full grid-cols-2 gap-3">
              {TIPS.map((tip, index) => (
                <div
                  key={tip.title}
                  className="animate-slide-in-up flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                  style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                    <tip.icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-300">{tip.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
