// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { createArray, createNullable, createMap, identity } from '../../../electron-api';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as time$0 from "../../../time/models.js";

/**
 * AutoRole is an automatically assigned role for a phase.
 */
export class AutoRole {
    "roleName": string;
    "displayName": string;
    "reason": string;
    "suggestedProvider": string;
    "providerReason": string;
    "systemPrompt": string;
    "capabilities": string[];

    /** Creates a new AutoRole instance. */
    constructor($$source: Partial<AutoRole> = {}) {
        if (!("roleName" in $$source)) {
            this["roleName"] = "";
        }
        if (!("displayName" in $$source)) {
            this["displayName"] = "";
        }
        if (!("reason" in $$source)) {
            this["reason"] = "";
        }
        if (!("suggestedProvider" in $$source)) {
            this["suggestedProvider"] = "";
        }
        if (!("providerReason" in $$source)) {
            this["providerReason"] = "";
        }
        if (!("systemPrompt" in $$source)) {
            this["systemPrompt"] = "";
        }
        if (!("capabilities" in $$source)) {
            this["capabilities"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AutoRole instance from a string or object.
     */
    static createFrom($$source: any = {}): AutoRole {
        const $$createField6_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("capabilities" in $$parsedSource) {
            $$parsedSource["capabilities"] = $$createField6_0($$parsedSource["capabilities"]);
        }
        return new AutoRole($$parsedSource as Partial<AutoRole>);
    }
}

/**
 * BrainstormResult is the AI brainstorm analysis output.
 */
export class BrainstormResult {
    "analysis": string;

    /**
     * simple | medium | complex
     */
    "estimatedComplexity": string;
    "suggestedApproach": string;
    "techStack": string[];
    "modules": ModuleAnalysis[];
    "risks": string[];
    "keyDecisions": string[];

    /** Creates a new BrainstormResult instance. */
    constructor($$source: Partial<BrainstormResult> = {}) {
        if (!("analysis" in $$source)) {
            this["analysis"] = "";
        }
        if (!("estimatedComplexity" in $$source)) {
            this["estimatedComplexity"] = "";
        }
        if (!("suggestedApproach" in $$source)) {
            this["suggestedApproach"] = "";
        }
        if (!("techStack" in $$source)) {
            this["techStack"] = [];
        }
        if (!("modules" in $$source)) {
            this["modules"] = [];
        }
        if (!("risks" in $$source)) {
            this["risks"] = [];
        }
        if (!("keyDecisions" in $$source)) {
            this["keyDecisions"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new BrainstormResult instance from a string or object.
     */
    static createFrom($$source: any = {}): BrainstormResult {
        const $$createField3_0 = $$createType0;
        const $$createField4_0 = $$createType2;
        const $$createField5_0 = $$createType0;
        const $$createField6_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("techStack" in $$parsedSource) {
            $$parsedSource["techStack"] = $$createField3_0($$parsedSource["techStack"]);
        }
        if ("modules" in $$parsedSource) {
            $$parsedSource["modules"] = $$createField4_0($$parsedSource["modules"]);
        }
        if ("risks" in $$parsedSource) {
            $$parsedSource["risks"] = $$createField5_0($$parsedSource["risks"]);
        }
        if ("keyDecisions" in $$parsedSource) {
            $$parsedSource["keyDecisions"] = $$createField6_0($$parsedSource["keyDecisions"]);
        }
        return new BrainstormResult($$parsedSource as Partial<BrainstormResult>);
    }
}

/**
 * Mission is the top-level entity stored in the database.
 */
export class Mission {
    "id": string;
    "goal": string;
    "analysis"?: string;
    "status": MissionStatus;
    "brainstorm"?: BrainstormResult | null;
    "teamDesign"?: TeamDesign | null;
    "plan"?: MissionPlan | null;
    "currentPhaseId"?: string;
    "workingDirectory": string;
    "constraints"?: string[];
    "createdAt": time$0.Time;
    "updatedAt"?: time$0.Time | null;
    "completedAt"?: time$0.Time | null;

    /** Creates a new Mission instance. */
    constructor($$source: Partial<Mission> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("goal" in $$source)) {
            this["goal"] = "";
        }
        if (!("status" in $$source)) {
            this["status"] = MissionStatus.$zero;
        }
        if (!("workingDirectory" in $$source)) {
            this["workingDirectory"] = "";
        }
        if (!("createdAt" in $$source)) {
            this["createdAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Mission instance from a string or object.
     */
    static createFrom($$source: any = {}): Mission {
        const $$createField4_0 = $$createType4;
        const $$createField5_0 = $$createType6;
        const $$createField6_0 = $$createType8;
        const $$createField9_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("brainstorm" in $$parsedSource) {
            $$parsedSource["brainstorm"] = $$createField4_0($$parsedSource["brainstorm"]);
        }
        if ("teamDesign" in $$parsedSource) {
            $$parsedSource["teamDesign"] = $$createField5_0($$parsedSource["teamDesign"]);
        }
        if ("plan" in $$parsedSource) {
            $$parsedSource["plan"] = $$createField6_0($$parsedSource["plan"]);
        }
        if ("constraints" in $$parsedSource) {
            $$parsedSource["constraints"] = $$createField9_0($$parsedSource["constraints"]);
        }
        return new Mission($$parsedSource as Partial<Mission>);
    }
}

/**
 * MissionInput is the user-provided input to create a mission.
 */
export class MissionInput {
    "goal": string;
    "workingDirectory": string;
    "constraints"?: string[];
    "preferences"?: MissionPrefs | null;

    /** Creates a new MissionInput instance. */
    constructor($$source: Partial<MissionInput> = {}) {
        if (!("goal" in $$source)) {
            this["goal"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            this["workingDirectory"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MissionInput instance from a string or object.
     */
    static createFrom($$source: any = {}): MissionInput {
        const $$createField2_0 = $$createType0;
        const $$createField3_0 = $$createType10;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("constraints" in $$parsedSource) {
            $$parsedSource["constraints"] = $$createField2_0($$parsedSource["constraints"]);
        }
        if ("preferences" in $$parsedSource) {
            $$parsedSource["preferences"] = $$createField3_0($$parsedSource["preferences"]);
        }
        return new MissionInput($$parsedSource as Partial<MissionInput>);
    }
}

/**
 * MissionPhase defines a single phase of execution.
 */
export class MissionPhase {
    "id": string;
    "name": string;
    "description": string;
    "order": number;
    "roles": AutoRole[];
    "dependencies": string[];
    "exitCriteria": string;

    /**
     * light | moderate | heavy
     */
    "estimatedEffort": string;

    /** Creates a new MissionPhase instance. */
    constructor($$source: Partial<MissionPhase> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            this["description"] = "";
        }
        if (!("order" in $$source)) {
            this["order"] = 0;
        }
        if (!("roles" in $$source)) {
            this["roles"] = [];
        }
        if (!("dependencies" in $$source)) {
            this["dependencies"] = [];
        }
        if (!("exitCriteria" in $$source)) {
            this["exitCriteria"] = "";
        }
        if (!("estimatedEffort" in $$source)) {
            this["estimatedEffort"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MissionPhase instance from a string or object.
     */
    static createFrom($$source: any = {}): MissionPhase {
        const $$createField4_0 = $$createType12;
        const $$createField5_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("roles" in $$parsedSource) {
            $$parsedSource["roles"] = $$createField4_0($$parsedSource["roles"]);
        }
        if ("dependencies" in $$parsedSource) {
            $$parsedSource["dependencies"] = $$createField5_0($$parsedSource["dependencies"]);
        }
        return new MissionPhase($$parsedSource as Partial<MissionPhase>);
    }
}

/**
 * MissionPlan is the full execution plan for a mission.
 */
export class MissionPlan {
    "missionId": string;
    "goal": string;
    "analysis": string;
    "estimatedComplexity": string;
    "phases": MissionPhase[];
    "suggestedApproach": string;

    /** Creates a new MissionPlan instance. */
    constructor($$source: Partial<MissionPlan> = {}) {
        if (!("missionId" in $$source)) {
            this["missionId"] = "";
        }
        if (!("goal" in $$source)) {
            this["goal"] = "";
        }
        if (!("analysis" in $$source)) {
            this["analysis"] = "";
        }
        if (!("estimatedComplexity" in $$source)) {
            this["estimatedComplexity"] = "";
        }
        if (!("phases" in $$source)) {
            this["phases"] = [];
        }
        if (!("suggestedApproach" in $$source)) {
            this["suggestedApproach"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MissionPlan instance from a string or object.
     */
    static createFrom($$source: any = {}): MissionPlan {
        const $$createField4_0 = $$createType14;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("phases" in $$parsedSource) {
            $$parsedSource["phases"] = $$createField4_0($$parsedSource["phases"]);
        }
        return new MissionPlan($$parsedSource as Partial<MissionPlan>);
    }
}

/**
 * MissionPrefs holds optional user preferences for mission planning.
 */
export class MissionPrefs {
    "maxMembers"?: number;
    "preferredProviders"?: string[];
    "skipPhases"?: string[];

    /** Creates a new MissionPrefs instance. */
    constructor($$source: Partial<MissionPrefs> = {}) {

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MissionPrefs instance from a string or object.
     */
    static createFrom($$source: any = {}): MissionPrefs {
        const $$createField1_0 = $$createType0;
        const $$createField2_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("preferredProviders" in $$parsedSource) {
            $$parsedSource["preferredProviders"] = $$createField1_0($$parsedSource["preferredProviders"]);
        }
        if ("skipPhases" in $$parsedSource) {
            $$parsedSource["skipPhases"] = $$createField2_0($$parsedSource["skipPhases"]);
        }
        return new MissionPrefs($$parsedSource as Partial<MissionPrefs>);
    }
}

/**
 * MissionStatus represents the multi-step state machine for a mission.
 */
export enum MissionStatus {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero = "",

    MissionPlanning = "planning",
    MissionBrainstormed = "brainstormed",
    MissionTeamDesigning = "team_designing",
    MissionTeamDesigned = "team_designed",
    MissionPhasePlanning = "phase_planning",
    MissionPhasesPlanned = "phases_planned",
    MissionConfirmed = "confirmed",
    MissionRunning = "running",
    MissionPaused = "paused",
    MissionCompleted = "completed",
    MissionAborted = "aborted",
};

/**
 * MissionSummary is a lightweight view for listing missions.
 */
export class MissionSummary {
    "id": string;
    "goal": string;
    "status": MissionStatus;
    "phaseCount": number;
    "completedPhases": number;
    "currentPhaseName"?: string;
    "createdAt": time$0.Time;

    /** Creates a new MissionSummary instance. */
    constructor($$source: Partial<MissionSummary> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("goal" in $$source)) {
            this["goal"] = "";
        }
        if (!("status" in $$source)) {
            this["status"] = MissionStatus.$zero;
        }
        if (!("phaseCount" in $$source)) {
            this["phaseCount"] = 0;
        }
        if (!("completedPhases" in $$source)) {
            this["completedPhases"] = 0;
        }
        if (!("createdAt" in $$source)) {
            this["createdAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MissionSummary instance from a string or object.
     */
    static createFrom($$source: any = {}): MissionSummary {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new MissionSummary($$parsedSource as Partial<MissionSummary>);
    }
}

/**
 * ModuleAnalysis describes a single identified module.
 */
export class ModuleAnalysis {
    "name": string;
    "description": string;
    "dependencies": string[];

    /**
     * low | medium | high
     */
    "complexity": string;
    "relatedPaths"?: string[];

    /** Creates a new ModuleAnalysis instance. */
    constructor($$source: Partial<ModuleAnalysis> = {}) {
        if (!("name" in $$source)) {
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            this["description"] = "";
        }
        if (!("dependencies" in $$source)) {
            this["dependencies"] = [];
        }
        if (!("complexity" in $$source)) {
            this["complexity"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ModuleAnalysis instance from a string or object.
     */
    static createFrom($$source: any = {}): ModuleAnalysis {
        const $$createField2_0 = $$createType0;
        const $$createField4_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("dependencies" in $$parsedSource) {
            $$parsedSource["dependencies"] = $$createField2_0($$parsedSource["dependencies"]);
        }
        if ("relatedPaths" in $$parsedSource) {
            $$parsedSource["relatedPaths"] = $$createField4_0($$parsedSource["relatedPaths"]);
        }
        return new ModuleAnalysis($$parsedSource as Partial<ModuleAnalysis>);
    }
}

/**
 * RoleTemplate defines a reusable role template for the planner.
 */
export class RoleTemplate {
    "id": string;
    "name": string;
    "nameEn": string;
    "description": string;

    /**
     * analysis | design | implementation | verification | documentation
     */
    "category": string;
    "bestProviders": string[];
    "defaultPrompt": string;
    "applicablePhases": string[];
    "capabilities": string[];

    /** Creates a new RoleTemplate instance. */
    constructor($$source: Partial<RoleTemplate> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            this["name"] = "";
        }
        if (!("nameEn" in $$source)) {
            this["nameEn"] = "";
        }
        if (!("description" in $$source)) {
            this["description"] = "";
        }
        if (!("category" in $$source)) {
            this["category"] = "";
        }
        if (!("bestProviders" in $$source)) {
            this["bestProviders"] = [];
        }
        if (!("defaultPrompt" in $$source)) {
            this["defaultPrompt"] = "";
        }
        if (!("applicablePhases" in $$source)) {
            this["applicablePhases"] = [];
        }
        if (!("capabilities" in $$source)) {
            this["capabilities"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new RoleTemplate instance from a string or object.
     */
    static createFrom($$source: any = {}): RoleTemplate {
        const $$createField5_0 = $$createType0;
        const $$createField7_0 = $$createType0;
        const $$createField8_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("bestProviders" in $$parsedSource) {
            $$parsedSource["bestProviders"] = $$createField5_0($$parsedSource["bestProviders"]);
        }
        if ("applicablePhases" in $$parsedSource) {
            $$parsedSource["applicablePhases"] = $$createField7_0($$parsedSource["applicablePhases"]);
        }
        if ("capabilities" in $$parsedSource) {
            $$parsedSource["capabilities"] = $$createField8_0($$parsedSource["capabilities"]);
        }
        return new RoleTemplate($$parsedSource as Partial<RoleTemplate>);
    }
}

/**
 * TeamDesign is the AI-generated team composition.
 */
export class TeamDesign {
    "rationale": string;
    "members": TeamMemberDesign[];
    "collaborationNotes": string;

    /** Creates a new TeamDesign instance. */
    constructor($$source: Partial<TeamDesign> = {}) {
        if (!("rationale" in $$source)) {
            this["rationale"] = "";
        }
        if (!("members" in $$source)) {
            this["members"] = [];
        }
        if (!("collaborationNotes" in $$source)) {
            this["collaborationNotes"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamDesign instance from a string or object.
     */
    static createFrom($$source: any = {}): TeamDesign {
        const $$createField1_0 = $$createType16;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("members" in $$parsedSource) {
            $$parsedSource["members"] = $$createField1_0($$parsedSource["members"]);
        }
        return new TeamDesign($$parsedSource as Partial<TeamDesign>);
    }
}

/**
 * TeamMemberDesign describes a single team member.
 */
export class TeamMemberDesign {
    "roleName": string;
    "displayName": string;
    "responsibilities": string[];
    "boundaries": string[];
    "suggestedProvider": string;
    "providerReason": string;
    "systemPrompt": string;
    "capabilities": string[];

    /** Creates a new TeamMemberDesign instance. */
    constructor($$source: Partial<TeamMemberDesign> = {}) {
        if (!("roleName" in $$source)) {
            this["roleName"] = "";
        }
        if (!("displayName" in $$source)) {
            this["displayName"] = "";
        }
        if (!("responsibilities" in $$source)) {
            this["responsibilities"] = [];
        }
        if (!("boundaries" in $$source)) {
            this["boundaries"] = [];
        }
        if (!("suggestedProvider" in $$source)) {
            this["suggestedProvider"] = "";
        }
        if (!("providerReason" in $$source)) {
            this["providerReason"] = "";
        }
        if (!("systemPrompt" in $$source)) {
            this["systemPrompt"] = "";
        }
        if (!("capabilities" in $$source)) {
            this["capabilities"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamMemberDesign instance from a string or object.
     */
    static createFrom($$source: any = {}): TeamMemberDesign {
        const $$createField2_0 = $$createType0;
        const $$createField3_0 = $$createType0;
        const $$createField7_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("responsibilities" in $$parsedSource) {
            $$parsedSource["responsibilities"] = $$createField2_0($$parsedSource["responsibilities"]);
        }
        if ("boundaries" in $$parsedSource) {
            $$parsedSource["boundaries"] = $$createField3_0($$parsedSource["boundaries"]);
        }
        if ("capabilities" in $$parsedSource) {
            $$parsedSource["capabilities"] = $$createField7_0($$parsedSource["capabilities"]);
        }
        return new TeamMemberDesign($$parsedSource as Partial<TeamMemberDesign>);
    }
}

// Private type creation functions
const $$createType0 = createArray(identity);
const $$createType1 = ModuleAnalysis.createFrom;
const $$createType2 = createArray($$createType1);
const $$createType3 = BrainstormResult.createFrom;
const $$createType4 = createNullable($$createType3);
const $$createType5 = TeamDesign.createFrom;
const $$createType6 = createNullable($$createType5);
const $$createType7 = MissionPlan.createFrom;
const $$createType8 = createNullable($$createType7);
const $$createType9 = MissionPrefs.createFrom;
const $$createType10 = createNullable($$createType9);
const $$createType11 = AutoRole.createFrom;
const $$createType12 = createArray($$createType11);
const $$createType13 = MissionPhase.createFrom;
const $$createType14 = createArray($$createType13);
const $$createType15 = TeamMemberDesign.createFrom;
const $$createType16 = createArray($$createType15);
