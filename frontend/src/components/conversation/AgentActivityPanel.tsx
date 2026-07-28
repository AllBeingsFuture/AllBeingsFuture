import { useEffect, useRef, useState } from 'react'
import { Check, Circle, LoaderCircle, ShieldAlert, XCircle } from 'lucide-react'
import type {
  AgentPermissionOption,
  AgentSessionStreamState,
} from '../../types/agentStreamTypes'

interface Props {
  stream?: AgentSessionStreamState
  onPermissionResponse: (requestId: string, optionId: string) => Promise<void>
}

function PlanStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <Check size={13} className="text-emerald-400" aria-hidden="true" />
  if (status === 'in_progress') return <LoaderCircle size={13} className="animate-spin text-sky-400" aria-hidden="true" />
  if (status === 'blocked') return <XCircle size={13} className="text-red-400" aria-hidden="true" />
  return <Circle size={11} className="text-gray-600" aria-hidden="true" />
}

function optionClass(option: AgentPermissionOption) {
  if (option.kind.startsWith('reject')) {
    return 'border-white/[0.08] bg-transparent text-gray-300 hover:border-red-400/30 hover:bg-red-400/[0.06] hover:text-red-200'
  }
  return 'border-sky-400/25 bg-sky-400/[0.08] text-sky-100 hover:border-sky-400/40 hover:bg-sky-400/[0.14]'
}

export default function AgentActivityPanel({ stream, onPermissionResponse }: Props) {
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null)
  const [responseError, setResponseError] = useState('')
  const firstOptionRef = useRef<HTMLButtonElement | null>(null)
  const permission = stream?.permission

  useEffect(() => {
    setSubmittingOptionId(null)
    setResponseError('')
    if (!permission) return
    requestAnimationFrame(() => firstOptionRef.current?.focus({ preventScroll: true }))
  }, [permission?.requestId])

  const respond = async (option: AgentPermissionOption) => {
    if (!permission || submittingOptionId) return
    setSubmittingOptionId(option.optionId)
    setResponseError('')
    try {
      await onPermissionResponse(permission.requestId, option.optionId)
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : String(err))
      setSubmittingOptionId(null)
    }
  }

  const showStatus = Boolean(stream?.statusMessage)
  const showPlan = Boolean(stream?.plan?.entries.length)
  if (!permission && !showStatus && !showPlan) return null

  return (
    <div className="space-y-2" data-testid="agent-activity-panel">
      {(showStatus || showPlan) && (
        <section
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          aria-label="Agent 进度"
        >
          {showStatus && (
            <div className="flex items-center gap-2 text-xs text-gray-400" role="status" aria-live="polite">
              {stream?.phase === 'running' && (
                <LoaderCircle size={13} className="animate-spin text-sky-400" aria-hidden="true" />
              )}
              <span>{stream?.statusMessage}</span>
            </div>
          )}
          {showPlan && (
            <div className={showStatus ? 'mt-2 border-t border-white/[0.05] pt-2' : ''}>
              {stream?.plan?.title && (
                <p className="mb-1.5 text-xs font-medium text-gray-300">{stream.plan.title}</p>
              )}
              <ol className="space-y-1">
                {stream?.plan?.entries.map(entry => (
                  <li key={entry.id} className="flex min-w-0 items-center gap-2 text-xs text-gray-400">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <PlanStatusIcon status={entry.status} />
                    </span>
                    <span className={entry.status === 'completed' ? 'text-gray-500 line-through' : ''}>
                      {entry.title}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {permission && (
        <section
          className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3"
          role="alertdialog"
          aria-labelledby={'permission-title-' + permission.requestId}
          aria-describedby={permission.description ? 'permission-description-' + permission.requestId : undefined}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 id={'permission-title-' + permission.requestId} className="text-sm font-medium text-amber-100">
                {permission.title}
              </h3>
              {permission.description && (
                <p id={'permission-description-' + permission.requestId} className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-gray-400">
                  {permission.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {permission.options.map((option, index) => (
                  <button
                    key={option.optionId}
                    ref={index === 0 ? firstOptionRef : undefined}
                    type="button"
                    disabled={submittingOptionId !== null}
                    onClick={() => void respond(option)}
                    className={'min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-50 ' + optionClass(option)}
                  >
                    {submittingOptionId === option.optionId && (
                      <LoaderCircle size={12} className="mr-1.5 inline animate-spin" aria-hidden="true" />
                    )}
                    {option.label}
                  </button>
                ))}
              </div>
              {responseError && (
                <p className="mt-2 text-xs text-red-300" role="alert">{responseError}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
