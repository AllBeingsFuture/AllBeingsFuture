// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { createArray, createNullable, createMap, identity } from '../../../electron-api';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as time$0 from "../../../time/models.js";

/**
 * ExecutionStatus represents the overall workflow execution state.
 */
export enum ExecutionStatus {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero = "",

    ExecPending = "pending",
    ExecRunning = "running",
    ExecPaused = "paused",
    ExecCompleted = "completed",
    ExecFailed = "failed",
    ExecCancelled = "cancelled",
};

/**
 * SessionManager abstracts session lifecycle operations needed by the orchestrator.
 */
export type SessionManager = any;

/**
 * StepOutput captures the result of a completed step.
 */
export class StepOutput {
    "sessionId"?: string;
    "exitCode"?: number | null;
    "extractedVars"?: { [_ in string]?: string };
    "error"?: string;
    "completedAt"?: string;

    /** Creates a new StepOutput instance. */
    constructor($$source: Partial<StepOutput> = {}) {

        Object.assign(this, $$source);
    }

    /**
     * Creates a new StepOutput instance from a string or object.
     */
    static createFrom($$source: any = {}): StepOutput {
        const $$createField2_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("extractedVars" in $$parsedSource) {
            $$parsedSource["extractedVars"] = $$createField2_0($$parsedSource["extractedVars"]);
        }
        return new StepOutput($$parsedSource as Partial<StepOutput>);
    }
}

/**
 * StepStatus represents the execution state of a single step.
 */
export enum StepStatus {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero = "",

    StepPending = "pending",
    StepWaitingDeps = "waiting_deps",
    StepReady = "ready",
    StepRunning = "running",
    StepWaitingReview = "waiting_review",
    StepCompleted = "completed",
    StepFailed = "failed",
    StepSkipped = "skipped",
    StepCancelled = "cancelled",
};

/**
 * WorkflowExecution is a running instance of a workflow definition.
 */
export class WorkflowExecution {
    "id": string;
    "workflowId": string;
    "status": ExecutionStatus;
    "variables": { [_ in string]?: string };
    "stepStatuses": { [_ in string]?: StepStatus };
    "stepOutputs": { [_ in string]?: StepOutput };
    "error"?: string;
    "startedAt": time$0.Time;
    "completedAt"?: time$0.Time | null;

    /** Creates a new WorkflowExecution instance. */
    constructor($$source: Partial<WorkflowExecution> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("workflowId" in $$source)) {
            this["workflowId"] = "";
        }
        if (!("status" in $$source)) {
            this["status"] = ExecutionStatus.$zero;
        }
        if (!("variables" in $$source)) {
            this["variables"] = {};
        }
        if (!("stepStatuses" in $$source)) {
            this["stepStatuses"] = {};
        }
        if (!("stepOutputs" in $$source)) {
            this["stepOutputs"] = {};
        }
        if (!("startedAt" in $$source)) {
            this["startedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorkflowExecution instance from a string or object.
     */
    static createFrom($$source: any = {}): WorkflowExecution {
        const $$createField3_0 = $$createType0;
        const $$createField4_0 = $$createType1;
        const $$createField5_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("variables" in $$parsedSource) {
            $$parsedSource["variables"] = $$createField3_0($$parsedSource["variables"]);
        }
        if ("stepStatuses" in $$parsedSource) {
            $$parsedSource["stepStatuses"] = $$createField4_0($$parsedSource["stepStatuses"]);
        }
        if ("stepOutputs" in $$parsedSource) {
            $$parsedSource["stepOutputs"] = $$createField5_0($$parsedSource["stepOutputs"]);
        }
        return new WorkflowExecution($$parsedSource as Partial<WorkflowExecution>);
    }
}

// Private type creation functions
const $$createType0 = createMap(identity, identity);
const $$createType1 = createMap(identity, identity);
const $$createType2 = StepOutput.createFrom;
const $$createType3 = createMap(identity, $$createType2);
