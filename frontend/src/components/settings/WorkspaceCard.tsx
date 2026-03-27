import { ChevronDown, ChevronRight, Pencil, Star, Trash2 } from 'lucide-react'
import type { Workspace } from '../../types/workspaceTypes'

interface WorkspaceCardProps {
  workspace: Workspace
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function WorkspaceCard({
  workspace, expanded, onToggle, onEdit, onDelete,
}: WorkspaceCardProps) {
  const primaryRepo = workspace.repos.find(r => r.isPrimary)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-bg-tertiary">
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{workspace.name}</span>
            <span className="text-xs text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded">
              {workspace.repos.length} {'\u4E2A\u4ED3\u5E93'}
            </span>
          </div>
          {workspace.description && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{workspace.description}</p>
          )}
          {primaryRepo ? (
            <p className="text-xs text-text-muted mt-0.5 font-mono truncate">
              {'\u4E3B\u4ED3\u5E93\uFF1A'}{primaryRepo.repoPath}
            </p>
          ) : (
            <p className="text-xs text-text-muted mt-0.5">{'\u65E0\u4E3B\u4ED3\u5E93'}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            title={'\u7F16\u8F91'}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
            title={'\u5220\u9664'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded repo list */}
      {expanded && (
        <div className="divide-y divide-border">
          {workspace.repos.map((repo) => (
            <div key={repo.id} className="flex items-center gap-2.5 px-4 py-2">
              {repo.isPrimary
                ? <Star className="w-3.5 h-3.5 text-accent-yellow flex-shrink-0" />
                : <div className="w-3.5 h-3.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{repo.name}</span>
                  {repo.isPrimary && (
                    <span className="text-xs text-accent-yellow bg-accent-yellow/10 px-1.5 py-0.5 rounded">
                      {'\u4E3B\u4ED3\u5E93'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted font-mono truncate">{repo.repoPath}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
