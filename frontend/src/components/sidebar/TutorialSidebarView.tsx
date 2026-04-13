/**
 * 教程侧边栏 - 占位组件
 */

import { BookOpen, Search, Rocket, Cpu, Users, Wrench } from 'lucide-react'
import { useState } from 'react'

const CATEGORIES = [
  { name: '快速入门', icon: Rocket, items: ['创建第一个会话', '基本操作指南', '快捷键一览'] },
  { name: '核心功能', icon: Cpu, items: ['会话管理', '文件资源管理', 'Git 集成'] },
  { name: '开发协作', icon: Users, items: ['Agent Teams', '多会话编排', '任务看板'] },
  { name: '进阶能力', icon: Wrench, items: ['MCP 工具', '技能系统', '工作流自动化'] },
]

export default function TutorialSidebarView() {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? CATEGORIES.map(cat => ({
        ...cat,
        items: cat.items.filter(item => item.toLowerCase().includes(search.toLowerCase())),
      })).filter(cat => cat.items.length > 0)
    : CATEGORIES

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          教程中心
        </span>
      </div>

      <div className="px-2 py-1.5 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索教程..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-bg-primary border border-border rounded
                       text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent-blue/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-3">
        {filtered.length === 0 && (
          <div className="text-xs text-text-muted text-center py-6">
            未找到匹配的教程
          </div>
        )}

        {filtered.map(category => {
          const CatIcon = category.icon
          return (
            <div key={category.name}>
              <div className="flex items-center gap-1.5 px-1 py-1">
                <CatIcon className="w-3 h-3 text-text-muted" />
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {category.name}
                </span>
              </div>
              <div className="space-y-0.5">
                {category.items.map(item => (
                  <button
                    key={item}
                    className="w-full text-left px-2 py-1.5 rounded-md transition-colors text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  >
                    <div className="text-xs font-medium leading-tight">{item}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
