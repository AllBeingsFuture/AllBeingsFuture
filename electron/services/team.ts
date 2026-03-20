/**
 * TeamService - Team definitions, instances, members, tasks, messages
 * Replaces Go internal/services/team.go
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export class TeamService {
  constructor(private db: Database) {
    this.ensureExtraTables()
  }

  private ensureExtraTables(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY, instance_id TEXT NOT NULL DEFAULT '', role_name TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
        config_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS team_messages (
        id TEXT PRIMARY KEY, instance_id TEXT NOT NULL DEFAULT '', from_role TEXT NOT NULL DEFAULT '',
        to_role TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', msg_type TEXT NOT NULL DEFAULT 'text',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS team_tasks (
        id TEXT PRIMARY KEY, instance_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', task_type TEXT NOT NULL DEFAULT '', assigned_to TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending', completed_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  }

  // ---- Definitions ----
  createDefinition(name: string, description: string, roles: any[]): any {
    const id = uuidv4(); const now = new Date().toISOString()
    this.db.raw.prepare('INSERT INTO team_definitions (id, name, description, members_json, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, \'{}\', ?, ?)')
      .run(id, name, description, JSON.stringify(roles || []), now, now)
    return this.getDefinition(id)
  }

  getDefinition(id: string): any {
    const row = this.db.raw.prepare('SELECT * FROM team_definitions WHERE id = ?').get(id) as any
    if (!row) return null
    return { ...row, members: JSON.parse(row.members_json || '[]'), config: JSON.parse(row.config_json || '{}') }
  }

  listDefinitions(): any[] {
    return this.db.raw.prepare('SELECT * FROM team_definitions ORDER BY created_at DESC').all()
      .map((r: any) => ({ ...r, members: JSON.parse(r.members_json || '[]'), config: JSON.parse(r.config_json || '{}') }))
  }

  updateDefinition(id: string, name: string, description: string): void {
    this.db.raw.prepare('UPDATE team_definitions SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(name, description, new Date().toISOString(), id)
  }

  deleteDefinition(id: string): void { this.db.raw.prepare('DELETE FROM team_definitions WHERE id = ?').run(id) }

  // ---- Roles ----
  addRole(teamId: string, role: any): void {
    const def = this.getDefinition(teamId); if (!def) return
    role.id = role.id || uuidv4(); def.members.push(role)
    this.db.raw.prepare('UPDATE team_definitions SET members_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(def.members), new Date().toISOString(), teamId)
  }

  updateRole(roleId: string, role: any): void {
    for (const def of this.listDefinitions()) {
      const idx = def.members.findIndex((m: any) => m.id === roleId)
      if (idx >= 0) {
        def.members[idx] = { ...def.members[idx], ...role }
        this.db.raw.prepare('UPDATE team_definitions SET members_json = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(def.members), new Date().toISOString(), def.id)
        break
      }
    }
  }

  deleteRole(roleId: string): void {
    for (const def of this.listDefinitions()) {
      const idx = def.members.findIndex((m: any) => m.id === roleId)
      if (idx >= 0) {
        def.members.splice(idx, 1)
        this.db.raw.prepare('UPDATE team_definitions SET members_json = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(def.members), new Date().toISOString(), def.id)
        break
      }
    }
  }

  // ---- Instances ----
  startInstance(teamId: string, workingDir: string, task: string): any {
    const def = this.getDefinition(teamId)
    if (!def) throw new Error(`Team definition not found: ${teamId}`)
    const id = uuidv4(); const now = new Date().toISOString()
    const members = def.members.map((m: any) => ({ ...m, instanceMemberId: uuidv4(), status: 'idle' }))
    this.db.raw.prepare('INSERT INTO team_instances (id, definition_id, status, members_json, messages_json, results_json, created_at, updated_at) VALUES (?, ?, \'running\', ?, \'[]\', \'[]\', ?, ?)')
      .run(id, teamId, JSON.stringify(members), now, now)
    if (task) this.createTask(id, task, '', 'main', '')
    return this.getInstance(id)
  }

  getInstance(id: string): any {
    const row = this.db.raw.prepare('SELECT * FROM team_instances WHERE id = ?').get(id) as any
    if (!row) return null
    return { ...row, members: JSON.parse(row.members_json || '[]'), messages: JSON.parse(row.messages_json || '[]'), results: JSON.parse(row.results_json || '[]') }
  }

  listInstances(): any[] {
    return this.db.raw.prepare('SELECT * FROM team_instances ORDER BY created_at DESC').all()
      .map((r: any) => ({ ...r, members: JSON.parse(r.members_json || '[]'), messages: JSON.parse(r.messages_json || '[]'), results: JSON.parse(r.results_json || '[]') }))
  }

  updateInstanceStatus(id: string, status: string): void {
    this.db.raw.prepare('UPDATE team_instances SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
  }

  // ---- Members ----
  getMembers(instanceId: string): any[] { return this.getInstance(instanceId)?.members || [] }

  updateMemberStatus(memberId: string, status: string): void {
    for (const inst of this.listInstances()) {
      const idx = inst.members.findIndex((m: any) => m.instanceMemberId === memberId || m.id === memberId)
      if (idx >= 0) {
        inst.members[idx].status = status
        this.db.raw.prepare('UPDATE team_instances SET members_json = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(inst.members), new Date().toISOString(), inst.id)
        break
      }
    }
  }

  // ---- Messages ----
  sendMessage(instanceId: string, fromRole: string, toRole: string, content: string, msgType: string = 'text'): any {
    const id = uuidv4(); const now = new Date().toISOString()
    this.db.raw.prepare('INSERT INTO team_messages (id, instance_id, from_role, to_role, content, msg_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, instanceId, fromRole, toRole, content, msgType, now)
    return { id, instanceId, fromRole, toRole, content, msgType, createdAt: now }
  }

  getMessages(instanceId: string, limit: number = 100): any[] {
    return this.db.raw.prepare('SELECT * FROM team_messages WHERE instance_id = ? ORDER BY created_at DESC LIMIT ?').all(instanceId, limit) as any[]
  }

  // ---- Tasks ----
  createTask(instanceId: string, title: string, description: string, taskType: string, assignedTo: string): any {
    const id = uuidv4(); const now = new Date().toISOString()
    this.db.raw.prepare('INSERT INTO team_tasks (id, instance_id, title, description, task_type, assigned_to, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'pending\', ?, ?)')
      .run(id, instanceId, title, description, taskType, assignedTo, now, now)
    return { id, instanceId, title, description, taskType, assignedTo, status: 'pending' }
  }

  getTasks(instanceId: string): any[] {
    return this.db.raw.prepare('SELECT * FROM team_tasks WHERE instance_id = ? ORDER BY created_at').all(instanceId) as any[]
  }

  updateTaskStatus(taskId: string, status: string, completedBy: string = ''): void {
    this.db.raw.prepare('UPDATE team_tasks SET status = ?, completed_by = ?, updated_at = ? WHERE id = ?')
      .run(status, completedBy, new Date().toISOString(), taskId)
  }

  // Legacy
  getDefinitions(): any[] { return this.listDefinitions() }
  getInstances(): any[] { return this.listInstances() }
  createInstance(data: any): any { return this.startInstance(data.definitionId || '', data.workingDir || '', data.task || '') }
  updateInstance(id: string, data: any): void {
    this.db.raw.prepare('UPDATE team_instances SET status = ?, members_json = ?, messages_json = ?, results_json = ?, updated_at = ? WHERE id = ?')
      .run(data.status || 'idle', JSON.stringify(data.members || []), JSON.stringify(data.messages || []), JSON.stringify(data.results || []), new Date().toISOString(), id)
  }
  deleteInstance(id: string): void {
    this.db.raw.prepare('DELETE FROM team_tasks WHERE instance_id = ?').run(id)
    this.db.raw.prepare('DELETE FROM team_messages WHERE instance_id = ?').run(id)
    this.db.raw.prepare('DELETE FROM team_instances WHERE id = ?').run(id)
  }
}
