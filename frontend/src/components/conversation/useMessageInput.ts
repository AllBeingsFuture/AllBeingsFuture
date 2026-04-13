import { useCallback, useEffect, useRef, useState } from 'react'
import type { StickerResult } from '../../stores/stickerStore'
import { useStickerStore } from '../../stores/stickerStore'
import { FileTransferService } from '../../../bindings/allbeingsfuture/internal/services'
import { useDraftStore } from '../../stores/draftStore'
import type { ImageAttachment, FileAttachment } from '../../stores/draftStore'

interface QueuedMessage {
  text: string
  images?: Array<{ data: string; mimeType: string }>
}

interface UseMessageInputOptions {
  sessionId: string
  disabled: boolean
  streaming: boolean
  onSend: (text: string, images?: Array<{ data: string; mimeType: string }>) => Promise<void> | void
}

export function useMessageInput({ sessionId, disabled, streaming, onSend }: UseMessageInputOptions) {
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

  // Save draft on unmount
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

  // Close sticker picker on outside click
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
        ? '\u6587\u4EF6\u5939'
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

    let finalText = text || (images.length > 0 ? '\u8BF7\u770B\u56FE\u7247' : '')

    if (files.length > 0) {
      const fileRefs = files.map((file) => `[\u6587\u4EF6: ${file.name}](${file.path})`).join('\n')
      finalText = finalText ? `${finalText}\n\n\u9644\u4EF6:\n${fileRefs}` : `\u9644\u4EF6:\n${fileRefs}`
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
      setMessageQueue((q) => [...q, msg])
      return
    }

    await doSendMessage(msg)
  }, [buildMessage, clearInput, disabled, doSendMessage, streaming])

  // Auto-send queued messages when streaming ends
  const prevStreamingRef = useRef(streaming)
  const sendingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && messageQueue.length > 0 && !sendingRef.current) {
      const [next, ...rest] = messageQueue
      sendingRef.current = true
      setMessageQueue(rest)
      doSendMessage(next)
        .catch(() => {
          setMessageQueue((q) => [next, ...q])
        })
        .finally(() => { sendingRef.current = false })
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
  }, [addImageFile, addFileByPath])

  const attachmentSummary = [
    images.length > 0 ? `${images.length} \u5F20\u56FE\u7247` : null,
    files.length > 0 ? `${files.length} \u4E2A\u6587\u4EF6` : null,
  ].filter(Boolean).join(' \u00B7 ')

  const hasContent = Boolean(value.trim() || images.length > 0 || files.length > 0)

  return {
    // State
    value,
    setValue,
    images,
    files,
    dragging,
    stickerOpen,
    setStickerOpen,
    messageQueue,
    setMessageQueue,

    // Refs
    textareaRef,
    fileInputRef,
    stickerRef,
    stickerBtnRef,

    // Handlers
    submit,
    handleStickerSelect,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    handleFileInputChange,
    removeImage,
    removeFile,
    removeQueuedMessage,

    // Computed
    attachmentSummary,
    hasContent,
  }
}
