import { MessageCircle, Send, ExternalLink } from 'lucide-react'

export default function FeedbackTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium">反馈与建议</h4>
        <p className="text-xs text-gray-500 mt-1">帮助我们改进 AllBeingsFuture，你的反馈非常重要。</p>
      </div>

      {/* Quick feedback */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">反馈类型</label>
          <div className="flex gap-2">
            {[
              { label: '功能建议', color: 'text-purple-400 border-purple-500/30' },
              { label: 'Bug 报告', color: 'text-yellow-400 border-yellow-500/30' },
              { label: 'UI 问题', color: 'text-blue-400 border-blue-500/30' },
              { label: '崩溃报告', color: 'text-red-400 border-red-500/30' },
            ].map(type => (
              <button
                key={type.label}
                disabled
                className={`px-2.5 py-1 text-xs rounded-lg border opacity-50 cursor-not-allowed ${type.color}`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">描述</label>
          <textarea
            disabled
            rows={4}
            placeholder="请描述你遇到的问题或建议..."
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm resize-none outline-none opacity-50 cursor-not-allowed"
          />
        </div>

        <button
          disabled
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed"
        >
          <Send size={12} />
          提交反馈（即将推出）
        </button>
      </div>

      {/* Alternative channels */}
      <div className="px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg">
        <p className="text-xs font-medium mb-2">其他反馈渠道</p>
        <div className="space-y-1.5">
          <a
            href="#"
            onClick={e => e.preventDefault()}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ExternalLink size={12} />
            GitHub Issues — 提交 Bug 或功能请求
          </a>
          <a
            href="#"
            onClick={e => e.preventDefault()}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <MessageCircle size={12} />
            Telegram 群组 — 实时讨论和社区支持
          </a>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        内置反馈系统即将推出。当前可通过 GitHub Issues 提交反馈。
      </p>
    </div>
  )
}
