import { ipc } from '../../../electron-api';

export function CreateMission(input: any): Promise<any> {
    return ipc("MissionService.CreateMission", input);
}

export function ConfirmBrainstorm(missionID: string, updatedBrainstorm: any): Promise<any> {
    return ipc("MissionService.ConfirmBrainstorm", missionID, updatedBrainstorm);
}

export function ConfirmTeamDesign(missionID: string, updatedTeamDesign: any): Promise<any> {
    return ipc("MissionService.ConfirmTeamDesign", missionID, updatedTeamDesign);
}

export function ConfirmPhases(missionID: string, updatedPlan: any): Promise<void> {
    return ipc("MissionService.ConfirmPhases", missionID, updatedPlan);
}

export function StartMission(missionID: string): Promise<void> {
    return ipc("MissionService.StartMission", missionID);
}

export function PauseMission(missionID: string): Promise<void> {
    return ipc("MissionService.PauseMission", missionID);
}

export function ResumeMission(missionID: string): Promise<void> {
    return ipc("MissionService.ResumeMission", missionID);
}

export function AbortMission(missionID: string): Promise<void> {
    return ipc("MissionService.AbortMission", missionID);
}

export function SkipCurrentPhase(missionID: string): Promise<void> {
    return ipc("MissionService.SkipCurrentPhase", missionID);
}

export function GetMission(missionID: string): Promise<any> {
    return ipc("MissionService.GetMission", missionID);
}

export function ListMissions(): Promise<any[]> {
    return ipc("MissionService.ListMissions");
}

export function DeleteMission(missionID: string): Promise<void> {
    return ipc("MissionService.DeleteMission", missionID);
}

export function ListRoleTemplates(): Promise<any[]> {
    return ipc("MissionService.ListRoleTemplates");
}
