import { useEffect, useMemo, useState } from 'react'
import { Allotment } from 'allotment'
import { useShallow } from 'zustand/react/shallow'
import {
  Bot,
  Briefcase,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Play,
  Plus,
  Sparkles,
  SquareTerminal,
  Users,
} from 'lucide-react'
import type { TeamDefinition, TeamInstance, TeamMember } from '../../../bindings/allbeingsfuture/internal/models/models'
import TeamTemplateEditor from './TeamTemplateEditor'
import { useTeamStore } from '../../stores/teamStore'

type DetailTab = 'members' | 'tasks' | 'messages'
type WorkspaceTab = 'conversation' | 'status' | 'office'

const INSTANCE_STATUS_META: Record<string, { label: string; className: string }> = {
  starting: { label: '启动中', className: 'border-amber-400/25 bg-amber-500/10 text-amber-200' },
  running: { label: '运行中', className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' },
  paused: { label: '已暂停', className: 'border-slate-400/25 bg-slate-500/10 text-slate-300' },
  completed: { label: '已完成', className: 'border-blue-400/25 bg-blue-500/10 text-blue-200' },
  failed: { label: '失败', className: 'border-red-400/25 bg-red-500/10 text-red-200' },
}

const MEMBER_STATUS_META: Record<string, string> = {
  pending: '等待中',
  starting: '启动中',
  running: '工作中',
  idle: '空闲',
  completed: '已完成',
  failed: '失败',
}

function formatTime(value?: string | null) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function badgeClass(active: boolean) {
  return [
    'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em]',
    active ? 'border-blue-400/25 bg-blue-500/12 text-blue-100' : 'border-white/10 bg-white/[0.04] text-slate-400',
  ].join(' ')
}

export default function TeamPanel() {
  const {
    definitions,
    instances,
    selectedInstanceId,
    tasks,
    messages,
    loadDefinitions,
    loadInstances,
    selectInstance,
    loadTasks,
    loadMessages,
  } = useTeamStore(useShallow((state) => ({
    definitions: state.definitions,
    instances: state.instances,
    selectedInstanceId: state.selectedInstanceId,
    tasks: state.tasks,
    messages: state.messages,
    loadDefinitions: state.loadDefinitions,
    loadInstances: state.loadInstances,
    selectInstance: state.selectInstance,
    loadTasks: state.loadTasks,
    loadMessages: state.loadMessages,
  })))

  const [showEditor, setShowEditor] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamDefinition | null>(null)
  const [showStartDialog, setShowStartDialog] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('members')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('conversation')

  useEffect(() => {
    void loadDefinitions()
    void loadInstances()
  }, [loadDefinitions, loadInstances])

  useEffect(() => {
    if (!selectedInstanceId && instances.length > 0) {
      selectInstance(instances[0].id)
    }
  }, [instances, selectInstance, selectedInstanceId])

  useEffect(() => {
    if (!selectedInstanceId) return
    void loadTasks(selectedInstanceId)
    void loadMessages(selectedInstanceId)
  }, [loadMessages, loadTasks, selectedInstanceId])

  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.id === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  )

  useEffect(() => {
    if (!selectedInstance || selectedInstance.members.length === 0) {
      setSelectedMemberId(null)
      return
    }

    if (!selectedMemberId || !selectedInstance.members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(selectedInstance.members[0].id)
    }
  }, [selectedInstance, selectedMemberId])

  const selectedMember = useMemo(
    () => selectedInstance?.members.find((member) => member.id === selectedMemberId) ?? null,
    [selectedInstance, selectedMemberId],
  )

  const { runningInstances, historyInstances } = useMemo(() => {
    const running: TeamInstance[] = []
    const history: TeamInstance[] = []

    for (const instance of instances) {
      if (instance.status === 'running' || instance.status === 'starting') {
        running.push(instance)
      } else {
        history.push(instance)
      }
    }

    return {
      runningInstances: running,
      historyInstances: history,
    }
  }, [instances])

  const groupedMembers = useMemo(() => {
    if (!selectedInstance) return []

    const groups = new Map<string, { key: string; label: string; color: string; members: TeamMember[] }>()
    for (const member of selectedInstance.members) {
      const key = member.roleName || member.displayName || member.id
      const current = groups.get(key) ?? {
        key,
        label: member.displayName || member.roleName,
        color: member.color || '#60a5fa',
        members: [],
      }
      current.members.push(member)
      groups.set(key, current)
    }

    return Array.from(groups.values())
  }, [selectedInstance])

  const memberMessages = useMemo(() => {
    if (!selectedMember) return []
    return messages.filter((message) => message.fromRole === selectedMember.roleName || message.toRole === selectedMember.roleName)
  }, [messages, selectedMember])

  const stats = useMemo(() => {
    const members = selectedInstance?.members ?? []
    let completedMembers = 0
    let runningMembers = 0

    for (const member of members) {
      if (member.status === 'completed') completedMembers += 1
      if (member.status === 'running') runningMembers += 1
    }

    return {
      memberCount: members.length,
      completedMembers,
      runningMembers,
      taskCount: tasks.length,
      messageCount: messages.length,
    }
  }, [messages.length, selectedInstance, tasks.length])

  return (
    <div className="h-full bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]">
      <Allotment>
        <Allotment.Pane preferredSize={260} minSize={220} maxSize={360}>
          <section className="flex h-full flex-col border-r border-white/10 bg-slate-950/68">
            <div className="border-b border-white/10 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Team Instances</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">团队实例</h2>
                  <p className="mt-2 text-xs leading-6 text-slate-400">对齐 claudeops 的 teams mode 左栏，实例与模板入口都收在这里。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeam(null)
                    setShowEditor(true)
                  }}
                  className="titlebar-button"
                  aria-label="新建团队模板"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <Sparkles size={12} />
                  运行中
                </div>
                <div className="space-y-2">
                  {runningInstances.map((instance) => {
                    const active = selectedInstanceId === instance.id
                    const meta = INSTANCE_STATUS_META[instance.status] ?? INSTANCE_STATUS_META.paused
                    return (
                      <button
                        key={instance.id}
                        type="button"
                        onClick={() => selectInstance(instance.id)}
                        className={[
                          'w-full rounded-[22px] border px-3 py-3 text-left transition',
                          active
                            ? 'border-blue-400/30 bg-blue-500/12 shadow-[0_12px_28px_rgba(59,130,246,0.16)]'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{instance.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{instance.task || '未设置团队目标'}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${meta.className}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <span>{instance.members.length} 成员</span>
                          <span>·</span>
                          <span>{formatTime(instance.startedAt)}</span>
                        </div>
                      </button>
                    )
                  })}
                  {runningInstances.length === 0 && <EmptyHint text="当前没有运行中的团队实例。" />}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <Briefcase size={12} />
                  历史实例
                </div>
                <div className="space-y-2">
                  {historyInstances.map((instance) => {
                    const active = selectedInstanceId === instance.id
                    const meta = INSTANCE_STATUS_META[instance.status] ?? INSTANCE_STATUS_META.paused
                    return (
                      <button
                        key={instance.id}
                        type="button"
                        onClick={() => selectInstance(instance.id)}
                        className={[
                          'w-full rounded-[20px] border px-3 py-3 text-left transition',
                          active ? 'border-blue-400/25 bg-blue-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm text-slate-200">{instance.name}</p>
                          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${meta.className}`}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-xs text-slate-500">{formatTime(instance.startedAt)}</p>
                      </button>
                    )
                  })}
                  {historyInstances.length === 0 && <EmptyHint text="历史区还没有团队记录。" />}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <Users size={12} />
                  模板
                </div>
                <div className="space-y-2">
                  {definitions.map((definition) => (
                    <div key={definition.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{definition.name}</p>
                          <p className="mt-1 text-xs leading-6 text-slate-500">{definition.description || `${definition.roles.length} 个角色`}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setShowStartDialog(definition.id)}
                            className="rounded-full border border-emerald-400/20 bg-emerald-500/10 p-1.5 text-emerald-200 transition hover:bg-emerald-500/20"
                            title="启动团队"
                          >
                            <Play size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeam(definition)
                              setShowEditor(true)
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:bg-white/[0.08]"
                            title="编辑团队模板"
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {definition.roles.map((role) => (
                          <span
                            key={role.id}
                            className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                            style={{
                              borderColor: `${role.color}55`,
                              backgroundColor: `${role.color}22`,
                              color: role.color,
                            }}
                          >
                            {role.displayName || role.roleName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {definitions.length === 0 && <EmptyHint text="先新建一个团队模板，再从这里启动实例。" />}
                </div>
              </div>
            </div>
          </section>
        </Allotment.Pane>

        <Allotment.Pane preferredSize={380} minSize={320}>
          <section className="flex h-full flex-col border-r border-white/10 bg-slate-950/72">
            {selectedInstance ? (
              <>
                <div className="border-b border-white/10 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Team Detail</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{selectedInstance.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{selectedInstance.task || '当前团队实例还没有任务目标描述。'}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${INSTANCE_STATUS_META[selectedInstance.status]?.className || INSTANCE_STATUS_META.paused.className}`}>
                      {INSTANCE_STATUS_META[selectedInstance.status]?.label || selectedInstance.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <MetricCard label="成员" value={String(stats.memberCount)} />
                    <MetricCard label="任务" value={String(stats.taskCount)} />
                    <MetricCard label="消息" value={String(stats.messageCount)} />
                  </div>
                </div>

                <div className="flex border-b border-white/10 px-2">
                  {[
                    { key: 'members' as DetailTab, label: '成员', icon: Users },
                    { key: 'tasks' as DetailTab, label: '任务', icon: ClipboardList },
                    { key: 'messages' as DetailTab, label: '消息', icon: MessageSquare },
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDetailTab(key)}
                      className={[
                        'flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition',
                        detailTab === key ? 'border-blue-400 text-blue-200' : 'border-transparent text-slate-400 hover:text-white',
                      ].join(' ')}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  {detailTab === 'members' && (
                    <div className="space-y-4">
                      {groupedMembers.map((group) => (
                        <div key={group.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                              <div>
                                <p className="text-sm font-medium text-white">{group.label}</p>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.key}</p>
                              </div>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                              {group.members.length} 成员
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {group.members.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => {
                                  setSelectedMemberId(member.id)
                                  setWorkspaceTab('conversation')
                                }}
                                className={[
                                  'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition',
                                  selectedMemberId === member.id
                                    ? 'border-blue-400/25 bg-blue-500/10 text-white'
                                    : 'border-white/10 bg-slate-950/55 text-slate-300 hover:border-white/15 hover:bg-white/[0.04]',
                                ].join(' ')}
                              >
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color || '#60a5fa' }} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{member.displayName || member.roleName}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{member.roleName}</p>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                  {MEMBER_STATUS_META[member.status] || member.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'tasks' && (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{task.title}</p>
                              <p className="mt-2 text-xs leading-6 text-slate-400">{task.description || '暂无任务描述。'}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                              {task.status}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {task.assignedTo && <span>@ {task.assignedTo}</span>}
                            <span>{formatTime(task.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                      {tasks.length === 0 && <EmptyHint text="当前团队还没有任务列表。" />}
                    </div>
                  )}

                  {detailTab === 'messages' && (
                    <div className="space-y-2">
                      {messages.map((message) => (
                        <div key={message.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            <span>{message.fromRole}</span>
                            {message.toRole && (
                              <>
                                <span>→</span>
                                <span>{message.toRole}</span>
                              </>
                            )}
                            <span className="ml-auto">{formatTime(message.timestamp)}</span>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{message.content}</p>
                        </div>
                      ))}
                      {messages.length === 0 && <EmptyHint text="当前团队还没有消息流。" />}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <CenteredEmpty icon={Users} title="选择一个团队实例" description="左侧启动或点选一个团队实例后，这里会展示成员、任务和消息流。" />
            )}
          </section>
        </Allotment.Pane>

        <Allotment.Pane minSize={320}>
          <section className="flex h-full flex-col bg-slate-950/76">
            <div className="border-b border-white/10 px-5 py-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Workspace</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{selectedMember ? selectedMember.displayName || selectedMember.roleName : '团队工作区'}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {selectedMember ? '这里承接成员对话、状态总览和 office scene 三个入口。' : '先在中栏成员列表中选中一个成员，再查看对应工作区。'}
                  </p>
                </div>
                {selectedMember && <span className={badgeClass(true)}>{selectedMember.roleName}</span>}
              </div>
            </div>

            <div className="flex border-b border-white/10 px-2">
              {[
                { key: 'conversation' as WorkspaceTab, label: '对话', icon: Bot },
                { key: 'status' as WorkspaceTab, label: '状态', icon: LayoutDashboard },
                { key: 'office' as WorkspaceTab, label: 'Office', icon: SquareTerminal },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWorkspaceTab(key)}
                  className={[
                    'flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition',
                    workspaceTab === key ? 'border-blue-400 text-blue-200' : 'border-transparent text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {workspaceTab === 'conversation' && (
                selectedMember ? (
                  <div className="space-y-3">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedMember.color || '#60a5fa' }} />
                        <div>
                          <p className="text-sm font-medium text-white">{selectedMember.displayName || selectedMember.roleName}</p>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{MEMBER_STATUS_META[selectedMember.status] || selectedMember.status}</p>
                        </div>
                      </div>
                    </div>
                    {memberMessages.map((message) => (
                      <div key={message.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <span>{message.fromRole}</span>
                          {message.toRole && (
                            <>
                              <span>→</span>
                              <span>{message.toRole}</span>
                            </>
                          )}
                          <span className="ml-auto">{formatTime(message.timestamp)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{message.content}</p>
                      </div>
                    ))}
                    {memberMessages.length === 0 && <EmptyHint text="当前成员还没有被路由到的消息。" />}
                  </div>
                ) : (
                  <CenteredEmpty icon={Bot} title="选择成员查看对话" description="工作区会优先展示当前成员收发的消息流，便于你像 claudeops 一样按成员观察团队状态。" />
                )
              )}

              {workspaceTab === 'status' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <MetricPanel label="进行中成员" value={String(stats.runningMembers)} hint="当前状态为 running 的团队成员数量。" />
                  <MetricPanel label="完成成员" value={String(stats.completedMembers)} hint="已经完成本轮目标的成员数量。" />
                  <MetricPanel label="团队任务" value={String(stats.taskCount)} hint="当前实例的任务总数。" />
                  <MetricPanel label="消息总量" value={String(stats.messageCount)} hint="当前实例已收集的团队消息。" />
                  <MetricPanel label="工作目录" value={selectedInstance?.workingDirectory || '未设置'} hint="实例启动时指定的工作目录。" />
                  <MetricPanel label="启动时间" value={formatTime(selectedInstance?.startedAt)} hint="这里保留 claudeops 右侧状态区的统计位置。" />
                </div>
              )}

              {workspaceTab === 'office' && (
                selectedInstance ? (
                  <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.08),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.94))] p-5">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Office Scene</p>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {selectedInstance.members.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setSelectedMemberId(member.id)}
                          className={[
                            'rounded-[24px] border px-4 py-4 text-left transition',
                            selectedMemberId === member.id
                              ? 'border-blue-400/25 bg-blue-500/12 text-white'
                              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/15 hover:bg-white/[0.05]',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-[18px] border"
                              style={{
                                borderColor: `${member.color || '#60a5fa'}55`,
                                backgroundColor: `${member.color || '#60a5fa'}22`,
                                color: member.color || '#60a5fa',
                              }}
                            >
                              <SquareTerminal size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{member.displayName || member.roleName}</p>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{MEMBER_STATUS_META[member.status] || member.status}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs leading-6 text-slate-400">{member.roleName} 的工作位占位已经放上来，后续可以继续替换成 claudeops 的像素办公室场景。</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CenteredEmpty icon={SquareTerminal} title="Office Scene" description="等团队实例被选中后，这里会展示成员工作位和状态分布。" />
                )
              )}
            </div>
          </section>
        </Allotment.Pane>
      </Allotment>

      {showEditor && (
        <TeamTemplateEditor
          team={editingTeam}
          onClose={() => {
            setShowEditor(false)
            setEditingTeam(null)
          }}
        />
      )}

      {showStartDialog && <StartTeamDialog teamId={showStartDialog} onClose={() => setShowStartDialog(null)} />}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function MetricPanel({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 break-all text-xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-6 text-slate-400">{hint}</p>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.02] px-4 py-4 text-sm leading-6 text-slate-500">{text}</div>
}

function CenteredEmpty({ icon: Icon, title, description }: { icon: typeof Users; title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-8 text-center text-slate-400">
      <div className="flex h-16 w-16 items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] text-blue-200">
        <Icon size={24} />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">{description}</p>
    </div>
  )
}

function StartTeamDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const [workDir, setWorkDir] = useState('')
  const [task, setTask] = useState('')
  const { startInstance, definition } = useTeamStore(useShallow((state) => ({
    startInstance: state.startInstance,
    definition: state.definitions.find((team) => team.id === teamId),
  })))

  const handleStart = async () => {
    if (!workDir.trim() || !task.trim()) return
    await startInstance(teamId, workDir.trim(), task.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-[30px] border border-white/10 bg-slate-950/96 p-6 shadow-[0_28px_64px_rgba(15,23,42,0.42)]" onClick={(event) => event.stopPropagation()}>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Launch Team</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{definition?.name || '启动团队实例'}</h3>
        <p className="mt-2 text-sm leading-7 text-slate-400">这里接回 claudeops 的 launch flow，用真实 Go 后端启动新的团队实例。</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-slate-500">Working Directory</label>
            <input
              value={workDir}
              onChange={(event) => setWorkDir(event.target.value)}
              placeholder="C:\\Users\\12915\\Desktop\\AllBeingsFuture\\..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400/25"
            />
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-slate-500">Task Goal</label>
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              rows={4}
              placeholder="描述这次团队编排的目标、约束和预期产出。"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400/25"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06]">
            取消
          </button>
          <button type="button" onClick={() => void handleStart()} disabled={!workDir.trim() || !task.trim()} className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-40">
            启动团队
          </button>
        </div>
      </div>
    </div>
  )
}
