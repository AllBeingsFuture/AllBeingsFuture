/**
 * MissionService - Multi-phase mission management
 * Replaces Go internal/services/mission.go
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

const ROLE_TEMPLATES = [
  { id: 'architect', name: 'Architect', category: 'engineering', description: 'Responsible for system architecture design and technical decisions' },
  { id: 'developer', name: 'Developer', category: 'engineering', description: 'Responsible for code implementation and feature development' },
  { id: 'reviewer', name: 'Reviewer', category: 'engineering', description: 'Responsible for code review and quality control' },
  { id: 'tester', name: 'Tester', category: 'qa', description: 'Responsible for test case design and execution' },
  { id: 'pm', name: 'Project Manager', category: 'management', description: 'Responsible for project planning and progress management' },
  { id: 'designer', name: 'Designer', category: 'design', description: 'Responsible for UI design and user experience' },
  { id: 'researcher', name: 'Researcher', category: 'research', description: 'Responsible for technical research and solution evaluation' },
  { id: 'writer', name: 'Technical Writer', category: 'documentation', description: 'Responsible for technical documentation and user manuals' },
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

  listRoleTemplates(): any[] { return [...ROLE_TEMPLATES] }
}
