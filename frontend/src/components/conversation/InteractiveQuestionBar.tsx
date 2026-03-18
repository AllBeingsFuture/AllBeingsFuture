/**
 * Interactive Question Bar
 *
 * Detects interactive questions in AI output (numbered lists, yes/no,
 * multiple choice) and displays a floating bar with clickable option
 * buttons below the message. Clicking a button sends the selection
 * as a user message.
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react'
import { MessageSquare, ChevronRight, CornerDownLeft } from 'lucide-react'
import { parseInteractiveQuestion, type ParsedQuestion } from '../../utils/questionParser'

interface InteractiveQuestionBarProps {
  /** The AI message text to analyze for interactive questions */
  messageText: string
  /** Callback to send the selected option as a user message */
  onSendAnswer: (answer: string) => void
  /** Whether the bar is disabled (e.g., AI is currently streaming) */
  disabled?: boolean
}

/**
 * Renders a floating bar with clickable option buttons when an AI message
 * contains a detected interactive question.
 *
 * Usage:
 * ```tsx
 * <InteractiveQuestionBar
 *   messageText={assistantMessage.content}
 *   onSendAnswer={(answer) => sendMessage(sessionId, answer)}
 *   disabled={streaming}
 * />
 * ```
 */
const InteractiveQuestionBar: React.FC<InteractiveQuestionBarProps> = ({
  messageText,
  onSendAnswer,
  disabled = false,
}) => {
  const [answered, setAnswered] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse the message for interactive questions
  const parsed: ParsedQuestion | null = React.useMemo(
    () => parseInteractiveQuestion(messageText),
    [messageText],
  )

  // Focus input when there are no options (free-text mode)
  useEffect(() => {
    if (parsed && (!parsed.options || parsed.options.length === 0)) {
      inputRef.current?.focus()
    }
  }, [parsed])

  const handleAnswer = useCallback(
    (answer: string) => {
      if (!answer.trim() || disabled || answered) return
      setAnswered(true)
      onSendAnswer(answer.trim())
    },
    [disabled, answered, onSendAnswer],
  )

  const handleOptionClick = useCallback(
    (option: string) => {
      handleAnswer(option)
    },
    [handleAnswer],
  )

  const handleCustomSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      handleAnswer(customInput)
    },
    [customInput, handleAnswer],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleCustomSubmit()
      }
    },
    [handleCustomSubmit],
  )

  // Don't render if no question detected or already answered
  if (!parsed || answered) return null

  const typeLabel =
    parsed.type === 'yesno'
      ? '是否确认'
      : parsed.type === 'choice'
        ? '请做选择'
        : '需要您的选择'

  return (
    <div className="my-2 flex justify-center px-4">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-accent-blue/30 bg-accent-blue/5 shadow-sm"
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-accent-blue/20 bg-accent-blue/10 px-4 py-2.5">
          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-accent-blue" />
          <span className="text-xs font-medium text-accent-blue">{typeLabel}</span>
          <span
            className="ml-1 flex-1 truncate text-xs text-text-secondary"
            title={parsed.question}
          >
            {parsed.question}
          </span>
        </div>

        <div className="space-y-3 px-4 py-3">
          {/* Option Buttons */}
          {parsed.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {parsed.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(opt)}
                  disabled={disabled}
                  className={[
                    'flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary',
                    'transition-all duration-150 active:scale-95',
                    'hover:border-accent-blue/60 hover:bg-accent-blue/10 hover:text-accent-blue',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    'focus:outline-none focus:ring-1 focus:ring-accent-blue/50',
                  ].join(' ')}
                  title={opt}
                >
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-bg-tertiary text-[10px] font-bold text-text-muted">
                    {parsed.type === 'choice'
                      ? String.fromCharCode(65 + idx) // A, B, C...
                      : idx + 1}
                  </span>
                  <span className="max-w-[240px] truncate">{opt}</span>
                </button>
              ))}
            </div>
          )}

          {/* Custom Input */}
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={
                parsed.options.length > 0
                  ? '或输入自定义答案...'
                  : '请输入您的答案...'
              }
              className={[
                'h-8 flex-1 rounded-lg border border-border bg-bg-secondary px-3 text-sm',
                'text-text-primary placeholder:text-text-muted',
                'transition-colors duration-150',
                'focus:border-accent-blue/60 focus:outline-none focus:ring-1 focus:ring-accent-blue/30',
                'disabled:cursor-not-allowed disabled:opacity-40',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={!customInput.trim() || disabled}
              className={[
                'flex h-8 items-center gap-1 rounded-lg border border-accent-blue/30 bg-accent-blue/20 px-3 text-xs font-medium text-accent-blue',
                'transition-all duration-150 active:scale-95',
                'hover:border-accent-blue/50 hover:bg-accent-blue/30',
                'disabled:cursor-not-allowed disabled:opacity-40',
                'focus:outline-none focus:ring-1 focus:ring-accent-blue/50',
              ].join(' ')}
              title="发送 (Enter)"
            >
              <span>发送</span>
              <CornerDownLeft className="h-3 w-3 opacity-60" />
            </button>
          </form>
        </div>

        {/* Hint */}
        {parsed.options.length > 0 && (
          <div className="flex items-center gap-1 px-4 pb-2.5 text-[10px] text-text-muted">
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span>点击选项按钮快速回复，或在输入框中自定义答案</span>
          </div>
        )}
      </div>
    </div>
  )
}

InteractiveQuestionBar.displayName = 'InteractiveQuestionBar'
export default memo(InteractiveQuestionBar)
