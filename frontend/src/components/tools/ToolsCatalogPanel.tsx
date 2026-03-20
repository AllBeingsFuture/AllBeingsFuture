/**
 * ToolsCatalogPanel - 内置工具目录面板
 *
 * 展示 AllBeingsFuture 平台 96+ 款内置工具，
 * 按 18 大类别分组，支持搜索过滤和折叠展开。
 */

import { useState, useMemo } from 'react'
import {
  Search,
  ChevronRight,
  FolderOpen,
  Globe,
  Monitor,
  Brain,
  Clock,
  Plug,
  MessageSquare,
  ListChecks,
  Cpu,
  Sparkles,
  Package,
  Network,
  Store,
  ShoppingBag,
  Settings,
  UserCircle,
  Puzzle,
  Wrench,
  Terminal,
} from 'lucide-react'
import { TOOL_CATEGORIES, TOTAL_TOOL_COUNT, TOTAL_CATEGORY_COUNT } from './toolsData'
import type { ToolCategory } from './toolsData'

/** lucide icon name → component 映射 */
const ICON_MAP: Record<string, React.ElementType> = {
  FolderOpen,
  Globe,
  Monitor,
  Search,
  Brain,
  Puzzle,
  Clock,
  Network,
  Plug,
  MessageSquare,
  ListChecks,
  Cpu,
  Sparkles,
  UserCircle,
  Store,
  Package,
  ShoppingBag,
  Settings,
}

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Wrench
  return <Icon className={className} />
}

export default function ToolsCatalogPanel() {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleCategory = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    setExpanded(new Set(TOOL_CATEGORIES.map(c => c.id)))
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  /** 搜索过滤 */
  const filtered = useMemo(() => {
    if (!query.trim()) return TOOL_CATEGORIES

    const q = query.toLowerCase()
    return TOOL_CATEGORIES
      .map(cat => ({
        ...cat,
        tools: cat.tools.filter(
          t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
        ),
      }))
      .filter(cat =>
        cat.tools.length > 0 ||
        cat.label.toLowerCase().includes(q) ||
        cat.labelEn.toLowerCase().includes(q)
      )
  }, [query])

  const filteredToolCount = filtered.reduce((sum, cat) => sum + cat.tools.length, 0)

  // 搜索时自动展开所有匹配分类
  const effectiveExpanded = query.trim()
    ? new Set(filtered.map(c => c.id))
    : expanded

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              内置工具
            </span>
          </div>
          <span className="text-[10px] text-text-muted tabular-nums">
            {filteredToolCount} / {TOTAL_TOOL_COUNT} 款
          </span>
        </div>

        {/* 搜索框 */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="搜索工具名称或描述..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full h-7 pl-8 pr-3 text-xs bg-bg-primary border border-border rounded-md
                         text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20
                         transition-colors"
            />
          </div>
        </div>

        {/* 展开/收起全部 */}
        {!query.trim() && (
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              onClick={expandAll}
              className="text-[10px] text-text-muted hover:text-accent-blue transition-colors"
            >
              展开全部
            </button>
            <span className="text-text-muted text-[10px]">·</span>
            <button
              onClick={collapseAll}
              className="text-[10px] text-text-muted hover:text-accent-blue transition-colors"
            >
              收起全部
            </button>
          </div>
        )}
      </div>

      {/* 统计概览 */}
      <div className="shrink-0 px-3 py-2.5 bg-gradient-to-r from-accent-blue/5 to-transparent border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-xs text-text-secondary font-medium">{TOTAL_TOOL_COUNT}</span>
            <span className="text-[10px] text-text-muted">款工具</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-accent-green" />
            <span className="text-xs text-text-secondary font-medium">{TOTAL_CATEGORY_COUNT}</span>
            <span className="text-[10px] text-text-muted">个类别</span>
          </div>
        </div>
      </div>

      {/* 分类列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Search className="w-5 h-5 text-text-muted" />
            <p className="text-xs text-text-muted">未找到匹配的工具</p>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map(cat => (
              <CategorySection
                key={cat.id}
                category={cat}
                isExpanded={effectiveExpanded.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
                searchQuery={query}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 分类折叠区 ────────────────────────────────────── */

interface CategorySectionProps {
  category: ToolCategory
  isExpanded: boolean
  onToggle: () => void
  searchQuery: string
}

function CategorySection({ category, isExpanded, onToggle, searchQuery }: CategorySectionProps) {
  return (
    <div className="border-b border-white/[0.03] last:border-b-0">
      {/* 分类标题 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors group"
      >
        <ChevronRight
          className={[
            'w-3 h-3 text-text-muted transition-transform duration-200',
            isExpanded ? 'rotate-90' : '',
          ].join(' ')}
        />
        <CategoryIcon name={category.icon} className={`w-3.5 h-3.5 ${category.color}`} />
        <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors flex-1 text-left">
          {category.label}
        </span>
        <span className="text-[10px] text-text-muted tabular-nums">
          {category.tools.length}
        </span>
      </button>

      {/* 工具列表 */}
      {isExpanded && (
        <div className="pb-1">
          {category.tools.map(tool => (
            <ToolRow key={tool.name} name={tool.name} description={tool.description} query={searchQuery} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 工具行 ────────────────────────────────────── */

interface ToolRowProps {
  name: string
  description: string
  query: string
}

function ToolRow({ name, description, query }: ToolRowProps) {
  return (
    <div className="flex items-start gap-2 px-3 pl-9 py-1.5 hover:bg-white/[0.03] transition-colors group">
      <div className="w-1.5 h-1.5 rounded-full bg-accent-blue/40 mt-1.5 shrink-0 group-hover:bg-accent-blue transition-colors" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <code className="text-[11px] font-mono text-accent-blue/80 group-hover:text-accent-blue transition-colors">
            {highlightMatch(name, query)}
          </code>
        </div>
        <p className="text-[10px] text-text-muted leading-relaxed mt-0.5 line-clamp-2">
          {highlightMatch(description, query)}
        </p>
      </div>
    </div>
  )
}

/* ── 搜索高亮 ────────────────────────────────────── */

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text

  const q = query.toLowerCase()
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return text

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/20 text-yellow-300 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}
