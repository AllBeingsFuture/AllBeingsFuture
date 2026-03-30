import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { BookOpen, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { SkillService } from '../../../bindings/allbeingsfuture/internal/services'
import { useSkillStore, type Skill } from '../../stores/skillStore'

type SkillRuntimeInfo = {
  id: string
  rootDir?: string
  instructions?: string
  scripts?: string[]
  references?: string[]
}

const typeLabels: Record<string, string> = {
  all: '全部',
  native: '系统技能',
  orchestration: '编排技能',
  prompt: 'Prompt 技能',
}

const CARD_CONTENT_VISIBILITY_STYLE: CSSProperties = {
  contain: 'layout paint style',
  contentVisibility: 'auto',
  containIntrinsicSize: '260px',
}

interface SkillCardProps {
  skill: Skill
  info?: SkillRuntimeInfo
  isExpanded: boolean
  isDetailLoading: boolean
  optimizeRendering: boolean
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>
  onToggleDetails: (id: string) => Promise<void>
}

const SkillCard = memo(function SkillCard({
  skill,
  info,
  isExpanded,
  isDetailLoading,
  optimizeRendering,
  onToggleEnabled,
  onToggleDetails,
}: SkillCardProps) {
  const configCount = skill.config && !Array.isArray(skill.config) ? Object.keys(skill.config).length : 0

  return (
    <div
      className="rounded-xl border border-dark-border bg-dark-bg/70 p-4"
      style={optimizeRendering ? CARD_CONTENT_VISIBILITY_STYLE : undefined}
    >
      <div className="flex items-start gap-3">
        <BookOpen size={16} className="mt-0.5 shrink-0 text-blue-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h5 className="text-sm font-medium text-white">{skill.name}</h5>
              <span className="rounded-full bg-dark-border px-2 py-0.5 text-[10px] text-gray-300">
                {typeLabels[skill.type] ?? skill.type}
              </span>
              <span className="rounded-full bg-dark-border px-2 py-0.5 text-[10px] text-gray-300">
                {skill.source}
              </span>
              {skill.system ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                  system
                </span>
              ) : null}
            </div>
            <button
              role="switch"
              aria-checked={skill.enabled}
              title={skill.enabled ? '点击禁用' : '点击启用'}
              onClick={() => void onToggleEnabled(skill.id, !skill.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                skill.enabled ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  skill.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <p className="mt-1 text-xs leading-5 text-gray-400">{skill.description || '暂无描述'}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-400">
            <span className="rounded bg-dark-border px-2 py-0.5">分类: {skill.category || 'custom'}</span>
            {skill.author ? <span className="rounded bg-dark-border px-2 py-0.5">作者: {skill.author}</span> : null}
            {skill.slashCommand ? (
              <span className="rounded bg-blue-500/15 px-2 py-0.5 text-blue-300">
                /{skill.slashCommand}
              </span>
            ) : null}
            {configCount > 0 ? (
              <span className="rounded bg-blue-500/15 px-2 py-0.5 text-blue-300">
                配置项: {configCount}
              </span>
            ) : null}
            {skill.toolName ? <span className="rounded bg-dark-border px-2 py-0.5">tool: {skill.toolName}</span> : null}
            {skill.handler ? <span className="rounded bg-dark-border px-2 py-0.5">handler: {skill.handler}</span> : null}
          </div>

          {skill.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skill.tags.slice(0, 8).map((tag) => (
                <span key={tag} className="rounded bg-dark-border px-2 py-0.5 text-[10px] text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {skill.path ? (
            <div className="mt-3 text-xs text-gray-500">
              路径: <code>{skill.path}</code>
            </div>
          ) : null}

          <div className="mt-4">
            <button
              onClick={() => void onToggleDetails(skill.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white"
            >
              {isDetailLoading ? <Loader2 size={12} className="animate-spin" /> : isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {isExpanded ? '收起详情' : '查看详情'}
            </button>
          </div>

          {isExpanded ? (
            <div className="mt-4 space-y-4 rounded-xl border border-dark-border bg-[#0f172a]/60 p-4">
              <div>
                <div className="mb-2 text-xs font-medium text-white">技能说明</div>
                <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-dark-border bg-[#111827] px-3 py-2 text-xs leading-6 text-gray-300">
                  {info?.instructions || (isDetailLoading ? '正在加载…' : '暂无说明')}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-white">脚本</div>
                  {info?.scripts?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {info.scripts.map((script) => (
                        <span key={script} className="rounded bg-dark-border px-2 py-1 text-[11px] text-gray-300">
                          {script}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">未发现脚本文件</div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-white">参考文件</div>
                  {info?.references?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {info.references.map((reference) => (
                        <span key={reference} className="rounded bg-dark-border px-2 py-1 text-[11px] text-gray-300">
                          {reference}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">未发现参考文件</div>
                  )}
                </div>
              </div>

              {info?.rootDir ? (
                <div className="text-xs text-gray-500">
                  技能目录: <code>{info.rootDir}</code>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}, (prev, next) => (
  prev.skill === next.skill
  && prev.info === next.info
  && prev.isExpanded === next.isExpanded
  && prev.isDetailLoading === next.isDetailLoading
  && prev.optimizeRendering === next.optimizeRendering
))

export default function SkillsTab() {
  const { skills, loading, load, toggleEnabled } = useSkillStore(useShallow((state) => ({
    skills: state.skills,
    loading: state.loading,
    load: state.load,
    toggleEnabled: state.toggleEnabled,
  })))
  const [selectedType, setSelectedType] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [runtime, setRuntime] = useState<Record<string, SkillRuntimeInfo>>({})
  const [runtimeLoadingId, setRuntimeLoadingId] = useState<string | null>(null)
  const expandedRef = useRef(expanded)
  const runtimeRef = useRef(runtime)
  const deferredSkills = useDeferredValue(skills)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

  const handleRefresh = useCallback(() => {
    void load(true)
  }, [load])

  const handleTypeChange = useCallback((type: string) => {
    startTransition(() => {
      setSelectedType(type)
    })
  }, [])

  const handleToggleDetails = useCallback(async (skillId: string) => {
    if (expandedRef.current[skillId]) {
      setExpanded((state) => ({ ...state, [skillId]: false }))
      return
    }

    setExpanded((state) => ({ ...state, [skillId]: true }))
    if (runtimeRef.current[skillId]) return

    setRuntimeLoadingId(skillId)
    try {
      const info = await SkillService.GetRuntimeInfo(skillId)
      if (info) {
        setRuntime((state) => (
          state[skillId]
            ? state
            : { ...state, [skillId]: info as SkillRuntimeInfo }
        ))
      }
    } finally {
      setRuntimeLoadingId((current) => (current === skillId ? null : current))
    }
  }, [])

  const types = useMemo(
    () => ['all', ...Array.from(new Set(deferredSkills.map((skill) => skill.type || 'prompt')))],
    [deferredSkills],
  )

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deferredSkills.length }

    for (const skill of deferredSkills) {
      const type = skill.type || 'prompt'
      counts[type] = (counts[type] ?? 0) + 1
    }

    return counts
  }, [deferredSkills])

  const visibleSkills = useMemo(
    () => (
      selectedType === 'all'
        ? deferredSkills
        : deferredSkills.filter((skill) => (skill.type || 'prompt') === selectedType)
    ),
    [deferredSkills, selectedType],
  )

  const optimizeRendering = visibleSkills.length > 12

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">技能管理</h4>
          <p className="mt-1 text-xs text-gray-500">
            当前列表来自项目内的 <code>skills/</code> 目录和数据库状态。现在除了展示元数据，还支持启停、查看技能说明、脚本和参考文件。
          </p>
          <p className="mt-1 text-xs text-gray-500">
            聊天窗口里可以直接输入 <code>/slash-command</code> 触发已启用技能，例如 <code>/code-review</code>、<code>/datetime-tool</code>。
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {types.map((type) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              selectedType === type
                ? 'border-blue-500 bg-blue-500/10 text-white'
                : 'border-dark-border text-gray-400 hover:text-white'
            }`}
          >
            {typeLabels[type] ?? type}
            <span className="ml-1 text-[10px] opacity-70">{typeCounts[type] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {visibleSkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            info={runtime[skill.id]}
            isExpanded={!!expanded[skill.id]}
            isDetailLoading={runtimeLoadingId === skill.id}
            optimizeRendering={optimizeRendering}
            onToggleEnabled={toggleEnabled}
            onToggleDetails={handleToggleDetails}
          />
        ))}
      </div>

      {!loading && visibleSkills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <Sparkles size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm text-gray-400">当前筛选下没有可见技能</p>
          <p className="mt-1 text-xs text-gray-500">
            把新的技能目录放到 <code>skills/</code> 后点击刷新即可重新同步。
          </p>
        </div>
      ) : null}
    </div>
  )
}
