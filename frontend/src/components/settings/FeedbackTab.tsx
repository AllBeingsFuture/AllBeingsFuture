import { useMemo, useState } from 'react'
import { ExternalLink, Github, MessageCircle, QrCode, Send } from 'lucide-react'
import { AppAPI } from '../../../bindings/electron-api'

const GITHUB_REPO_URL = 'https://github.com/AllBeingsFuture/AllBeingsFuture'
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new`
const TELEGRAM_GROUP_URL = 'https://t.me/AllBeingsFuture'
const WECHAT_GROUP_NAME = 'AllBeingsFuture'
const WECHAT_GROUP_QR_URL = new URL('../../assets/wechat-group-qr.jpg', import.meta.url).href

const FEEDBACK_TYPES = [
  { label: '功能建议', color: 'text-purple-400 border-purple-500/30 hover:border-purple-500/60' },
  { label: 'Bug 报告', color: 'text-yellow-400 border-yellow-500/30 hover:border-yellow-500/60' },
  { label: 'UI 问题', color: 'text-blue-400 border-blue-500/30 hover:border-blue-500/60' },
  { label: '崩溃报告', color: 'text-red-400 border-red-500/30 hover:border-red-500/60' },
] as const

export default function FeedbackTab() {
  const [selectedType, setSelectedType] = useState<(typeof FEEDBACK_TYPES)[number]['label']>('Bug 报告')
  const [description, setDescription] = useState('')

  const issueUrl = useMemo(() => {
    const trimmedDescription = description.trim()
    const title = `[${selectedType}] ${trimmedDescription.slice(0, 48) || '请补充问题摘要'}`
    const body = [
      `### 反馈类型`,
      selectedType,
      '',
      '### 问题描述',
      trimmedDescription || '请在这里补充你的问题现象、复现步骤、预期结果和当前结果。',
      '',
      '### 补充信息',
      '- AllBeingsFuture 版本：',
      '- Provider：',
      '- 操作系统：',
      '- 复现频率：',
    ].join('\n')

    const params = new URLSearchParams({
      title,
      body,
    })

    return `${GITHUB_ISSUES_URL}?${params.toString()}`
  }, [description, selectedType])

  const openExternal = async (targetUrl: string) => {
    await AppAPI.openExternal(targetUrl)
  }

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
            {FEEDBACK_TYPES.map(type => (
              <button
                key={type.label}
                onClick={() => setSelectedType(type.label)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  selectedType === type.label
                    ? `${type.color} bg-white/5`
                    : 'text-gray-400 border-dark-border hover:text-white'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="请描述你遇到的问题或建议..."
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm resize-none outline-none focus:border-dark-accent/60 transition-colors"
          />
        </div>

        <button
          onClick={() => openExternal(issueUrl)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          <Send size={12} />
          提交到 GitHub
        </button>
      </div>

      {/* Alternative channels */}
      <div className="px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg">
        <p className="text-xs font-medium mb-2">其他反馈渠道</p>
        <div className="space-y-1.5">
          <button
            onClick={() => openExternal(issueUrl)}
            className="flex w-full items-start gap-2 text-left text-xs text-gray-400 hover:text-white transition-colors"
          >
            <Github size={12} className="mt-0.5 shrink-0" />
            <span>GitHub Issues — 默认反馈入口，提交 Bug 或功能请求</span>
          </button>
          <button
            onClick={() => openExternal(TELEGRAM_GROUP_URL)}
            className="flex w-full items-start gap-2 text-left text-xs text-gray-400 hover:text-white transition-colors"
          >
            <MessageCircle size={12} className="mt-0.5 shrink-0" />
            <span>Telegram 群组 — 实时讨论和社区支持</span>
          </button>
          <div className="flex items-start gap-2 text-xs text-gray-400">
            <QrCode size={12} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>微信群 — <span className="text-white">{WECHAT_GROUP_NAME}</span></p>
              <p className="text-[11px] text-gray-500">群二维码通常 7 天有效，请以 README 顶部或群运营最新发布的二维码为准。</p>
              <img
                src={WECHAT_GROUP_QR_URL}
                alt={`${WECHAT_GROUP_NAME} 微信群二维码`}
                className="mt-2 w-full max-w-[220px] rounded-xl border border-white/10 bg-white p-2"
              />
            </div>
          </div>
          <button
            onClick={() => openExternal(GITHUB_REPO_URL)}
            className="flex w-full items-start gap-2 text-left text-xs text-gray-500 hover:text-white transition-colors"
          >
            <ExternalLink size={12} className="mt-0.5 shrink-0" />
            <span>打开项目主页 — 查看最新 README 与社区入口</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        反馈默认提交到 GitHub Issues；如果是日常讨论或社群支持，优先使用 Telegram 或微信群。
      </p>
    </div>
  )
}
