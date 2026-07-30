import { ipc, createNullable, createArray } from '../../../electron-api'
import { TeamDefinition, TeamInstance, TeamMessage, TeamRoleDefinition, TeamTaskItem } from "../models/models.js"

export function AddRole(teamID: string, role: TeamRoleDefinition): Promise<TeamRoleDefinition | null> {
    return ipc("TeamService.AddRole", teamID, role).then(createNullable(TeamRoleDefinition.createFrom))
}

export function CreateDefinition(name: string, description: string, roles: TeamRoleDefinition[]): Promise<TeamDefinition | null> {
    return ipc("TeamService.CreateDefinition", name, description, roles).then(createNullable(TeamDefinition.createFrom))
}

export function DeleteDefinition(id: string): Promise<void> {
    return ipc("TeamService.DeleteDefinition", id)
}

export function DeleteRole(roleID: string): Promise<void> {
    return ipc("TeamService.DeleteRole", roleID)
}

export function GetMessages(instanceID: string, limit: number): Promise<TeamMessage[]> {
    return ipc("TeamService.GetMessages", instanceID, limit).then(createArray(TeamMessage.createFrom))
}

export function GetTasks(instanceID: string): Promise<TeamTaskItem[]> {
    return ipc("TeamService.GetTasks", instanceID).then(createArray(TeamTaskItem.createFrom))
}

export function ListDefinitions(): Promise<TeamDefinition[]> {
    return ipc("TeamService.ListDefinitions").then(createArray(TeamDefinition.createFrom))
}

export function ListInstances(): Promise<TeamInstance[]> {
    return ipc("TeamService.ListInstances").then(createArray(TeamInstance.createFrom))
}

export function StartInstance(teamID: string, workingDir: string, task: string): Promise<TeamInstance | null> {
    return ipc("TeamService.StartInstance", teamID, workingDir, task).then(createNullable(TeamInstance.createFrom))
}

export function UpdateDefinition(id: string, name: string, description: string): Promise<void> {
    return ipc("TeamService.UpdateDefinition", id, name, description)
}

export function UpdateRole(roleID: string, role: TeamRoleDefinition): Promise<void> {
    return ipc("TeamService.UpdateRole", roleID, role)
}
