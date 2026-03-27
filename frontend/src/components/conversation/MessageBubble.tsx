import { memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, User, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppAPI } from '../../../bindings/electron-api'
import ImageViewer from './ImageViewer'

// Module-level cached regex to avoid re-creation on each render
const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/
const THINKING_STRIP_RE = /<thinking>[\s\S]*?<\/thinking>/

/** Format a number with comma separators (e.g. 68714 → "68,714") */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/** Format a timestamp as relative time (e.g. "刚刚", "3分钟前", "2小时前") */
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

interface Props {
  message: ChatMessage
  isStreaming?: boolean
}

type ImageMessage = ChatMessage & { images?: string[] }

function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'
  const isPartial = message.partial
  const [thinkingExpanded, setThinkingExpanded] = useState(true)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const userImages = isUser ? (message as ImageMessage).images : undefined

  // Extract thinking text if embedded in content (format: <thinking>...</thinking>)
  const thinkingMatch = !isUser ? message.content?.match(THINKING_RE) : null
  const thinkingText = thinkingMatch?.[1]?.trim()
  const displayContent = thinkingMatch
    ? message.content.replace(THINKING_STRIP_RE, '').trim()
    : message.content

  return (
    <>
    <motion.div
      className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/10 text-purple-300 shadow-sm">
          <Bot size={15} />
        </div>
      )}

      <div className="max-w-[80%] min-w-0 flex flex-col gap-1.5">
        {/* Thinking block (collapsible) */}
        {thinkingText && (
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="group flex items-center gap-1.5 text-xs text-purple-400/50 hover:text-purple-300 transition-colors self-start py-0.5"
          >
            {thinkingExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Sparkles size={11} className="opacity-70 group-hover:opacity-100" />
            <span className="font-medium">思考过程</span>
            <span className="text-gray-600 text-[10px]">({formatNumber(thinkingText.length)} 字符)</span>
          </button>
        )}
        <AnimatePresence>
          {thinkingText && thinkingExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="rounded-xl border border-purple-500/10 bg-gradient-to-br from-purple-500/[0.04] to-blue-500/[0.02] px-3.5 py-2.5 text-xs text-text-muted/70 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/10"
            >
              <div className="prose prose-invert prose-xs max-w-none
                prose-p:my-0.5 prose-p:leading-relaxed prose-p:text-text-muted/70
                prose-headings:text-purple-300/80 prose-headings:mt-2 prose-headings:mb-0.5 prose-headings:text-xs
                prose-strong:text-purple-200/80
                prose-em:text-gray-400
                prose-code:text-purple-300/70 prose-code:bg-purple-500/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px] prose-code:before:content-none prose-code:after:content-none
                prose-li:my-0 prose-li:text-text-muted/70
                prose-ol:my-0.5 prose-ul:my-0.5
                prose-a:text-purple-300/60 prose-a:no-underline
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {thinkingText}
                </ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main message bubble */}
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-blue-500/15 text-text-primary border border-blue-500/10'
              : 'bg-white/[0.03] text-text-primary border border-white/[0.06]',
          ].join(' ')}
        >
          {isUser ? (
            <div>
              {userImages && userImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {userImages.map((url: string, i: number) => (
                    <img
                      key={i}
                      src={url}
                      alt={`附件 ${i + 1}`}
                      className="max-w-[280px] max-h-[200px] rounded-xl border border-white/10 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewIndex(i)}
                    />
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          ) : isPartial ? (
            /* Streaming: use monospace to avoid Markdown flicker */
            <div className="font-mono text-xs whitespace-pre-wrap break-words text-gray-200">
              {displayContent || (
                <span className="text-gray-500 italic">等待响应...</span>
              )}
            </div>
          ) : displayContent ? (
            /* Completed: render Markdown */
            <div className="prose prose-invert prose-sm max-w-none
              prose-p:my-1 prose-p:leading-relaxed
              prose-headings:mt-3 prose-headings:mb-1
              prose-code:text-purple-300 prose-code:bg-purple-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-xl prose-pre:my-2
              prose-a:text-accent-blue prose-a:no-underline hover:prose-a:underline
              prose-li:my-0.5
              prose-table:text-xs
              prose-th:px-2 prose-th:py-1 prose-th:border prose-th:border-white/[0.06]
              prose-td:px-2 prose-td:py-1 prose-td:border prose-td:border-white/[0.06]
              prose-strong:text-gray-100
              prose-em:text-gray-300
              prose-blockquote:border-purple-500/20 prose-blockquote:text-gray-400 prose-blockquote:bg-purple-500/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
            ">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault()
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
          ) : (
            <span className="text-gray-500 italic text-xs">空回复</span>
          )}
        </div>

        {/* Usage / cache hit info + relative timestamp */}
        {!isUser && !isPartial && ((message as any).usage || (message as any).timestamp) && (
          <div className="flex items-center gap-2 px-1 mt-0.5">
            {(message as any).usage?.cacheReadTokens > 0 && (
              <span className="text-[10px] text-gray-600 font-mono">
                cache hit {formatNumber((message as any).usage.cacheReadTokens)}
              </span>
            )}
            {(message as any).timestamp && (
              <span className="text-[10px] text-gray-600">
                {formatRelativeTime((message as any).timestamp)}
              </span>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/10 text-blue-300 shadow-sm">
          <User size={15} />
        </div>
      )}
    </motion.div>

    {/* Image viewer (WeChat-style full-screen preview) */}
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

export default memo(MessageBubble, (prev, next) => (
  prev.isStreaming === next.isStreaming
  && prev.message === next.message
))
