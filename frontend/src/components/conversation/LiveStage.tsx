import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import type { AgentSessionStreamState } from '../../types/agentStreamTypes'
import type { ConversationMessage } from '../../types/conversationTypes'
import type { LiveBuffer, LiveToolEntry } from '../../types/sessionStreamTypes'
import { isAgentStreamActive } from '../../core/chat/agentStreamCore'
import AgentActivityPanel from './AgentActivityPanel'
import ToolUseCard from './ToolUseCard'

export interface LiveStageProps {
  live: LiveBuffer | null
  stream?: AgentSessionStreamState
  sessionId: string
  onPermissionResponse: (requestId: string, optionId: string) => Promise<void>
}

function liveToolToConversationMessage(
  tool: LiveToolEntry,
  sessionId: string,
): ConversationMessage {
  const open = tool.status !== 'completed' && tool.status !== 'failed'
  return {
    id: tool.toolCallId,
    sessionId,
    role: 'tool_use',
    content: tool.title,
    timestamp: new Date().toISOString(),
    toolName: tool.name || tool.title,
    toolInput: tool.input,
    toolUseId: tool.toolCallId,
    partial: open,
    isDelta: open,
    toolResult: tool.resultText ?? tool.error,
    toolOutputs: tool.outputs,
    isError: tool.status === 'failed' || Boolean(tool.error),
  }
}

function toolCardOperation(tool: LiveToolEntry, sessionId: string) {
  const toolUse = liveToolToConversationMessage(tool, sessionId)
  const open = tool.status !== 'completed' && tool.status !== 'failed'
  const hasBody = Boolean(tool.resultText || tool.error || (tool.outputs && tool.outputs.length > 0))

  if (open && hasBody) {
    return {
      id: tool.toolCallId,
      toolUseId: tool.toolCallId,
      toolUse,
      liveResult: {
        ...toolUse,
        role: 'tool_result' as const,
        isDelta: true,
        partial: true,
      },
    }
  }

  if (!open) {
    return {
      id: tool.toolCallId,
      toolUseId: tool.toolCallId,
      toolUse,
      result: {
        ...toolUse,
        role: 'tool_result' as const,
        isDelta: false,
        partial: false,
      },
    }
  }

  return {
    id: tool.toolCallId,
    toolUseId: tool.toolCallId,
    toolUse,
  }
}

function liveText(slot?: { itemId: string; text: string } | string | null): string {
  if (!slot) return ''
  if (typeof slot === 'string') return slot
  return slot.text || ''
}

function liveHasContent(live: LiveBuffer | null): boolean {
  if (!live) return false
  if (liveText(live.thinking).trim()) return true
  if (liveText(live.assistantText).trim()) return true
  if (live.tools.length > 0) return true
  return false
}

function streamHasActiveUi(stream?: AgentSessionStreamState): boolean {
  if (!stream) return false
  if (stream.permission) return true
  if (stream.statusMessage && isAgentStreamActive(stream)) return true
  const entries = stream.plan?.entries ?? []
  if (entries.length > 0 && isAgentStreamActive(stream) && !entries.every((e) => e.status === 'completed')) {
    return true
  }
  if (isAgentStreamActive(stream)) return true
  return false
}

/**
 * Fixed live buffer above the composer, outside the transcript scroll region.
 * Shows in-flight thinking / tools / assistant text + AgentActivityPanel.
 */
export default function LiveStage({
  live,
  stream,
  sessionId,
  onPermissionResponse,
}: LiveStageProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true)

  const show = liveHasContent(live) || streamHasActiveUi(stream)
  const tools = live?.tools ?? []
  const phaseRunning = stream?.phase === 'running' || stream?.phase === 'cancelling'
  const showStreamingDots = phaseRunning && !liveHasContent(live) && !stream?.permission

  const toolOps = useMemo(
    () => tools.map((tool) => toolCardOperation(tool, sessionId)),
    [tools, sessionId],
  )

  if (!show) return null

  return (
    <div
      data-testid="live-stage"
      className="shrink-0 border-t border-white/[0.06] bg-[#0c0c0e]/95 max-h-[40vh] overflow-y-auto px-6 py-3"
    >
      <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-2.5">
        {liveText(live?.thinking).trim() && (
          <div
            className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
            data-testid="live-stage-thinking"
          >
            <button
              type="button"
              onClick={() => setThinkingOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-zinc-500 hover:text-zinc-400"
            >
              {thinkingOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="font-medium tracking-wide">思考中</span>
              {phaseRunning && (
                <LoaderCircle size={12} className="ml-0.5 animate-spin text-zinc-500" aria-hidden="true" />
              )}
            </button>
            {thinkingOpen && (
              <pre className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-500/90">
                {liveText(live?.thinking)}
              </pre>
            )}
          </div>
        )}

        {toolOps.length > 0 && (
          <div className="space-y-1.5" data-testid="live-stage-tools">
            {toolOps.map((operation) => (
              <ToolUseCard key={operation.id} operation={operation} />
            ))}
          </div>
        )}

        {liveText(live?.assistantText).trim() && (
          <div
            className="whitespace-pre-wrap text-[13px] leading-[1.8] text-zinc-200"
            data-testid="live-stage-assistant-text"
          >
            {liveText(live?.assistantText)}
          </div>
        )}

        <AgentActivityPanel
          stream={stream}
          onPermissionResponse={onPermissionResponse}
        />

        {showStreamingDots && (
          <div
            className="flex items-center gap-2 py-1 text-[11px] text-zinc-500"
            data-testid="live-stage-streaming"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle size={13} className="animate-spin text-sky-400" aria-hidden="true" />
            <span>{stream?.statusMessage || '正在执行…'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
