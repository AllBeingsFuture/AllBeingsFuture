import { forwardRef, useLayoutEffect, useRef } from 'react'

const MIN_HEIGHT = 24
const MAX_HEIGHT = 160

interface Props {
  value: string
  disabled?: boolean
  placeholder: string
  attachmentSummary?: string
  queueCount?: number
  onChange: (value: string) => void
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onSubmit: () => void
}

const MessageTextEditor = forwardRef<HTMLTextAreaElement, Props>(function MessageTextEditor(
  {
    value,
    disabled = false,
    placeholder,
    attachmentSummary,
    queueCount = 0,
    onChange,
    onPaste,
    onSubmit,
  },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composingRef = useRef(false)

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return

    element.style.height = 'auto'
    const nextHeight = Math.max(MIN_HEIGHT, Math.min(element.scrollHeight, MAX_HEIGHT))
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  const setTextareaRef = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node
    if (typeof forwardedRef === 'function') {
      forwardedRef(node)
      return
    }
    if (forwardedRef) {
      forwardedRef.current = node
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center">
      <textarea
        ref={setTextareaRef}
        value={value}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={
          queueCount > 0
            ? `消息输入，${queueCount} 条待发送`
            : '消息输入'
        }
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false
          onChange(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return

          const nativeEvent = event.nativeEvent as KeyboardEvent
          if (composingRef.current || nativeEvent.isComposing || event.keyCode === 229) {
            return
          }

          event.preventDefault()
          onSubmit()
        }}
        className="block max-h-[160px] min-h-[24px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-500"
      />
      {(attachmentSummary || queueCount > 0) && (
        <div className="flex items-center justify-between gap-2 px-1 pb-0.5 text-[11px] text-zinc-600">
          <span className="truncate">
            {queueCount > 0
              ? `Enter 追加排队 · ${queueCount} 条待发送 · Shift+Enter 换行`
              : 'Enter 发送 · Shift+Enter 换行'}
          </span>
          {attachmentSummary && (
            <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {attachmentSummary}
            </span>
          )}
        </div>
      )}
    </div>
  )
})

export default MessageTextEditor
