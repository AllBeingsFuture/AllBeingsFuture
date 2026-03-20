import { ipc, createNullable, createArray } from '../../../electron-api'
import * as models from "../models/models.js"

export function AddRole(teamID: string, role: models.TeamRoleDefinition): Promise<models.TeamRoleDefinition | null> {
    return ipc("TeamService.AddRole", teamID, role).then(createNullable(models.TeamRoleDefinition.createFrom))
}

export function CreateDefinition(name: string, description: string, roles: models.TeamRoleDefinition[]): Promise<models.TeamDefinition | null> {
    return ipc("TeamService.CreateDefinition", name, description, roles).then(createNullable(models.TeamDefinition.createFrom))
}

export function CreateTask(instanceID: string, title: string, description: string, taskType: models.TaskItemType, assignedTo: string): Promise<models.TeamTaskItem | null> {
    return ipc("TeamService.CreateTask", instanceID, title, description, taskType, assignedTo).then(createNullable(models.TeamTaskItem.createFrom))
}

export function DeleteDefinition(id: string): Promise<void> {
    return ipc("TeamService.DeleteDefinition", id)
}

export function DeleteRole(roleID: string): Promise<void> {
    return ipc("TeamService.DeleteRole", roleID)
}

export function GetDefinition(id: string): Promise<models.TeamDefinition | null> {
    return ipc("TeamService.GetDefinition", id).then(createNullable(models.TeamDefinition.createFrom))
}

export function GetInstance(id: string): Promise<models.TeamInstance | null> {
    return ipc("TeamService.GetInstance", id).then(createNullable(models.TeamInstance.createFrom))
}

export function GetMembers(instanceID: string): Promise<models.TeamMember[]> {
    return ipc("TeamService.GetMembers", instanceID).then(createArray(models.TeamMember.createFrom))
}

export function GetMessages(instanceID: string, limit: number): Promise<models.TeamMessage[]> {
    return ipc("TeamService.GetMessages", instanceID, limit).then(createArray(models.TeamMessage.createFrom))
}

export function GetTasks(instanceID: string): Promise<models.TeamTaskItem[]> {
    return ipc("TeamService.GetTasks", instanceID).then(createArray(models.TeamTaskItem.createFrom))
}

export function ListDefinitions(): Promise<models.TeamDefinition[]> {
    return ipc("TeamService.ListDefinitions").then(createArray(models.TeamDefinition.createFrom))
}

export function ListInstances(): Promise<models.TeamInstance[]> {
    return ipc("TeamService.ListInstances").then(createArray(models.TeamInstance.createFrom))
}

export function SendMessage(instanceID: string, fromRole: string, toRole: string, content: string, msgType: models.TeamMessageType): Promise<models.TeamMessage | null> {
    return ipc("TeamService.SendMessage", instanceID, fromRole, toRole, content, msgType).then(createNullable(models.TeamMessage.createFrom))
}

export function StartInstance(teamID: string, workingDir: string, task: string): Promise<models.TeamInstance | null> {
    return ipc("TeamService.StartInstance", teamID, workingDir, task).then(createNullable(models.TeamInstance.createFrom))
}

export function UpdateDefinition(id: string, name: string, description: string): Promise<void> {
    return ipc("TeamService.UpdateDefinition", id, name, description)
}

export function UpdateInstanceStatus(id: string, status: models.TeamInstanceStatus): Promise<void> {
    return ipc("TeamService.UpdateInstanceStatus", id, status)
}

export function UpdateMemberStatus(memberID: string, status: models.MemberStatus): Promise<void> {
    return ipc("TeamService.UpdateMemberStatus", memberID, status)
}

export function UpdateRole(roleID: string, role: models.TeamRoleDefinition): Promise<void> {
    return ipc("TeamService.UpdateRole", roleID, role)
}

export function UpdateTaskStatus(taskID: string, status: models.TaskItemStatus, completedBy: string): Promise<void> {
    return ipc("TeamService.UpdateTaskStatus", taskID, status, completedBy)
}
