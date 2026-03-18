import { FolderOpen, Plus, Search, FileCode } from 'lucide-react'

export default function WorkspaceTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">工作区管理</h4>
          <p className="text-xs text-gray-500 mt-1">管理 Git 仓库和项目目录，支持批量导入。</p>
        </div>
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed"
        >
          <Plus size={14} />
          新建工作区
        </button>
      </div>

      {/* Empty state */}
      <div className="py-12 text-center border border-dashed border-dark-border rounded-xl">
        <FolderOpen size={40} className="mx-auto mb-3 text-gray-600" />
        <p className="text-sm text-gray-400 mb-1">暂无工作区</p>
        <p className="text-xs text-gray-500">创建工作区后可在此管理所有项目仓库。</p>
      </div>

      {/* Feature preview */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">计划支持的导入方式：</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Plus, label: '手动添加', desc: '逐个添加仓库路径' },
            { icon: Search, label: '扫描目录', desc: '递归发现 Git 仓库' },
            { icon: FileCode, label: '导入 VS Code', desc: '解析 .code-workspace' },
          ].map(item => (
            <div key={item.label} className="p-3 bg-dark-bg border border-dark-border rounded-lg">
              <item.icon size={16} className="mb-2 text-gray-500" />
              <p className="text-xs font-medium">{item.label}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        工作区功能即将推出。你可以在新建会话时直接指定工作目录。
      </p>
    </div>
  )
}
