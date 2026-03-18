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
  base64Data: string
}

interface PlatformLimits {
  maxFileSize: number
  allowedTypes: string[]
}

const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  telegram: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'],
  },
  qq: {
    maxFileSize: 30 * 1024 * 1024, // 30MB
    allowedTypes: ['image/png', 'image/jpeg', 'image/gif', 'application/pdf'],
  },
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

export class FileTransferService {
  prepareFile(filePath: string): PreparedFile {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const stat = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_MAP[ext] || 'application/octet-stream'
    const data = fs.readFileSync(filePath)

    return {
      id: uuidv4(),
      originalPath: filePath,
      filename: path.basename(filePath),
      mimeType,
      size: stat.size,
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
}
