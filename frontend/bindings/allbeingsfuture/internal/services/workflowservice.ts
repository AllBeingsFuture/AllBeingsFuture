import { ipc } from '../../../electron-api'

export function CreateWorkflow(name: string, description: string, definitionJSON: string): Promise<any> {
    return ipc("WorkflowService.CreateWorkflow", name, description, definitionJSON)
}

export function GetAllWorkflows(): Promise<any[]> {
    return ipc("WorkflowService.GetAllWorkflows")
}

export function GetWorkflowByID(id: string): Promise<any> {
    return ipc("WorkflowService.GetWorkflowByID", id)
}

export function UpdateWorkflow(id: string, name: string, description: string, definitionJSON: string): Promise<void> {
    return ipc("WorkflowService.UpdateWorkflow", id, name, description, definitionJSON)
}

export function DeleteWorkflow(id: string): Promise<void> {
    return ipc("WorkflowService.DeleteWorkflow", id)
}

export function StartWorkflow(workflowID: string, variablesJSON: string): Promise<any> {
    return ipc("WorkflowService.StartWorkflow", workflowID, variablesJSON)
}

export function StopWorkflow(executionID: string): Promise<void> {
    return ipc("WorkflowService.StopWorkflow", executionID)
}

export function ApproveStep(executionID: string, stepID: string, approved: boolean): Promise<void> {
    return ipc("WorkflowService.ApproveStep", executionID, stepID, approved)
}

export function GetWorkflowStatus(executionID: string): Promise<any> {
    return ipc("WorkflowService.GetWorkflowStatus", executionID)
}

export function GetActiveWorkflows(): Promise<any[]> {
    return ipc("WorkflowService.GetActiveWorkflows")
}

export function GetExecutionHistory(limit: number): Promise<any[]> {
    return ipc("WorkflowService.GetExecutionHistory", limit)
}
