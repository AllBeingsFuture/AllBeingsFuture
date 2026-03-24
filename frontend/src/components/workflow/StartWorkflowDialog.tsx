import { useState, useCallback } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflowStore'

export default function StartWorkflowDialog({
  workflow,
  onClose,
}: {
  workflow: any
  onClose: () => void
}) {
  const { start, load } = useWorkflowStore(useShallow((state) => ({
    start: state.start,
    load: state.load,
  })))
  const [variables, setVariables] = useState('{}')
  const [jsonError, setJsonError] = useState('')
  const [starting, setStarting] = useState(false)

  const validate = useCallback((val: string) => {
    try {
      JSON.parse(val)
      setJsonError('')
      return true
    } catch (e: any) {
      setJsonError(e.message)
      return false
    }
  }, [])

  const handleStart = async () => {
    if (!validate(variables)) return
    setStarting(true)
    try {
      await start(workflow.id, variables)
      await load()
      onClose()
    } catch (err: any) {
      setJsonError(err.message || '启动失败')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-dark-card rounded-xl border border-dark-border w-[520px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-1 text-gray-200">启动工作流</h3>
        <p className="text-xs text-gray-500 mb-4">{workflow.name}</p>

        <label className="block text-sm text-gray-400 mb-1">变量 (JSON)</label>
        <textarea
          value={variables}
          onChange={(e) => {
            setVariables(e.target.value)
            validate(e.target.value)
          }}
          rows={6}
          spellCheck={false}
          className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono outline-none focus:border-dark-accent resize-none"
          placeholder='{"key": "value"}'
        />
        {jsonError && (
          <p className="text-xs text-red-400 mt-1">{jsonError}</p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg"
          >
            取消
          </button>
          <button
            onClick={handleStart}
            disabled={starting || !!jsonError}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            启动
          </button>
        </div>
      </div>
    </div>
  )
}
