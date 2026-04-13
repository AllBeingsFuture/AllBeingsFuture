/**
 * MissionService - Multi-phase mission management
 * Replaces Go internal/services/mission.go
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

const ROLE_TEMPLATES = [
  { id: 'architect', name: '架构师', category: 'engineering', description: '负责系统架构设计和技术决策' },
  { id: 'developer', name: '开发者', category: 'engineering', description: '负责代码实现和功能开发' },
  { id: 'reviewer', name: '审查员', category: 'engineering', description: '负责代码审查和质量把控' },
  { id: 'tester', name: '测试员', category: 'qa', description: '负责测试用例设计和执行' },
  { id: 'pm', name: '项目经理', category: 'management', description: '负责项目计划和进度管理' },
  { id: 'designer', name: '设计师', category: 'design', description: '负责界面设计和用户体验' },
  { id: 'researcher', name: '研究员', category: 'research', description: '负责技术调研和方案评估' },
  { id: 'writer', name: '文档作者', category: 'documentation', description: '负责技术文档和用户手册' },
]

export class MissionService {
  constructor(private db: Database) {}

  private rowToMission(row: any): any {
    return {
      ...row,
      steps: JSON.parse(row.steps_json || '[]'),
      config: JSON.parse(row.config_json || '{}'),
      results: JSON.parse(row.results_json || '[]'),
    }
  }

  createMission(input: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO missions (id, name, description, status, steps_json, config_json, created_at, updated_at)
      VALUES (?, ?, ?, 'planning', ?, ?, ?, ?)
    `).run(id, input.name || '', input.description || '', JSON.stringify(input.steps || []), JSON.stringify(input.config || {}), now, now)
    return this.getMission(id)
  }

  getMission(missionId: string): any {
    const row = this.db.raw.prepare('SELECT * FROM missions WHERE id = ?').get(missionId) as any
    return row ? this.rowToMission(row) : null
  }

  listMissions(): any[] {
    return this.db.raw.prepare('SELECT * FROM missions ORDER BY created_at DESC').all().map((r: any) => this.rowToMission(r))
  }

  deleteMission(missionId: string): void {
    this.db.raw.prepare('DELETE FROM missions WHERE id = ?').run(missionId)
  }

  confirmBrainstorm(missionId: string, updatedBrainstorm: any): any {
    const mission = this.getMission(missionId)
    if (!mission) throw new Error('Mission not found')
    const config = { ...mission.config, brainstorm: updatedBrainstorm }
    this.db.raw.prepare("UPDATE missions SET status = 'brainstormed', config_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(config), new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  confirmTeamDesign(missionId: string, updatedTeamDesign: any): any {
    const mission = this.getMission(missionId)
    if (!mission) throw new Error('Mission not found')
    const config = { ...mission.config, teamDesign: updatedTeamDesign }
    this.db.raw.prepare("UPDATE missions SET status = 'team_designed', config_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(config), new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  confirmPhases(missionId: string, updatedPlan: any): any {
    this.db.raw.prepare("UPDATE missions SET status = 'planned', steps_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(updatedPlan), new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  startMission(missionId: string): any {
    const now = new Date().toISOString()
    this.db.raw.prepare("UPDATE missions SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(now, now, missionId)
    return this.getMission(missionId)
  }

  pauseMission(missionId: string): any {
    this.db.raw.prepare("UPDATE missions SET status = 'paused', updated_at = ? WHERE id = ?").run(new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  resumeMission(missionId: string): any {
    this.db.raw.prepare("UPDATE missions SET status = 'running', updated_at = ? WHERE id = ?").run(new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  abortMission(missionId: string): any {
    const now = new Date().toISOString()
    this.db.raw.prepare("UPDATE missions SET status = 'aborted', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, missionId)
    return this.getMission(missionId)
  }

  skipCurrentPhase(missionId: string): any {
    const mission = this.getMission(missionId)
    if (!mission) throw new Error('Mission not found')
    const steps = mission.steps
    const currentIdx = steps.findIndex((s: any) => s.status === 'running')
    if (currentIdx >= 0) {
      steps[currentIdx].status = 'skipped'
      if (currentIdx + 1 < steps.length) steps[currentIdx + 1].status = 'running'
    }
    this.db.raw.prepare('UPDATE missions SET steps_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(steps), new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  updatePlan(missionId: string, plan: any): any {
    this.db.raw.prepare('UPDATE missions SET steps_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(plan), new Date().toISOString(), missionId)
    return this.getMission(missionId)
  }

  listRoleTemplates(): any[] { return [...ROLE_TEMPLATES] }
  getRoleTemplate(id: string): any { return ROLE_TEMPLATES.find(t => t.id === id) || null }
  getRoleTemplatesByCategory(category: string): any[] { return ROLE_TEMPLATES.filter(t => t.category === category) }

  // Legacy
  getAll(): any[] { return this.listMissions() }
  create(data: any): any { return this.createMission(data) }
  update(id: string, data: any): void {
    this.db.raw.prepare('UPDATE missions SET name = ?, description = ?, status = ?, steps_json = ?, config_json = ?, results_json = ?, updated_at = ? WHERE id = ?')
      .run(data.name || '', data.description || '', data.status || 'draft', JSON.stringify(data.steps || []), JSON.stringify(data.config || {}), JSON.stringify(data.results || []), new Date().toISOString(), id)
  }
  delete(id: string): void { this.deleteMission(id) }
}
