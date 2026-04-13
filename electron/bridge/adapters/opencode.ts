/**
 * OpenCode CLI Adapter (TypeScript port)
 *
 * Spawns `opencode` CLI in single-turn mode.
 * Each send() creates a new process.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

type EmitFn = (event: any) => void

function parseCommand(command: string | undefined, fallback: string): { cmd: string; args: string[] } {
  if (!command) return { cmd: fallback, args: [] }
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  const cmd = (parts.shift() || fallback).replace(/^"|"$/g, '')
  const args = parts.map(part => part.replace(/^"|"$/g, ''))
  return { cmd, args }
}

export class OpenCodeAdapter {
  private config: Record<string, any>
  private emit: EmitFn
  public currentRequestId: string | null = null
  private currentProcess: ChildProcess | null = null
  public envOverrides?: Record<string, string>
  public resumeFlag?: string

  constructor(config: Record<string, any>, emit: EmitFn) {
    this.config = config
    this.emit = emit
  }

  async init(): Promise<void> {
    // No persistent process
  }

  async send(message: string, _images?: any[]): Promise<void> {
    const requestId = this.currentRequestId
    const { cmd, args: baseArgs } = parseCommand(this.config.command, 'opencode')

    const args = [...baseArgs, '-p', message]

    if (this.config.autoAcceptFlag) {
      args.push(this.config.autoAcceptFlag)
    }
    if (this.resumeFlag && !args.includes(this.resumeFlag)) {
      args.push(this.resumeFlag)
    }

    return new Promise<void>((resolve) => {
      let currentText = ''
      let stderrBuf = ''

      this.currentProcess = spawn(cmd, args, {
        cwd: this.config.workDir || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ...(this.envOverrides || {}) },
      })

      this.currentProcess.on('error', (err) => {
        this.emit({ id: requestId, event: 'error', error: `Failed to start ${cmd}: ${err.message}` })
        resolve()
      })

      if (this.currentProcess.stderr) {
        this.currentProcess.stderr.on('data', (data: Buffer) => {
          stderrBuf += data.toString()
        })
      }

      const rl = createInterface({ input: this.currentProcess.stdout! })

      rl.on('line', (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        currentText += trimmed + '\n'
        this.emit({ id: requestId, event: 'delta', text: trimmed + '\n' })
      })

      this.currentProcess.on('exit', (code) => {
        this.currentProcess = null

        if (!currentText && stderrBuf.trim()) {
          this.emit({ id: requestId, event: 'error', error: stderrBuf.trim() })
        } else if (!currentText && code && code !== 0) {
          this.emit({ id: requestId, event: 'error', error: `OpenCode process exited (code ${code})` })
        } else {
          this.emit({ id: requestId, event: 'done', text: currentText, conversationId: '' })
        }
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill()
      this.currentProcess = null
    }
  }

  async destroy(): Promise<void> {
    await this.stop()
  }
}
