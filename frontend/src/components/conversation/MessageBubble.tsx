import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
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

  const assistantHeaderClass = isCommentary
    ? 'text-zinc-400/80'
    : 'text-zinc-500'

  const assistantBodyClass = isCommentary
    ? 'relative w-full border-l border-white/[0.06] pl-4 pr-1 py-0.5'
    : 'relative w-full py-0.5'

  const assistantStateLabel = isPartial
    ? (isCommentary ? '处理中' : '正在回复')
    : undefined
  const commentaryTextClass = 'whitespace-pre-wrap break-words text-[15px] leading-[1.8] tracking-[0.005em] text-zinc-200/90'
  const assistantTextClass = 'whitespace-pre-wrap break-words text-[15px] leading-[1.8] tracking-[0.005em] text-zinc-100/94'
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
    <div className="space-y-3">
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

  const thinkingSeconds = Math.max(1, Math.round((thinkingText?.length || 0) / 180))

  return (
    <>
      <motion.div
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div
          className={[
            'flex min-w-0 flex-col gap-2',
            isUser ? 'max-w-[min(85%,28rem)] items-end' : 'w-full max-w-[42rem] items-start',
          ].join(' ')}
        >
          {thinkingText && (
            <div className="w-full">
              <button
                type="button"
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                className="group inline-flex items-center gap-1.5 rounded-lg py-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {thinkingExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="font-medium tracking-wide">
                  {isPartial ? `思考中 · ${thinkingSeconds}s` : `思考完成 · ${thinkingSeconds}s`}
                </span>
              </button>

              <AnimatePresence>
                {thinkingExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    className="mt-1.5 max-h-[220px] overflow-y-auto rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-500 scrollbar-thin"
                  >
                    <div className="md-prose md-prose-muted">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(value) => value}>
                        {thinkingText}
                      </ReactMarkdown>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isUser && (assistantStateLabel || !isPartial) && (
            <div className={`flex items-center gap-2 px-0.5 text-[11px] ${assistantHeaderClass}`}>
              {!isPartial && (
                <span className="font-medium tracking-[0.01em] text-zinc-400/90">{providerInfo.label}</span>
              )}
              {assistantStateLabel && (
                <>
                  {!isPartial && <span className="h-1 w-1 rounded-full bg-zinc-600" />}
                  <span>{assistantStateLabel}</span>
                </>
              )}
            </div>
          )}

          <div
            className={[
              isUser
                ? 'rounded-[1.25rem] rounded-br-md bg-white/[0.08] px-4 py-2.5 text-[14px] leading-relaxed text-zinc-100'
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
              <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.8] text-zinc-200/88">
                {displayContent || (
                  <span className="italic text-zinc-600">等待响应...</span>
                )}
              </div>
            ) : displayContent ? (
              <>
                {hasRichMarkdown ? (
                  renderMarkdownAssistant(
                    isCommentary ? 'md-prose opacity-90' : 'md-prose',
                  )
                ) : (
                  <>
                    {shouldCollapsePlainAssistant && !plainExpanded ? (
                      <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3.5">
                        <div className="mb-2 flex items-center gap-2 text-[10px]">
                          <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-medium tracking-[0.08em] text-zinc-400/80">
                            {collapsedCardLabel}
                          </span>
                          <span className="text-zinc-600">{formatNumber((displayContent || '').length)} 字符</span>
                          <span className="text-zinc-600">滚动查看</span>
                        </div>
                        <div
                          data-testid="message-scroll-preview"
                          className="overflow-y-auto overscroll-contain pr-2 scrollbar-thin"
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
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
                      >
                        <span>{plainToggleLabel}</span>
                        {plainExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <span className="text-xs italic text-zinc-600">空回复</span>
            )}
          </div>

          {!isUser && !isPartial && ((message as any).usage || (message as any).timestamp) && (
            <div className="mt-0.5 flex items-center gap-2 px-0.5">
              {(message as any).usage?.cacheReadTokens > 0 && (
                <span className="font-mono text-[10px] text-zinc-600">
                  cache hit {formatNumber((message as any).usage.cacheReadTokens)}
                </span>
              )}
              {(message as any).timestamp && (
                <span className="text-[10px] text-zinc-600">
                  {formatRelativeTime((message as any).timestamp)}
                </span>
              )}
            </div>
          )}
        </div>
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
