/**
 * FileTransferService - File preparation and platform validation
 * Replaces Go internal/services/file_transfer.go
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { v4 as uuidv4 } from 'uuid'

interface PreparedFile {
  id: string
  originalPath: string
  filename: string
  mimeType: string
  size: number
  sizeBytes: number
  isImage: boolean
  isDirectory: boolean
  base64Data: string
}

interface PlatformLimits {
  maxFileSize: number
  allowedTypes: string[]
}

const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  default: {
    maxFileSize: 100 * 1024 * 1024,
    allowedTypes: [],
  },
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
}

const DROPS_DIR_NAME = 'allbeingsfuture-drops'
const DANGEROUS_FILENAME_CHARS = /[<>:"|?*\x00-\x1f]/g

function normalizePathPrefix(target: string): string {
  if (!target) return ''
  return path.resolve(target).replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Resolve + realpath when possible (macOS /var → /private/var). */
function resolveAllowedRoot(root: string): string {
  const resolved = normalizePathPrefix(root)
  if (!resolved) return ''
  try {
    if (fs.existsSync(resolved)) {
      return normalizePathPrefix(fs.realpathSync(resolved))
    }
  } catch {
    // fall through
  }
  return resolved
}

function isPathInsideRoot(candidate: string, root: string): boolean {
  const c = normalizePathPrefix(candidate)
  const r = normalizePathPrefix(root)
  if (!c || !r) return false
  return c === r || c.startsWith(`${r}/`)
}

export class FileTransferService {
  /** Readable roots for prepareFile (homedir + tmpdir by default). */
  private allowedRoots: string[] = [
    resolveAllowedRoot(os.homedir()),
    resolveAllowedRoot(os.tmpdir()),
  ]

  setAllowedRoots(roots: string[]): void {
    this.allowedRoots = roots
      .map((r) => resolveAllowedRoot(r))
      .filter(Boolean)
  }

  addAllowedRoot(root: string): void {
    const normalized = resolveAllowedRoot(root)
    if (!normalized) return
    if (!this.allowedRoots.includes(normalized)) {
      this.allowedRoots.push(normalized)
    }
  }

  getAllowedRoots(): string[] {
    return [...this.allowedRoots]
  }

  private assertReadablePath(filePath: string): string {
    if (!filePath || !String(filePath).trim()) {
      throw new Error('File path is empty')
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    let realPath: string
    try {
      realPath = fs.realpathSync(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }

    const normalized = normalizePathPrefix(realPath)
    const allowed = this.allowedRoots.some((root) => isPathInsideRoot(normalized, root))
    if (!allowed) {
      throw new Error(`File path is outside allowed roots: ${normalized}`)
    }
    return realPath
  }

  prepareFile(filePath: string): PreparedFile {
    const resolvedPath = this.assertReadablePath(filePath)
    const stat = fs.statSync(resolvedPath)
    const ext = path.extname(resolvedPath).toLowerCase()
    const mimeType = stat.isDirectory() ? 'inode/directory' : (MIME_MAP[ext] || 'application/octet-stream')
    const isImage = mimeType.startsWith('image/')

    // Directories: return metadata only, no content read
    if (stat.isDirectory()) {
      return {
        id: uuidv4(),
        originalPath: resolvedPath,
        filename: path.basename(resolvedPath),
        mimeType,
        size: 0,
        sizeBytes: 0,
        isImage: false,
        isDirectory: true,
        base64Data: '',
      }
    }

    const maxSize = PLATFORM_LIMITS.default.maxFileSize
    if (stat.size > maxSize) {
      throw new Error(
        `File size ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds max allowed ${(maxSize / 1024 / 1024).toFixed(0)}MB`,
      )
    }

    const data = fs.readFileSync(resolvedPath)

    return {
      id: uuidv4(),
      originalPath: resolvedPath,
      filename: path.basename(resolvedPath),
      mimeType,
      size: stat.size,
      sizeBytes: stat.size,
      isImage,
      isDirectory: false,
      base64Data: data.toString('base64'),
    }
  }

  validatePlatformLimit(file: PreparedFile, platform: string): { valid: boolean; reason: string } {
    const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.default

    if (file.size > limits.maxFileSize) {
      return {
        valid: false,
        reason: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds ${platform} limit of ${(limits.maxFileSize / 1024 / 1024).toFixed(0)}MB`,
      }
    }

    if (limits.allowedTypes.length > 0 && !limits.allowedTypes.includes(file.mimeType)) {
      return {
        valid: false,
        reason: `File type ${file.mimeType} not supported on ${platform}`,
      }
    }

    return { valid: true, reason: '' }
  }

  async saveClipboardImage(base64Data: string, mimeType: string): Promise<string> {
    const ext = Object.entries(MIME_MAP).find(([, m]) => m === mimeType)?.[0] || '.png'
    const tmpDir = path.join(os.tmpdir(), 'allbeingsfuture-clipboard')
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, `clipboard-${uuidv4()}${ext}`)
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    return filePath
  }

  saveDroppedFile(filename: string, base64Data: string): string {
    const tmpDir = path.resolve(os.tmpdir(), DROPS_DIR_NAME)
    fs.mkdirSync(tmpDir, { recursive: true })

    // Strip directories / traversal; only keep a leaf name.
    const base = path.basename(filename || 'drop.bin').replace(/\\/g, '/')
    const leaf = base.includes('/') ? base.split('/').pop()! : base
    const safeName = (leaf || 'drop.bin').replace(DANGEROUS_FILENAME_CHARS, '_').replace(/^\.+/, '_') || 'drop.bin'

    const filePath = path.resolve(tmpDir, `${Date.now()}-${safeName}`)
    const resolvedTmp = normalizePathPrefix(tmpDir)
    const resolvedFile = normalizePathPrefix(filePath)
    if (resolvedFile !== resolvedTmp && !resolvedFile.startsWith(`${resolvedTmp}/`)) {
      throw new Error(`saveDroppedFile refused: path escapes drops directory (${filePath})`)
    }

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    return filePath
  }
}
