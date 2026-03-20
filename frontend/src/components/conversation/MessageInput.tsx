import { SendHorizonal, Square, X, Upload, Paperclip, Smile, FileIcon, FolderIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import StickerPicker from '../sticker/StickerPicker'
import MessageTextEditor from './MessageTextEditor'
import type { StickerResult } from '../../stores/stickerStore'
import { useStickerStore } from '../../stores/stickerStore'
import { FileTransferService } from '../../../bindings/allbeingsfuture/internal/services'
import { useIpcEvent } from '../../hooks/useIpcEvent'
import { useDraftStore } from '../../stores/draftStore'
import type { ImageAttachment, FileAttachment } from '../../stores/draftStore'

interface QueuedMessage {
  text: string
  images?: Array<{ data: string; mimeType: string }>
}

interface Props {
  disabled?: boolean
  placeholder?: string
  streaming?: boolean
  sessionId: string
  onSend: (text: string, images?: Array<{data: string, mimeType: string}>) => Promise<void> | void
  onStop?: () => void
}

function MessageInput({
  disabled = false,
  placeholder = '输入消息，Enter 发送',
  streaming = false,
  sessionId,
  onSend,
  onStop,
}: Props) {
  const { saveDraft, getDraft, clearDraft } = useDraftStore()
  const initialDraft = useRef(getDraft(sessionId))

  const [value, setValue] = useState(initialDraft.current?.text ?? '')
  const [images, setImages] = useState<ImageAttachment[]>(initialDraft.current?.images ?? [])
  const [files, setFiles] = useState<FileAttachment[]>(initialDraft.current?.files ?? [])
  const [dragging, setDragging] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stickerRef = useRef<HTMLDivElement>(null)
  const stickerBtnRef = useRef<HTMLButtonElement>(null)
  const dragCounterRef = useRef(0)

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

  const { downloadAndCache } = useStickerStore()

  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }, [])

  useEffect(() => {
    if (!stickerOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        stickerRef.current &&
        !stickerRef.current.contains(event.target as Node) &&
        stickerBtnRef.current &&
        !stickerBtnRef.current.contains(event.target as Node)
      ) {
        setStickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [stickerOpen])

  const handleStickerSelect = useCallback(async (sticker: StickerResult) => {
    setStickerOpen(false)

    try {
      await downloadAndCache(sticker.url)
      const response = await fetch(sticker.url)
      const blob = await response.blob()
      const reader = new FileReader()

      reader.onload = () => {
        const dataUrl = reader.result as string
        const commaIndex = dataUrl.indexOf(',')
        const base64Data = dataUrl.substring(commaIndex + 1)

        setImages((current) => [
          ...current,
          {
            data: base64Data,
            mimeType: blob.type || 'image/png',
            preview: dataUrl,
          },
        ])
        focusEditor()
      }

      reader.readAsDataURL(blob)
    } catch {
      setValue((current) => current + `[${sticker.name}]`)
      focusEditor()
    }
  }, [downloadAndCache, focusEditor])

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

  const buildMessage = useCallback((): QueuedMessage | null => {
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

  const doSendMessage = useCallback(async (msg: QueuedMessage) => {
    await onSend(msg.text, msg.images)
  }, [onSend])

  const submit = useCallback(async () => {
    const msg = buildMessage()
    if (!msg || disabled) return

    clearInput()

    if (streaming) {
      // AI is busy — queue the message
      setMessageQueue((q) => [...q, msg])
      return
    }

    await doSendMessage(msg)
  }, [buildMessage, clearInput, disabled, doSendMessage, streaming])

  // Auto-send queued messages when streaming ends
  const prevStreamingRef = useRef(streaming)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue
      setMessageQueue(rest)
      void doSendMessage(next)
    }
    prevStreamingRef.current = streaming
  }, [streaming, messageQueue, doSendMessage])

  const removeQueuedMessage = useCallback((index: number) => {
    setMessageQueue((q) => q.filter((_, i) => i !== index))
  }, [])

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

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    dragCounterRef.current = 0

    const droppedFiles = event.dataTransfer?.files
    if (droppedFiles) {
      for (let index = 0; index < droppedFiles.length; index += 1) {
        const file = droppedFiles[index]
        const filePath = (file as any).path as string | undefined

        if (filePath) {
          continue
        }

        if (file.type.startsWith('image/')) {
          addImageFile(file)
        }
      }
    }
  }, [addImageFile])

  useIpcEvent<string[]>('files-dropped', useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return
    for (const filePath of paths) {
      if (!filePath) continue
      void addFileByPath(filePath)
    }
  }, [addFileByPath]))

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

  const attachmentSummary = [
    images.length > 0 ? `${images.length} 张图片` : null,
    files.length > 0 ? `${files.length} 个文件` : null,
  ].filter(Boolean).join(' · ')

  const hasContent = Boolean(value.trim() || images.length > 0 || files.length > 0)

  return (
    <div
      className="relative shrink-0 border-t border-white/[0.06] bg-[#0b1019]/85 px-4 py-3 backdrop-blur-sm"
      data-file-drop-target="message-input"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400/40 bg-blue-500/[0.06] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-blue-400">
            <Upload size={24} className="animate-bounce" />
            <span className="text-sm font-medium">拖放文件到这里</span>
          </div>
        </div>
      )}

      {/* Queued messages — shown above the editor */}
      {messageQueue.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {messageQueue.map((msg, index) => (
            <div
              key={index}
              className="group flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-1.5 text-xs text-amber-300/80"
            >
              <span className="text-[10px] text-amber-500/60 font-medium shrink-0">#{index + 1}</span>
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
            onClick={() => setMessageQueue([])}
            className="flex items-center gap-1 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-2 py-1.5 text-[10px] text-red-400/70 transition-colors hover:border-red-500/25 hover:bg-red-500/[0.08]"
            aria-label="清空排队"
          >
            <X size={10} />
            <span>清空排队</span>
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
            {images.map((image, index) => (
              <div key={`${image.preview}-${index}`} className="group relative">
                <img
                  src={image.preview}
                  alt={`图片 ${index + 1}`}
                  className="h-14 w-14 rounded-xl border border-white/[0.08] object-cover shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 hover:bg-red-500"
                  aria-label={`移除图片 ${index + 1}`}
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
            {files.map((file, index) => (
              <div
                key={`${file.path}-${index}`}
                className="group relative flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5"
              >
                {file.isDirectory ? (
                  <FolderIcon size={14} className="shrink-0 text-yellow-400" />
                ) : (
                  <FileIcon size={14} className="shrink-0 text-blue-400" />
                )}
                <div className="min-w-0">
                  <p className="max-w-[150px] truncate text-xs text-gray-200">{file.name}</p>
                  <p className="max-w-[300px] truncate text-[10px] text-gray-500" title={file.path}>{file.path}</p>
                  <p className="text-[10px] text-gray-500">{file.size}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`移除文件 ${file.name}`}
                >
                  <X size={8} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const selectedFiles = event.target.files
            if (!selectedFiles) return

            for (let index = 0; index < selectedFiles.length; index += 1) {
              const file = selectedFiles[index]
              if (file.type.startsWith('image/')) {
                addImageFile(file)
              } else {
                const path = (file as any).path || file.name
                if (path) void addFileByPath(path)
              }
            }

            event.target.value = ''
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-all duration-200 hover:bg-white/[0.05] hover:text-gray-300"
          title="添加文件"
          aria-label="添加文件"
        >
          <Paperclip size={16} />
        </button>

        <div className="relative">
          <button
            ref={stickerBtnRef}
            type="button"
            onClick={() => setStickerOpen((current) => !current)}
            className={`flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/[0.05] ${
              stickerOpen ? 'bg-white/[0.05] text-yellow-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="表情包"
            aria-label="表情包"
          >
            <Smile size={16} />
          </button>

          {stickerOpen && (
            <div
              ref={stickerRef}
              className="absolute bottom-full left-0 z-50 mb-2 w-[380px] max-h-[440px] overflow-hidden rounded-2xl border border-white/[0.08] bg-gray-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="text-xs font-medium text-gray-400">表情包</span>
                <button
                  type="button"
                  onClick={() => setStickerOpen(false)}
                  className="text-gray-500 transition-colors hover:text-gray-300"
                  aria-label="关闭表情包面板"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-[390px] overflow-y-auto">
                <StickerPicker compact onSelect={handleStickerSelect} />
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onStop}
              className="flex h-[42px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-gray-400 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-gray-200"
              aria-label="停止响应"
            >
              <Square size={12} className="fill-current" />
              <span className="text-xs">停止</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || !hasContent}
            onClick={() => void submit()}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:bg-blue-400 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none active:scale-95"
            aria-label="发送消息"
          >
            <SendHorizonal size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export default React.memo(MessageInput)
