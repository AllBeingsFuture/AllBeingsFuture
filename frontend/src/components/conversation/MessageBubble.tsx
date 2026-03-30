import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronDown, ChevronRight, Sparkles, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import { AppAPI } from '../../../bindings/electron-api'
import { resolveProviderDisplayInfo } from '../../utils/providerDisplay'
import ImageViewer from './ImageViewer'

const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/
const THINKING_STRIP_RE = /<thinking>[\s\S]*?<\/thinking>/
const MARKDOWN_HINT_RE = /(^|\n)(#{1,6}\s|[-*+]\s|> |\d+\.\s)|```|\[[^\]]+\]\([^)]+\)|\|.+\|/
const COMMENTARY_COLLAPSE_THRESHOLD = 320
const ASSISTANT_COLLAPSE_THRESHOLD = 560
const COMMENTARY_PREVIEW_HEIGHT = 220
const ASSISTANT_PREVIEW_HEIGHT = 280

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  if (diff < 0 || isNaN(diff)) return ''
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return '刚刚'
  if (seconds < 60) return `${seconds}秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

function looksLikeRichMarkdown(text: string): boolean {
  return MARKDOWN_HINT_RE.test(text)
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
}

interface Props {
  message: ChatMessage
  isStreaming?: boolean
  providerId?: string
}

type ExtendedMessage = ChatMessage & {
  images?: string[]
  presentation?: 'message' | 'commentary'
}

export default function MessageBubble({ message, providerId }: Props) {
  const extendedMessage = message as ExtendedMessage
  const isUser = message.role === 'user'
  const isPartial = message.partial
  const [thinkingExpanded, setThinkingExpanded] = useState(true)
  const [plainExpanded, setPlainExpanded] = useState(true)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const providerInfo = useMemo(() => resolveProviderDisplayInfo(providerId), [providerId])
  const userImages = useMemo(() => (isUser ? extendedMessage.images : undefined), [extendedMessage.images, isUser])

  const thinkingMatch = !isUser ? message.content?.match(THINKING_RE) : null
  const thinkingText = thinkingMatch?.[1]?.trim()
  const displayContent = thinkingMatch
    ? message.content.replace(THINKING_STRIP_RE, '').trim()
    : message.content

  const hasRichMarkdown = !isUser && !isPartial && looksLikeRichMarkdown(displayContent || '')
  const plainParagraphs = useMemo(() => splitParagraphs(displayContent || ''), [displayContent])
  const isCommentary = !isUser
    && !isPartial
    && !thinkingText
    && extendedMessage.presentation === 'commentary'

  const assistantAvatarClass = isCommentary
    ? 'border border-white/[0.06] bg-white/[0.035] text-sky-100'
    : 'border border-white/[0.08] bg-[linear-gradient(180deg,rgba(30,41,59,0.72),rgba(15,23,42,0.96))] text-slate-100 shadow-[0_10px_28px_rgba(2,6,23,0.22)]'

  const assistantHeaderClass = isCommentary
    ? 'text-sky-200/80'
    : 'text-slate-400/88'

  const assistantBodyClass = isCommentary
    ? 'relative border-l border-white/[0.08] pl-4 pr-1 py-0.5'
    : 'relative py-0.5'

  const assistantStateLabel = isPartial
    ? (isCommentary ? '处理中' : '正在回复')
    : undefined
  const commentaryTextClass = 'whitespace-pre-wrap break-words text-[14px] leading-[1.85] tracking-[0.01em] text-slate-200/88'
  const assistantTextClass = 'whitespace-pre-wrap break-words text-[15px] leading-8 tracking-[0.01em] text-slate-100/94'
  const plainCollapseThreshold = isCommentary ? COMMENTARY_COLLAPSE_THRESHOLD : ASSISTANT_COLLAPSE_THRESHOLD
  const collapsedPreviewHeight = isCommentary ? COMMENTARY_PREVIEW_HEIGHT : ASSISTANT_PREVIEW_HEIGHT

  const shouldCollapsePlainAssistant = !isUser
    && !isPartial
    && !hasRichMarkdown
    && !thinkingText
    && (displayContent || '').trim().length > plainCollapseThreshold

  const plainToggleLabel = plainExpanded
    ? '恢复滚动预览'
    : (isCommentary ? '展开详情' : '展开全文')
  const collapsedCardLabel = isCommentary ? '处理说明' : '长回复'

  useEffect(() => {
    setPlainExpanded(!shouldCollapsePlainAssistant)
  }, [displayContent, shouldCollapsePlainAssistant])

  const renderPlainAssistant = (paragraphClass: string) => (
    <div className="space-y-2.5">
      {(plainParagraphs.length > 0 ? plainParagraphs : [displayContent]).map((paragraph, index) => (
        <p key={index} className={paragraphClass}>
          {paragraph}
        </p>
      ))}
    </div>
  )

  const renderMarkdownAssistant = (className: string) => (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(value) => value}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href) void AppAPI.openInExplorer(href)
              }}
              title={href}
            >
              {children}
            </a>
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  )

  return (
    <>
      <motion.div
        className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {!isUser && (
          <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${assistantAvatarClass}`}>
            <Bot size={15} />
          </div>
        )}

        <div className={`flex min-w-0 flex-col gap-1.5 ${isUser ? 'max-w-[80%]' : 'flex-1 max-w-none'}`}>
          {thinkingText && (
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="group flex items-center gap-1.5 self-start py-0.5 text-xs text-sky-300/60 transition-colors hover:text-sky-200"
            >
              {thinkingExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Sparkles size={11} className="opacity-70 group-hover:opacity-100" />
              <span className="font-medium">思考过程</span>
              <span className="text-[10px] text-slate-500">({formatNumber(thinkingText.length)} 字符)</span>
            </button>
          )}

          <AnimatePresence>
            {thinkingText && thinkingExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="max-h-[220px] overflow-y-auto rounded-2xl border border-sky-400/10 bg-[linear-gradient(180deg,rgba(18,24,38,0.8),rgba(10,15,25,0.9))] px-3.5 py-2.5 text-xs text-text-muted/70 scrollbar-thin scrollbar-thumb-sky-400/10"
              >
                <div className="prose prose-invert prose-xs max-w-none
                  prose-p:my-0.5 prose-p:leading-relaxed prose-p:text-text-muted/70
                  prose-headings:mb-0.5 prose-headings:mt-2 prose-headings:text-xs prose-headings:text-sky-200/80
                  prose-strong:text-sky-100/80
                  prose-em:text-slate-400
                  prose-code:rounded prose-code:bg-sky-400/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-code:text-sky-200/70 prose-code:before:content-none prose-code:after:content-none
                  prose-li:my-0 prose-li:text-text-muted/70
                  prose-ol:my-0.5 prose-ul:my-0.5
                  prose-a:text-sky-200/60 prose-a:no-underline
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(value) => value}>
                    {thinkingText}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isUser && (
            <div className={`flex items-center gap-2 px-0.5 text-[11px] ${assistantHeaderClass}`}>
              <span className="font-medium tracking-[0.01em] text-slate-100/92">{providerInfo.label}</span>
              {assistantStateLabel && (
                <>
                  <span className="h-1 w-1 rounded-full bg-current opacity-70" />
                  <span>{assistantStateLabel}</span>
                </>
              )}
            </div>
          )}

          <div
            className={[
              isUser
                ? 'rounded-2xl border border-blue-500/10 bg-blue-500/14 px-4 py-3 text-sm leading-relaxed text-text-primary'
                : assistantBodyClass,
            ].join(' ')}
            data-message-presentation={extendedMessage.presentation || 'message'}
          >
            {isUser ? (
              <div>
                {userImages && userImages.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {userImages.map((url: string, index: number) => (
                      <img
                        key={index}
                        src={url}
                        alt={`附件 ${index + 1}`}
                        className="max-h-[200px] max-w-[280px] cursor-pointer rounded-xl border border-white/10 object-contain transition-opacity hover:opacity-90"
                        onClick={() => setPreviewIndex(index)}
                      />
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            ) : isPartial ? (
              <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-slate-200/86">
                {displayContent || (
                  <span className="italic text-slate-500">等待响应...</span>
                )}
              </div>
            ) : displayContent ? (
              <>
                {hasRichMarkdown ? (
                  renderMarkdownAssistant(
                    isCommentary
                      ? `prose prose-invert prose-sm max-w-none
                        prose-p:my-2 prose-p:leading-7 prose-p:text-slate-200/88
                        prose-headings:mb-1.5 prose-headings:mt-4 prose-headings:text-slate-100
                        prose-code:rounded-md prose-code:bg-sky-400/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[11px] prose-code:text-sky-200 prose-code:before:content-none prose-code:after:content-none
                        prose-pre:my-2 prose-pre:rounded-2xl prose-pre:border prose-pre:border-white/[0.06] prose-pre:bg-[#0d1117]
                        prose-a:text-sky-300 prose-a:no-underline hover:prose-a:underline
                        prose-li:my-0.5 prose-li:text-slate-200/86
                        prose-table:text-xs
                        prose-th:border prose-th:border-white/[0.06] prose-th:px-2 prose-th:py-1
                        prose-td:border prose-td:border-white/[0.06] prose-td:px-2 prose-td:py-1
                        prose-strong:text-slate-50
                        prose-em:text-slate-300
                        prose-blockquote:rounded-r-xl prose-blockquote:border-sky-300/20 prose-blockquote:bg-sky-400/[0.03] prose-blockquote:py-1 prose-blockquote:text-slate-300`
                      : `prose prose-invert prose-sm max-w-none
                        prose-p:my-3 prose-p:leading-8 prose-p:text-slate-100/92
                        prose-headings:mb-2 prose-headings:mt-6 prose-headings:text-slate-50
                        prose-code:rounded-md prose-code:bg-sky-400/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:text-sky-200 prose-code:before:content-none prose-code:after:content-none
                        prose-pre:my-2 prose-pre:rounded-2xl prose-pre:border prose-pre:border-white/[0.06] prose-pre:bg-[#0d1117]
                        prose-a:text-sky-300 prose-a:no-underline hover:prose-a:underline
                        prose-li:my-0.5 prose-li:text-slate-100/90
                        prose-table:text-xs
                        prose-th:border prose-th:border-white/[0.06] prose-th:px-2 prose-th:py-1
                        prose-td:border prose-td:border-white/[0.06] prose-td:px-2 prose-td:py-1
                        prose-strong:text-white
                        prose-em:text-slate-300
                        prose-blockquote:rounded-r-xl prose-blockquote:border-sky-300/20 prose-blockquote:bg-sky-400/[0.03] prose-blockquote:py-1 prose-blockquote:text-slate-300`,
                  )
                ) : (
                  <>
                    {shouldCollapsePlainAssistant && !plainExpanded ? (
                      <div
                        className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-[0_12px_32px_rgba(2,6,23,0.14)] ${
                          isCommentary
                            ? 'border-sky-400/10 bg-[linear-gradient(180deg,rgba(20,28,42,0.82),rgba(10,15,25,0.94))]'
                            : 'border-white/[0.06] bg-[linear-gradient(180deg,rgba(17,24,39,0.72),rgba(8,12,20,0.96))]'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[10px]">
                          <span
                            className={`rounded-full border px-2 py-0.5 font-medium tracking-[0.12em] ${
                              isCommentary
                                ? 'border-sky-400/12 bg-sky-400/[0.08] text-sky-100/80'
                                : 'border-white/[0.08] bg-white/[0.04] text-slate-300/72'
                            }`}
                          >
                            {collapsedCardLabel}
                          </span>
                          <span className="text-slate-500/78">{formatNumber((displayContent || '').length)} 字符</span>
                          <span className="text-slate-500/64">滚动查看</span>
                        </div>
                        <div
                          data-testid="message-scroll-preview"
                          className="overflow-y-auto overscroll-contain pr-2 scrollbar-thin scrollbar-thumb-slate-500/20"
                          style={{ maxHeight: collapsedPreviewHeight }}
                        >
                          {isCommentary ? (
                            renderPlainAssistant(commentaryTextClass)
                          ) : (
                            renderPlainAssistant(assistantTextClass)
                          )}
                        </div>
                      </div>
                    ) : isCommentary ? (
                      renderPlainAssistant(commentaryTextClass)
                    ) : (
                      renderPlainAssistant(assistantTextClass)
                    )}

                    {shouldCollapsePlainAssistant && (
                      <button
                        type="button"
                        onClick={() => setPlainExpanded(value => !value)}
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${
                          isCommentary
                            ? 'border-sky-400/12 bg-sky-400/[0.06] text-sky-100/82 hover:bg-sky-400/[0.12] hover:text-sky-50'
                            : 'border-white/[0.08] bg-white/[0.03] text-slate-200/76 hover:bg-white/[0.06] hover:text-slate-100'
                        }`}
                      >
                        <span>{plainToggleLabel}</span>
                        {plainExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <span className="text-xs italic text-slate-500">空回复</span>
            )}
          </div>

          {!isUser && !isPartial && ((message as any).usage || (message as any).timestamp) && (
            <div className="mt-0.5 flex items-center gap-2 px-0.5">
              {(message as any).usage?.cacheReadTokens > 0 && (
                <span className="font-mono text-[10px] text-slate-500">
                  cache hit {formatNumber((message as any).usage.cacheReadTokens)}
                </span>
              )}
              {(message as any).timestamp && (
                <span className="text-[10px] text-slate-500">
                  {formatRelativeTime((message as any).timestamp)}
                </span>
              )}
            </div>
          )}
        </div>

        {isUser && (
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-500/10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-300 shadow-sm">
            <User size={15} />
          </div>
        )}
      </motion.div>

      {previewIndex !== null && userImages && (
        <ImageViewer
          images={userImages}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  )
}
