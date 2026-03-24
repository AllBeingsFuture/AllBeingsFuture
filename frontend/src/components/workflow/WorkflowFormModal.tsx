import { useState, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflowStore'
import { DEFAULT_DEFINITION } from './workflowConstants'

export default function WorkflowFormModal({
  workflow,
  onClose,
}: {
  workflow: any | null
  onClose: () => void
}) {
  const { create, update, load } = useWorkflowStore(useShallow((state) => ({
    create: state.create,
    update: state.update,
    load: state.load,
  })))

  const isEditing = !!workflow
  const [name, setName] = useState(workflow?.name ?? '')
  const [description, setDescription] = useState(workflow?.description ?? '')
  const [definition, setDefinition] = useState(
    workflow
      ? typeof workflow.definition === 'string'
        ? workflow.definition
        : JSON.stringify(workflow.definition, null, 2)
      : DEFAULT_DEFINITION,
  )
  const [jsonError, setJsonError] = useState('')
  const [saving, setSaving] = useState(false)

  const validateJson = useCallback((val: string) => {
    try {
      const parsed = JSON.parse(val)
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        setJsonError('定义必须包含 steps 数组')
        return false
      }
      for (const step of parsed.steps) {
        if (!step.id || !step.name || !step.type) {
          setJsonError('每个步骤必须包含 id、name 和 type 字段')
          return false
        }
      }
      setJsonError('')
      return true
    } catch (e: any) {
      setJsonError(`JSON 格式错误: ${e.message}`)
      return false
    }
  }, [])

  const handleSave = async () => {
    if (!name.trim()) return
    if (!validateJson(definition)) return

    setSaving(true)
    try {
      if (isEditing) {
        await update(workflow.id, name.trim(), description.trim(), definition)
      } else {
        await create(name.trim(), description.trim(), definition)
      }
      await load()
      onClose()
    } catch (err: any) {
      setJsonError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(definition)
      setDefinition(JSON.stringify(parsed, null, 2))
      setJsonError('')
    } catch (e: any) {
      setJsonError(`JSON 格式错误: ${e.message}`)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-dark-card rounded-xl border border-dark-border w-[640px] max-h-[85vh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4 text-gray-200">
          {isEditing ? '编辑工作流' : '新建工作流'}
        </h3>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* 名称 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入工作流名称"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">描述</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选的工作流描述"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
          </div>

          {/* JSON 定义 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">流程定义 (JSON)</label>
              <button
                onClick={handleFormat}
                className="text-xs text-dark-accent hover:underline"
              >
                格式化
              </button>
            </div>
            <textarea
              value={definition}
              onChange={(e) => {
                setDefinition(e.target.value)
                if (jsonError) validateJson(e.target.value)
              }}
              onBlur={() => validateJson(definition)}
              rows={14}
              spellCheck={false}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono outline-none focus:border-dark-accent resize-none leading-relaxed"
              placeholder={DEFAULT_DEFINITION}
            />
            {jsonError && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                {jsonError}
              </p>
            )}
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving || !!jsonError}
            className="px-4 py-2 text-sm bg-dark-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditing ? '保存修改' : '创建工作流'}
          </button>
        </div>
      </div>
    </div>
  )
}
