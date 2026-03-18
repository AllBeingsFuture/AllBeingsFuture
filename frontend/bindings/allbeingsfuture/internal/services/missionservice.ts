import { ipc } from '../../../electron-api';

/**
 * Create a new mission.
 */
export function CreateMission(input: any): Promise<any> {
    return ipc("MissionService.CreateMission", input);
}

/**
 * Confirm the brainstorm for a mission.
 */
export function ConfirmBrainstorm(missionID: string, updatedBrainstorm: any): Promise<any> {
    return ipc("MissionService.ConfirmBrainstorm", missionID, updatedBrainstorm);
}

/**
 * Confirm the team design for a mission.
 */
export function ConfirmTeamDesign(missionID: string, updatedTeamDesign: any): Promise<any> {
    return ipc("MissionService.ConfirmTeamDesign", missionID, updatedTeamDesign);
}

/**
 * Confirm the phases for a mission.
 */
export function ConfirmPhases(missionID: string, updatedPlan: any): Promise<void> {
    return ipc("MissionService.ConfirmPhases", missionID, updatedPlan);
}

/**
 * Start a mission.
 */
export function StartMission(missionID: string): Promise<void> {
    return ipc("MissionService.StartMission", missionID);
}

/**
 * Pause a mission.
 */
export function PauseMission(missionID: string): Promise<void> {
    return ipc("MissionService.PauseMission", missionID);
}

/**
 * Resume a mission.
 */
export function ResumeMission(missionID: string): Promise<void> {
    return ipc("MissionService.ResumeMission", missionID);
}

/**
 * Abort a mission.
 */
export function AbortMission(missionID: string): Promise<void> {
    return ipc("MissionService.AbortMission", missionID);
}

/**
 * Skip the current phase of a mission.
 */
export function SkipCurrentPhase(missionID: string): Promise<void> {
    return ipc("MissionService.SkipCurrentPhase", missionID);
}

/**
 * Update the plan for a mission.
 */
export function UpdatePlan(missionID: string, plan: any): Promise<void> {
    return ipc("MissionService.UpdatePlan", missionID, plan);
}

/**
 * Get a mission by ID.
 */
export function GetMission(missionID: string): Promise<any> {
    return ipc("MissionService.GetMission", missionID);
}

/**
 * List all missions.
 */
export function ListMissions(): Promise<any[]> {
    return ipc("MissionService.ListMissions");
}

/**
 * Delete a mission.
 */
export function DeleteMission(missionID: string): Promise<void> {
    return ipc("MissionService.DeleteMission", missionID);
}

/**
 * List all role templates.
 */
export function ListRoleTemplates(): Promise<any[]> {
    return ipc("MissionService.ListRoleTemplates");
}

/**
 * Get a role template by ID.
 */
export function GetRoleTemplate(id: string): Promise<any> {
    return ipc("MissionService.GetRoleTemplate", id);
}

/**
 * Get role templates by category.
 */
export function GetRoleTemplatesByCategory(category: string): Promise<any[]> {
    return ipc("MissionService.GetRoleTemplatesByCategory", category);
}
