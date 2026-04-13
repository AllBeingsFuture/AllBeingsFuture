/**
 * WorkflowService - Workflow definition and execution management
 * Replaces Go internal/services/workflow.go + orchestrator
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export class WorkflowService {
  private activeExecutions = new Map<string, any>()

  constructor(private db: Database) {}

  // ---- Workflow Definition CRUD ----

  createWorkflow(name: string, description: string, definitionJSON: string): any {
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO workflows (id, name, description, steps_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description, definitionJSON || '[]', now, now)
    return { id, name, description, steps: JSON.parse(definitionJSON || '[]'), createdAt: now }
  }

  getAllWorkflows(): any[] {
    return this.db.raw.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all().map((row: any) => ({
      ...row, steps: JSON.parse(row.steps_json || '[]'),
    }))
  }

  getWorkflowByID(id: string): any {
    const row = this.db.raw.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any
    if (!row) return null
    return { ...row, steps: JSON.parse(row.steps_json || '[]') }
  }

  updateWorkflow(id: string, name: string, description: string, definitionJSON: string): void {
    const now = new Date().toISOString()
    this.db.raw.prepare(
      'UPDATE workflows SET name = ?, description = ?, steps_json = ?, updated_at = ? WHERE id = ?'
    ).run(name, description, definitionJSON || '[]', now, id)
  }

  deleteWorkflow(id: string): void {
    this.db.raw.prepare('DELETE FROM workflows WHERE id = ?').run(id)
  }

  // ---- Execution ----

  startWorkflow(workflowId: string, variablesJSON: string): any {
    const workflow = this.getWorkflowByID(workflowId)
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)

    const executionId = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO workflow_executions (id, workflow_id, status, current_step, results_json, started_at)
      VALUES (?, ?, 'running', 0, '[]', ?)
    `).run(executionId, workflowId, now)

    const execution = { id: executionId, workflowId, status: 'running', currentStep: 0, variables: JSON.parse(variablesJSON || '{}'), startedAt: now }
    this.activeExecutions.set(executionId, execution)
    return execution
  }

  stopWorkflow(executionId: string): void {
    this.db.raw.prepare("UPDATE workflow_executions SET status = 'cancelled', completed_at = ? WHERE id = ?").run(new Date().toISOString(), executionId)
    this.activeExecutions.delete(executionId)
  }

  approveStep(executionId: string, _stepId: string, approved: boolean): void {
    const execution = this.activeExecutions.get(executionId)
    if (!execution) return
    if (approved) {
      execution.currentStep++
      this.db.raw.prepare('UPDATE workflow_executions SET current_step = ? WHERE id = ?').run(execution.currentStep, executionId)
    }
  }

  getWorkflowStatus(executionId: string): any {
    const row = this.db.raw.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(executionId) as any
    if (!row) return null
    return { ...row, results: JSON.parse(row.results_json || '[]') }
  }

  getActiveWorkflows(): any[] {
    return (this.db.raw.prepare("SELECT * FROM workflow_executions WHERE status = 'running' ORDER BY started_at DESC").all() as any[])
      .map((r: any) => ({ ...r, results: JSON.parse(r.results_json || '[]') }))
  }

  getExecutionHistory(limit: number = 50): any[] {
    return (this.db.raw.prepare('SELECT * FROM workflow_executions ORDER BY started_at DESC LIMIT ?').all(limit) as any[])
      .map((r: any) => ({ ...r, results: JSON.parse(r.results_json || '[]') }))
  }

  // Legacy methods
  getAll(): any[] { return this.getAllWorkflows() }
  create(data: any): any { return this.createWorkflow(data.name || '', data.description || '', JSON.stringify(data.steps || [])) }
  update(id: string, data: any): void { this.updateWorkflow(id, data.name || '', data.description || '', JSON.stringify(data.steps || [])) }
  delete(id: string): void { this.deleteWorkflow(id) }
}
