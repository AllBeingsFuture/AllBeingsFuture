import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Github, Loader2, MessageCircle, QrCode, Send } from 'lucide-react'
import { SystemSettingsService } from '../../../bindings/allbeingsfuture/internal/services'
import { AppAPI, FeedbackAPI } from '../../../bindings/electron-api'

const GITHUB_OWNER = 'AllBeingsFuture'
const GITHUB_REPO = 'AllBeingsFuture'
const GITHUB_TOKEN_KEY = 'feedback.githubToken'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new`
const GITHUB_ISSUES_LIST_URL = `${GITHUB_REPO_URL}/issues`
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
  const [githubToken, setGithubToken] = useState('')
  const [isLoadingToken, setIsLoadingToken] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdIssue, setCreatedIssue] = useState<{ number: number; url: string; title: string } | null>(null)

  useEffect(() => {
    let active = true

    const loadGithubToken = async () => {
      try {
        const savedToken = await SystemSettingsService.Get(GITHUB_TOKEN_KEY)
        if (active) {
          setGithubToken(savedToken)
        }
      } catch (error) {
        console.error('[FeedbackTab] load GitHub token failed:', error)
      } finally {
        if (active) {
          setIsLoadingToken(false)
        }
      }
    }

    void loadGithubToken()
    return () => {
      active = false
    }
  }, [])

  const issueDraft = useMemo(() => {
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

    return {
      title,
      body,
      url: `${GITHUB_ISSUES_URL}?${params.toString()}`,
    }
  }, [description, selectedType])

  const openExternal = async (targetUrl: string) => {
    await AppAPI.openExternal(targetUrl)
  }

  const handleDirectSubmit = async () => {
    const trimmedDescription = description.trim()
    const trimmedToken = githubToken.trim()

    setSubmitError('')
    setCreatedIssue(null)

    if (!trimmedToken) {
      setSubmitError('请先填写 GitHub Token，才能在应用内直接创建 Issue。')
      return
    }

    if (!trimmedDescription) {
      setSubmitError('请先填写问题描述，再直接提交。')
      return
    }

    setIsSubmitting(true)
    try {
      await SystemSettingsService.Update(GITHUB_TOKEN_KEY, trimmedToken)
      const issue = await FeedbackAPI.submitGithubIssue({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        token: trimmedToken,
        title: issueDraft.title,
        body: issueDraft.body,
      })
      setCreatedIssue(issue)
      setDescription('')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '提交失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
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

        <div>
          <label className="block text-xs text-gray-500 mb-1">GitHub Token</label>
          <input
            type="password"
            value={githubToken}
            onChange={e => setGithubToken(e.target.value)}
            placeholder="配置后可在应用内直接创建 Issue"
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent/60 transition-colors"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Token 仅保存在本机，用于直接调用 GitHub Issues API。需要对目标仓库具备 `Issues: write` 权限。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDirectSubmit}
            disabled={isSubmitting || isLoadingToken}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {isSubmitting ? '正在直接提交...' : '直接提交到 GitHub'}
          </button>
          <button
            onClick={() => openExternal(issueDraft.url)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs border border-dark-border text-gray-300 rounded-lg hover:text-white hover:border-white/20 transition-colors"
          >
            <ExternalLink size={12} />
            浏览器提交
          </button>
        </div>

        {submitError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {submitError}
          </div>
        )}

        {createdIssue && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              <span>已直接创建 GitHub Issue #{createdIssue.number}</span>
            </div>
            <button
              onClick={() => openExternal(createdIssue.url)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-200 hover:text-white transition-colors"
            >
              <ExternalLink size={11} />
              打开已创建的 Issue
            </button>
          </div>
        )}
      </div>

      {/* Alternative channels */}
      <div className="px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg">
        <p className="text-xs font-medium mb-2">其他反馈渠道</p>
        <div className="space-y-1.5">
          <button
            onClick={() => openExternal(GITHUB_ISSUES_LIST_URL)}
            className="flex w-full items-start gap-2 text-left text-xs text-gray-400 hover:text-white transition-colors"
          >
            <Github size={12} className="mt-0.5 shrink-0" />
            <span>GitHub Issues — 查看已有反馈、历史问题与处理进度</span>
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
        已配置 Token 时可以在应用内直接提交到 GitHub；未配置时仍可使用浏览器提交通道。日常讨论或社群支持优先使用 Telegram 或微信群。
      </p>
    </div>
  )
}
