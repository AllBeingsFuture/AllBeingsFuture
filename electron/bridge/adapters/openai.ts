/**
 * OpenAI-compatible API adapter.
 *
 * Uses HTTP requests directly instead of spawning a CLI process.
 * Supports standard OpenAI-compatible Chat Completions endpoints.
 */

import { buildChildProcessEnv } from '../runtime.js'
import { appLog } from '../../services/log.js'

type EmitFn = (event: any) => void

type ChatRole = 'system' | 'user' | 'assistant'

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatMessage = {
  role: ChatRole
  content: string | ChatContentPart[]
}

function buildSystemPrompt(config: Record<string, any>): string {
  return [config.customInstructions, config.appendSystemPrompt]
    .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n')
}

function normalizeBaseUrl(input?: string): string {
  const value = (input || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
  return value || 'https://api.openai.com/v1'
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  if (/\/chat\/completions$/i.test(baseUrl)) {
    return baseUrl
  }
  return `${baseUrl}/chat/completions`
}

function parseCustomHeaders(raw?: string): Record<string, string> {
  const value = (raw || '').trim()
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([key, headerValue]) => key && headerValue !== undefined && headerValue !== null)
          .map(([key, headerValue]) => [key, String(headerValue)])
      )
    }
  } catch {}

  const headers: Record<string, string> = {}
  for (const line of value.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const headerValue = line.slice(idx + 1).trim()
    if (!key || !headerValue) continue
    headers[key] = headerValue
  }
  return headers
}

function extractTextFromCompletion(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part?.text === 'string') return part.text
        if (typeof part?.content === 'string') return part.content
        return ''
      })
      .join('')
  }
  return ''
}

function extractUsage(payload: any): Record<string, number> | undefined {
  const usage = payload?.usage
  if (!usage || typeof usage !== 'object') return undefined

  return {
    input_tokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    output_tokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    total_tokens: Number(usage.total_tokens ?? 0),
  }
}

function extractErrorMessage(payload: any, status: number): string {
  const directMessage =
    payload?.error?.message
    || payload?.message
    || payload?.detail
    || payload?.error

  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage.trim()
  }

  return `OpenAI-compatible API request failed (HTTP ${status})`
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /abort/i.test(error.message)
}

function buildUserContent(
  message: string,
  images?: Array<{ data: string; mimeType: string }>
): string | ChatContentPart[] {
  if (!images || images.length === 0) {
    return message
  }

  const parts: ChatContentPart[] = []
  if (message.trim()) {
    parts.push({ type: 'text', text: message })
  }

  for (const image of images) {
    parts.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType || 'image/png'};base64,${image.data}`,
      },
    })
  }

  return parts
}

export class OpenAIAdapter {
  private config: Record<string, any>
  private emit: EmitFn
  private abortController: AbortController | null = null
  private history: ChatMessage[] = []
  public currentRequestId: string | null = null
  public envOverrides?: Record<string, string>
  public resumeFlag?: string

  constructor(config: Record<string, any>, emit: EmitFn) {
    this.config = config
    this.emit = emit
  }

  async init(): Promise<void> {
    // Stateless HTTP adapter; no persistent setup required.
  }

  async send(message: string, images?: Array<{ data: string; mimeType: string }>): Promise<void> {
    const requestId = this.currentRequestId
    const env = buildChildProcessEnv(this.config.envOverrides)
    const apiKey = String(env.OPENAI_API_KEY || '').trim()
    const model = String(this.config.model || env.OPENAI_MODEL || '').trim()
    const baseUrl = normalizeBaseUrl(env.OPENAI_BASE_URL || env.OPENAI_BASEURL)
    const customHeaders = parseCustomHeaders(env.OPENAI_CUSTOM_HEADERS)
    const hasCustomAuthHeader = Object.keys(customHeaders).some(key => {
      const normalized = key.toLowerCase()
      return normalized === 'authorization' || normalized === 'api-key'
    })

    if (!apiKey && !hasCustomAuthHeader) {
      this.emit({
        id: requestId,
        event: 'error',
        error: 'OPENAI_API_KEY 未配置，且未提供自定义 Authorization/api-key 请求头，无法调用 OpenAI 兼容 API。',
      })
      return
    }

    if (!model) {
      this.emit({
        id: requestId,
        event: 'error',
        error: '未配置模型名。请在 Provider 的 Default Model 中填写模型，或设置 OPENAI_MODEL。',
      })
      return
    }

    const endpoint = resolveChatCompletionsEndpoint(baseUrl)
    const systemPrompt = buildSystemPrompt(this.config)
    const userContent = buildUserContent(message, images)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    }

    if (apiKey && !hasCustomAuthHeader) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    if (env.OPENAI_ORGANIZATION) {
      headers['OpenAI-Organization'] = env.OPENAI_ORGANIZATION
    }
    if (env.OPENAI_PROJECT) {
      headers['OpenAI-Project'] = env.OPENAI_PROJECT
    }

    const messages: ChatMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push(...this.history)
    messages.push({ role: 'user', content: userContent })

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    }

    const maxOutputTokens = Number(this.config.maxOutputTokens || 0)
    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
      body.max_tokens = maxOutputTokens
    }

    this.abortController = new AbortController()

    try {
      appLog('info', `Sending request to OpenAI-compatible API (${model})`, 'openai-api')

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      })

      const rawText = await response.text()
      let payload: any = null

      try {
        payload = rawText ? JSON.parse(rawText) : null
      } catch {
        payload = null
      }

      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status))
      }

      const finalText = extractTextFromCompletion(payload)
      if (!finalText) {
        throw new Error('OpenAI 兼容 API 返回成功，但响应里没有可显示的文本内容。')
      }

      this.history.push(
        { role: 'user', content: userContent },
        { role: 'assistant', content: finalText }
      )

      this.emit({ id: requestId, event: 'delta', text: finalText })
      this.emit({
        id: requestId,
        event: 'done',
        text: finalText,
        conversationId: '',
        usage: extractUsage(payload),
      })
    } catch (error) {
      if (!isAbortError(error)) {
        const messageText = error instanceof Error ? error.message : String(error)
        appLog('error', `OpenAI-compatible API error: ${messageText}`, 'openai-api')
        this.emit({ id: requestId, event: 'error', error: messageText })
      }
    } finally {
      this.abortController = null
    }
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  async destroy(): Promise<void> {
    await this.stop()
    this.history = []
  }
}
