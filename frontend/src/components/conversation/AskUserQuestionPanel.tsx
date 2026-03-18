/**
 * AskUserQuestion 工具调用面板
 *
 * 当 Claude 调用 AskUserQuestion 工具时显示此组件，
 * 支持多个问题、选项按钮（单选/多选）、自定义输入。
 */

import React, { useState, useCallback } from 'react'
import { HelpCircle, CheckCircle } from 'lucide-react'

interface QuestionOption {
  label: string
  description?: string
  markdown?: string
}

interface Question {
  question: string
  header?: string
  options?: QuestionOption[]
  multiSelect?: boolean
}

interface AskUserQuestionPanelProps {
  questions: Question[]
  onSubmit: (answers: Record<string, string>) => void
  disabled?: boolean
}

const AskUserQuestionPanel: React.FC<AskUserQuestionPanelProps> = ({
  questions,
  onSubmit,
  disabled = false,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const setAnswer = useCallback((idx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [String(idx)]: value }))
  }, [])

  const handleSubmit = useCallback(() => {
    if (disabled || submitted) return
    setSubmitted(true)
    onSubmit(answers)
  }, [disabled, submitted, answers, onSubmit])

  const allAnswered = questions.every((_, idx) => !!answers[String(idx)])

  if (submitted) return null

  return (
    <div className="flex justify-center my-3 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-full max-w-2xl rounded-xl border border-blue-400/30 bg-blue-400/5 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-400/10 border-b border-blue-400/20">
          <HelpCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-400">Claude 需要您的回答</span>
          <span className="text-xs text-gray-500 ml-auto">{questions.length} 个问题</span>
        </div>

        <div className="px-4 py-3 space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="space-y-2">
              <div className="text-sm font-medium text-gray-100">
                <span className="text-blue-400/70 mr-1.5 text-xs font-bold">Q{idx + 1}</span>
                {q.question}
              </div>

              {q.options && q.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = answers[String(idx)] === opt.label
                    return (
                      <button
                        key={optIdx}
                        onClick={() => setAnswer(idx, opt.label)}
                        disabled={disabled}
                        title={opt.description}
                        className={[
                          'flex items-start gap-1.5 px-3 py-1.5 rounded-lg text-sm text-left',
                          'border transition-all duration-150 active:scale-95',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                          'focus:outline-none focus:ring-1 focus:ring-blue-400/50',
                          isSelected
                            ? 'border-blue-400 bg-blue-400/15 text-blue-400'
                            : 'border-white/10 bg-gray-800 text-gray-100 hover:border-blue-400/60 hover:bg-blue-400/10 hover:text-blue-400',
                        ].join(' ')}
                      >
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                        <span className="max-w-[300px]">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={answers[String(idx)] || ''}
                  onChange={e => setAnswer(idx, e.target.value)}
                  disabled={disabled}
                  placeholder="请输入您的答案..."
                  className={[
                    'w-full h-8 px-3 rounded-lg text-sm',
                    'bg-gray-800 border border-white/10',
                    'text-gray-100 placeholder:text-gray-500',
                    'focus:outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ].join(' ')}
                />
              )}
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 pt-1 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || disabled}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-medium',
              'bg-blue-500 text-white',
              'hover:bg-blue-500/80 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            ].join(' ')}
          >
            提交回答
          </button>
        </div>
      </div>
    </div>
  )
}

AskUserQuestionPanel.displayName = 'AskUserQuestionPanel'
export default AskUserQuestionPanel
