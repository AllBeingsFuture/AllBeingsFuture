import { forwardRef, useLayoutEffect, useRef } from 'react'

const MIN_HEIGHT = 44
const MAX_HEIGHT = 180

interface Props {
  value: string
  disabled?: boolean
  placeholder: string
  attachmentSummary?: string
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
    <div className="flex flex-1 flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.025] shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition-colors duration-200 focus-within:border-blue-500/35 focus-within:bg-white/[0.04] focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.16),0_18px_50px_rgba(0,0,0,0.24)]">
      <textarea
        ref={setTextareaRef}
        value={value}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
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
        className="block min-h-[44px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-500"
      />

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2 text-[11px] text-gray-500">
        <span className="truncate">Enter 发送 · Shift+Enter 换行</span>
        {attachmentSummary && (
          <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300/90">
            {attachmentSummary}
          </span>
        )}
      </div>
    </div>
  )
})

export default MessageTextEditor
