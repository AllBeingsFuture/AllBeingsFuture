import { SendHorizonal, Square, X, Upload, FileIcon, FolderIcon, LoaderCircle } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import MessageTextEditor from './MessageTextEditor'
import ComposerCapabilities from './ComposerCapabilities'
import SlashSkillSuggest from './SlashSkillSuggest'
import { FileTransferService } from '../../../bindings/allbeingsfuture/internal/services'
import { useDraftStore } from '../../stores/draftStore'
import type { ImageAttachment, FileAttachment, PendingMessage } from '../../stores/draftStore'
import { useSkillStore } from '../../stores/skillStore'
import { useSessionStore } from '../../stores/sessionStore'

const EMPTY_PENDING: PendingMessage[] = []

interface Props {
  disabled?: boolean
  placeholder?: string
  streaming?: boolean
  cancelling?: boolean
  sessionId: string
  onSend: (text: string, images?: Array<{data: string, mimeType: string}>) => Promise<void> | void
  onStop?: () => void
}

function MessageInput({
  disabled = false,
  placeholder = '输入消息，Enter 发送',
  streaming = false,
  cancelling = false,
  sessionId,
  onSend,
  onStop,
}: Props) {
  const { saveDraft, getDraft, clearDraft, enqueuePending, removePendingAt, clearPending } = useDraftStore()
  // Use a stable empty array — `|| []` would allocate every snapshot and infinite-loop useSyncExternalStore.
  const messageQueue = useDraftStore((s) => s.pendingBySession[sessionId] ?? EMPTY_PENDING)
  const flushPendingMessages = useSessionStore((s) => s.flushPendingMessages)
  const skills = useSkillStore((s) => s.skills)
  const loadSkills = useSkillStore((s) => s.load)
  const initialDraft = useRef(getDraft(sessionId))

  const [value, setValue] = useState(initialDraft.current?.text ?? '')
  const [images, setImages] = useState<ImageAttachment[]>(initialDraft.current?.images ?? [])
  const [files, setFiles] = useState<FileAttachment[]>(initialDraft.current?.files ?? [])
  const [dragging, setDragging] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const valueRef = useRef(value)
  const imagesRef = useRef(images)
  const filesRef = useRef(files)
  valueRef.current = value
  imagesRef.current = images
  filesRef.current = files

  useEffect(() => {
    return () => {
      saveDraft(sessionId, {
        text: valueRef.current,
        images: imagesRef.current,
        files: filesRef.current,
      })
    }
  }, [saveDraft, sessionId])

  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }, [])

  const addFileByPath = useCallback(async (filePath: string) => {
    try {
      const prepared = await FileTransferService.PrepareFile(filePath)
      if (!prepared) return

      const isDir = Boolean(prepared.isDirectory)
      const size = isDir
        ? '文件夹'
        : prepared.sizeBytes < 1024
          ? `${prepared.sizeBytes} B`
          : prepared.sizeBytes < 1024 * 1024
            ? `${(prepared.sizeBytes / 1024).toFixed(1)} KB`
            : `${(prepared.sizeBytes / (1024 * 1024)).toFixed(1)} MB`

      setFiles((current) => {
        if (current.some((file) => file.path === filePath)) return current

        return [
          ...current,
          {
            name: prepared.filename,
            path: filePath,
            size,
            mimeType: prepared.mimeType,
            isImage: prepared.isImage,
            isDirectory: isDir,
          },
        ]
      })
    } catch (error: any) {
      console.warn('FileTransfer validation failed:', error?.message)
    }
  }, [])

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader()

    reader.onload = () => {
      const dataUrl = reader.result as string
      const commaIndex = dataUrl.indexOf(',')
      const base64Data = dataUrl.substring(commaIndex + 1)

      setImages((current) => [
        ...current,
        {
          data: base64Data,
          mimeType: file.type,
          preview: dataUrl,
        },
      ])
      focusEditor()
    }

    reader.readAsDataURL(file)
  }, [focusEditor])

  useEffect(() => {
    const subscribe = window.electronAPI?.on
    if (typeof subscribe !== 'function') return

    return subscribe('files-dropped', (paths: string[] = []) => {
      paths.forEach((path) => {
        if (path) void addFileByPath(path)
      })
      focusEditor()
    })
  }, [addFileByPath, focusEditor])

  const buildMessage = useCallback((): PendingMessage | null => {
    const text = value.trim()
    if (!text && images.length === 0 && files.length === 0) return null

    const attachedImages = images.length > 0
      ? images.map((image) => ({ data: image.data, mimeType: image.mimeType }))
      : undefined

    let finalText = text || (images.length > 0 ? '请看图片' : '')

    if (files.length > 0) {
      const fileRefs = files.map((file) => `[文件: ${file.name}](${file.path})`).join('\n')
      finalText = finalText ? `${finalText}\n\n附件:\n${fileRefs}` : `附件:\n${fileRefs}`
    }

    return { text: finalText, images: attachedImages }
  }, [value, images, files])

  const clearInput = useCallback(() => {
    setValue('')
    setImages([])
    setFiles([])
    clearDraft(sessionId)
  }, [clearDraft, sessionId])

  const doSendMessage = useCallback(async (msg: PendingMessage) => {
    await onSend(msg.text, msg.images)
  }, [onSend])

  const submit = useCallback(async () => {
    const msg = buildMessage()
    if (!msg || disabled) return

    clearInput()

    // Queue in a session-scoped store (not component state) so switching to a
    // child agent while the parent is still streaming does not swallow the turn.
    if (streaming) {
      enqueuePending(sessionId, msg)
      return
    }

    await doSendMessage(msg)
  }, [buildMessage, clearInput, disabled, doSendMessage, enqueuePending, sessionId, streaming])

  const prevStreamingRef = useRef(streaming)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      void flushPendingMessages(sessionId)
    }
    prevStreamingRef.current = streaming
  }, [streaming, sessionId, flushPendingMessages])

  const removeQueuedMessage = useCallback((index: number) => {
    removePendingAt(sessionId, index)
  }, [removePendingAt, sessionId])

  const removeImage = useCallback((index: number) => {
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }, [])

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current += 1

    if (event.dataTransfer?.types.includes('Files')) {
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current -= 1

    if (dragCounterRef.current === 0) {
      setDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  const saveAndAddFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const tempPath = await FileTransferService.SaveDroppedFile(file.name, base64)
      if (tempPath) {
        void addFileByPath(tempPath)
      }
    } catch (err: any) {
      console.warn('Failed to save dropped file:', err?.message)
    }
  }, [addFileByPath])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    dragCounterRef.current = 0

    const droppedFiles = event.dataTransfer?.files
    if (!droppedFiles || droppedFiles.length === 0) return

    for (let index = 0; index < droppedFiles.length; index += 1) {
      const file = droppedFiles[index]
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      } else {
        const localPath = window.electronAPI?.getPathForFile?.(file) || (file as any).path
        if (localPath) {
          void addFileByPath(localPath)
        } else {
          void saveAndAddFile(file)
        }
      }
    }
  }, [addImageFile, addFileByPath, saveAndAddFile])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items
    if (!items) return

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!item.type.startsWith('image/')) continue

      event.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      addImageFile(file)
    }
  }, [addImageFile])

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles) return

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index]
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      } else {
        const path = window.electronAPI?.getPathForFile?.(file) || (file as any).path || file.name
        if (path) void addFileByPath(path)
      }
    }

    event.target.value = ''
    focusEditor()
  }, [addImageFile, addFileByPath, focusEditor])

  const attachmentSummary = [
    images.length > 0 ? `${images.length} 张图片` : null,
    files.length > 0 ? `${files.length} 个文件` : null,
  ].filter(Boolean).join(' · ')

  const hasContent = Boolean(value.trim() || images.length > 0 || files.length > 0)

  const handleSlashPick = useCallback((slashCommand: string) => {
    setValue(`/${slashCommand} `)
    focusEditor()
  }, [focusEditor])

  return (
    <div
      className="relative shrink-0 px-4 pb-5 pt-2"
      data-file-drop-target="message-input"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-sky-400/30 bg-sky-500/[0.06] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-sky-300/90">
            <Upload size={22} className="animate-bounce" />
            <span className="text-sm font-medium">拖放文件到这里</span>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[42rem]">
        {messageQueue.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {messageQueue.map((msg, index) => (
              <div
                key={index}
                className="group flex items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-1 text-xs text-amber-200/80"
              >
                <span className="shrink-0 text-[10px] font-medium text-amber-500/60">#{index + 1}</span>
                <span className="max-w-[200px] truncate">
                  {msg.text.length > 30 ? msg.text.slice(0, 30) + '...' : msg.text}
                </span>
                {msg.images && msg.images.length > 0 && (
                  <span className="text-[10px] text-amber-500/50">+{msg.images.length}图</span>
                )}
                <button
                  type="button"
                  onClick={() => removeQueuedMessage(index)}
                  className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-amber-500/20"
                  aria-label={`移除排队消息 ${index + 1}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => clearPending(sessionId)}
              className="flex items-center gap-1 rounded-full border border-red-500/15 bg-red-500/[0.04] px-2 py-1 text-[10px] text-red-400/70 transition-colors hover:border-red-500/25 hover:bg-red-500/[0.08]"
              aria-label="清空排队"
            >
              <X size={10} />
              <span>清空排队</span>
            </button>
          </div>
        )}

        {(images.length > 0 || files.length > 0) && (
          <div className="mb-2 px-1">
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div
                  key={`img-${index}`}
                  className="group relative flex h-[64px] items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]"
                >
                  <img
                    src={image.preview}
                    alt={`图片 ${index + 1}`}
                    className="h-full w-[88px] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80"
                    aria-label={`移除图片 ${index + 1}`}
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
              {files.map((file, index) => (
                <div
                  key={`file-${file.path}-${index}`}
                  className="group relative flex h-[64px] items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5"
                >
                  {file.isDirectory ? (
                    <FolderIcon size={22} className="shrink-0 text-amber-400/70" />
                  ) : (
                    <FileIcon size={22} className="shrink-0 text-sky-400/70" />
                  )}
                  <div className="min-w-0 pr-2">
                    <p className="max-w-[160px] truncate text-sm text-zinc-200">{file.name}</p>
                    <p className="text-[11px] text-zinc-500">{file.size}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80"
                    aria-label={`移除文件 ${file.name}`}
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Floating composer bar */}
        <div className="composer-shell flex items-end gap-2 px-2.5 py-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            tabIndex={-1}
          />

          <ComposerCapabilities
            disabled={disabled}
            onAttachFiles={() => fileInputRef.current?.click()}
          />

          <div className="relative min-w-0 flex-1">
            <SlashSkillSuggest
              value={value}
              skills={skills}
              onPick={handleSlashPick}
            />
            <MessageTextEditor
              ref={textareaRef}
              value={value}
              disabled={disabled}
              placeholder={images.length > 0 ? '给图片补充一点说明（可选）' : placeholder}
              attachmentSummary={attachmentSummary || undefined}
              queueCount={messageQueue.length}
              onChange={setValue}
              onPaste={handlePaste}
              onSubmit={() => void submit()}
            />
          </div>

          {streaming && onStop ? (
            <button
              type="button"
              onClick={onStop}
              disabled={cancelling}
              className="mb-0.5 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.06] px-3.5 text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-white disabled:cursor-wait disabled:opacity-60"
              aria-label={cancelling ? '正在停止响应' : '停止响应'}
            >
              {cancelling ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Square size={11} className="fill-current" aria-hidden="true" />
              )}
              <span className="text-xs" aria-live="polite">{cancelling ? '正在停止' : '停止'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || !hasContent}
              onClick={() => void submit()}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-all hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-zinc-600 disabled:shadow-none active:scale-95"
              aria-label="发送消息"
            >
              <SendHorizonal size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(MessageInput)
