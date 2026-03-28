import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppAPI } from '../../../bindings/electron-api'
import ImageViewer from './ImageViewer'

const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/
const THINKING_STRIP_RE = /<thinking>[\s\S]*?<\/thinking>/

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  if (diff < 0 || isNaN(diff)) return ''
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return 'JUST NOW'
  if (seconds < 60) return `${seconds}S AGO`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}M AGO`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}H AGO`
  const days = Math.floor(hours / 24)
  return `${days}D AGO`
}

interface Props {
  message: ChatMessage
  isStreaming?: boolean
}

type ImageMessage = ChatMessage & { images?: string[] }

function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'
  const isPartial = message.partial
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const userImages = isUser ? (message as ImageMessage).images : undefined

  const thinkingMatch = !isUser ? message.content?.match(THINKING_RE) : null
  const thinkingText = thinkingMatch?.[1]?.trim()
  const displayContent = thinkingMatch
    ? message.content.replace(THINKING_STRIP_RE, '').trim()
    : message.content

  const usage = (message as any).usage
  const timestamp = (message as any).timestamp
  const provider = (message as any).provider || (message as any).providerId

  return (
    <>
      <div className="border-t border-[#1e1e1e] px-5 py-4">
        {/* Header row: speaker label + metadata */}
        <div className="flex items-baseline justify-between mb-2.5">
          <span className={`text-[10px] font-700 tracking-[0.15em] uppercase ${
            isUser ? 'text-[#ff4f1a]' : 'text-[#555]'
          }`}>
            {isUser ? 'YOU' : (provider ? provider.toUpperCase() : 'AI')}
          </span>
          <div className="flex items-center gap-3">
            {!isUser && usage?.cacheReadTokens > 0 && (
              <span className="text-[9px] font-600 tracking-widest uppercase text-[#3eb550]">
                CACHE +{formatNumber(usage.cacheReadTokens)}
              </span>
            )}
            {!isUser && !isPartial && usage?.inputTokens && (
              <span className="text-[9px] tracking-wider text-[#3a3a3a] tabular-nums font-mono">
                {formatNumber(usage.inputTokens + (usage.outputTokens || 0))} tok
              </span>
            )}
            {timestamp && (
              <span className="text-[9px] tracking-widest text-[#333] tabular-nums">
                {formatRelativeTime(timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Thinking block */}
        {thinkingText && (
          <div className="mb-3">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-1.5 text-[9px] font-600 uppercase tracking-[0.15em] text-[#3a3a3a] hover:text-[#555] transition-colors"
            >
              {thinkingExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              THINKING PROCESS · {formatNumber(thinkingText.length)} CHARS
            </button>
            {thinkingExpanded && (
              <div className="mt-2 pl-3 border-l-2 border-[#2e2e2e] text-[11px] text-[#4a4a4a] leading-relaxed max-h-[180px] overflow-y-auto">
                {thinkingText}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <div>
            {userImages && userImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {userImages.map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Attachment ${i + 1}`}
                    className="max-w-[280px] max-h-[200px] object-contain cursor-pointer border border-[#2e2e2e] hover:border-[#444] transition-colors"
                    onClick={() => setPreviewIndex(i)}
                  />
                ))}
              </div>
            )}
            <p className="text-[#e8e4de] text-sm leading-relaxed whitespace-pre-wrap break-words font-400">
              {message.content}
            </p>
          </div>
        ) : isPartial ? (
          <div className="text-[#ccc] text-sm leading-relaxed whitespace-pre-wrap break-words font-300">
            {displayContent || <span className="text-[#3a3a3a] italic text-xs">Waiting for response…</span>}
          </div>
        ) : displayContent ? (
          <div className="prose max-w-none text-sm leading-relaxed
            [&>p]:my-1.5 [&>p]:text-[#ccc] [&>p]:leading-relaxed [&>p]:font-300
            [&>h1]:text-[#e8e4de] [&>h1]:font-700 [&>h1]:text-base [&>h1]:mt-4 [&>h1]:mb-1 [&>h1]:tracking-tight
            [&>h2]:text-[#e8e4de] [&>h2]:font-600 [&>h2]:text-sm [&>h2]:mt-3 [&>h2]:mb-1
            [&>h3]:text-[#aaa] [&>h3]:font-600 [&>h3]:text-xs [&>h3]:mt-2 [&>h3]:mb-0.5 [&>h3]:uppercase [&>h3]:tracking-wider
            [&>ul]:my-1.5 [&>ul]:pl-4 [&>ul>li]:text-[#aaa] [&>ul>li]:text-sm [&>ul>li]:my-0.5
            [&>ol]:my-1.5 [&>ol]:pl-4 [&>ol>li]:text-[#aaa] [&>ol>li]:text-sm [&>ol>li]:my-0.5
            [&>blockquote]:border-l-2 [&>blockquote]:border-[#2e2e2e] [&>blockquote]:pl-3 [&>blockquote]:text-[#666] [&>blockquote]:italic [&>blockquote]:my-2
            [&_strong]:text-[#e8e4de] [&_strong]:font-600
            [&_em]:text-[#888] [&_em]:italic
            [&_a]:text-[#ff4f1a] [&_a]:no-underline hover:[&_a]:underline
            [&_code]:text-[#ff7044] [&_code]:bg-[#1a1a1a] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
            [&_pre]:bg-[#111] [&_pre]:border [&_pre]:border-[#2e2e2e] [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto
            [&_pre_code]:bg-transparent [&_pre_code]:text-[#ccc] [&_pre_code]:p-0 [&_pre_code]:text-xs
            [&_table]:border-collapse [&_table]:text-xs [&_table]:my-2 [&_table]:w-full
            [&_th]:text-[9px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-700 [&_th]:text-[#555] [&_th]:border [&_th]:border-[#2e2e2e] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:bg-[#111]
            [&_td]:text-[#aaa] [&_td]:border [&_td]:border-[#2e2e2e] [&_td]:px-2 [&_td]:py-1.5
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
          <span className="text-[#333] text-xs italic">empty reply</span>
        )}
      </div>

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
