/**
 * PTYService - Terminal (pseudo-terminal) management
 * Replaces Go internal/services/pty.go
 *
 * Uses node-pty to create real terminal sessions.
 */

import type { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'

interface PTYInstance {
  id: string
  shell: string
  pty: any
}

export class PTYService {
  private ptys = new Map<string, PTYInstance>()
  private nodePty: any = null

  constructor(private getWindow: () => BrowserWindow | null) {}

  private async ensureNodePty() {
    if (!this.nodePty) {
      try {
        this.nodePty = await import('node-pty')
      } catch {
        throw new Error('node-pty not available. Please install: npm install node-pty')
      }
    }
    return this.nodePty
  }

  async getShells(): Promise<Array<{ id: string; name: string; path: string }>> {
    const shells: Array<{ id: string; name: string; path: string }> = []

    if (process.platform === 'win32') {
      shells.push(
        { id: 'powershell', name: 'PowerShell', path: 'powershell.exe' },
        { id: 'cmd', name: 'Command Prompt', path: 'cmd.exe' },
      )
      // Check for Git Bash
      const gitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      ]
      for (const p of gitBashPaths) {
        try {
          const { access } = await import('node:fs/promises')
          await access(p)
          shells.push({ id: 'git-bash', name: 'Git Bash', path: p })
          break
        } catch {}
      }
    } else {
      shells.push(
        { id: 'bash', name: 'Bash', path: '/bin/bash' },
        { id: 'zsh', name: 'Zsh', path: '/bin/zsh' },
      )
    }

    return shells
  }

  async create(shell: string, cwd: string): Promise<{ id: string; shell: string; error?: string }> {
    try {
      const pty = await this.ensureNodePty()
      const id = uuidv4()

      const shellPath = shell || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
      const ptyProcess = pty.spawn(shellPath, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: process.env as Record<string, string>,
      })

      this.ptys.set(id, { id, shell: shellPath, pty: ptyProcess })

      ptyProcess.onData((data: string) => {
        const win = this.getWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:data', { id, data })
        }
      })

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        const win = this.getWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:exit', { id, exitCode })
        }
        this.ptys.delete(id)
      })

      return { id, shell: shellPath }
    } catch (err: any) {
      return { id: '', shell: '', error: err.message }
    }
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.pty?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.ptys.get(id)?.pty?.resize(cols, rows)
  }

  kill(id: string): void {
    const instance = this.ptys.get(id)
    if (instance) {
      instance.pty.kill()
      this.ptys.delete(id)
    }
  }

  killAll(): void {
    for (const [id] of this.ptys) {
      this.kill(id)
    }
  }
}
