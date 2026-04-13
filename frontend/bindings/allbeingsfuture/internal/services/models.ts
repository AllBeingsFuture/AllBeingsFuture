// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { toByteSlice } from '../../../electron-api';

/**
 * Activity event types that map to task status changes.
 */
export enum ActivityEventType {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero = "",

    ActivityTaskComplete = "task_complete",
    ActivityError = "error",
    ActivityWaitingConfirmation = "waiting_confirmation",
};

/**
 * FileChangeListener 文件变更事件回调
 */
export type FileChangeListener = any;

/**
 * GitService manages all git operations with per-repo locking for concurrency safety.
 * All git operations on the same repository are serialized via promise-chain style locks.
 */
export class GitService {

    /** Creates a new GitService instance. */
    constructor($$source: Partial<GitService> = {}) {

        Object.assign(this, $$source);
    }

    /**
     * Creates a new GitService instance from a string or object.
     */
    static createFrom($$source: any = {}): GitService {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new GitService($$parsedSource as Partial<GitService>);
    }
}

/**
 * PTYCreateResult is the return value of Create.
 */
export class PTYCreateResult {
    "id": string;
    "shell": string;
    "error"?: string;

    /** Creates a new PTYCreateResult instance. */
    constructor($$source: Partial<PTYCreateResult> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("shell" in $$source)) {
            this["shell"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new PTYCreateResult instance from a string or object.
     */
    static createFrom($$source: any = {}): PTYCreateResult {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new PTYCreateResult($$parsedSource as Partial<PTYCreateResult>);
    }
}

/**
 * Platform 目标平台类型
 */
export enum Platform {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero = "",

    PlatformTelegram = "telegram",
};

/**
 * PreparedFile 经过校验的、可直接传给 Bot API 的文件对象
 */
export class PreparedFile {
    "data": string;
    "filename": string;
    "mimeType": string;
    "isImage": boolean;
    "sizeBytes": number;

    /** Creates a new PreparedFile instance. */
    constructor($$source: Partial<PreparedFile> = {}) {
        if (!("data" in $$source)) {
            this["data"] = "";
        }
        if (!("filename" in $$source)) {
            this["filename"] = "";
        }
        if (!("mimeType" in $$source)) {
            this["mimeType"] = "";
        }
        if (!("isImage" in $$source)) {
            this["isImage"] = false;
        }
        if (!("sizeBytes" in $$source)) {
            this["sizeBytes"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new PreparedFile instance from a string or object.
     */
    static createFrom($$source: any = {}): PreparedFile {
        const $$createField0_0 = toByteSlice;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("data" in $$parsedSource) {
            $$parsedSource["data"] = $$createField0_0($$parsedSource["data"]);
        }
        return new PreparedFile($$parsedSource as Partial<PreparedFile>);
    }
}

/**
 * ShellDef describes an available shell.
 */
export class ShellDef {
    "id": string;
    "name": string;
    "path": string;

    /** Creates a new ShellDef instance. */
    constructor($$source: Partial<ShellDef> = {}) {
        if (!("id" in $$source)) {
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            this["name"] = "";
        }
        if (!("path" in $$source)) {
            this["path"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ShellDef instance from a string or object.
     */
    static createFrom($$source: any = {}): ShellDef {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ShellDef($$parsedSource as Partial<ShellDef>);
    }
}

/**
 * TaskUpdateCallback is called when a task status is updated by the coordinator.
 */
export type TaskUpdateCallback = any;

/**
 * bridgeCommand is a command sent to the bridge via stdin NDJSON.
 * bridgeImage is a base64-encoded image attachment for multimodal messages.
 */
export class bridgeImage {
    "data": string;
    "mimeType": string;

    /** Creates a new bridgeImage instance. */
    constructor($$source: Partial<bridgeImage> = {}) {
        if (!("data" in $$source)) {
            this["data"] = "";
        }
        if (!("mimeType" in $$source)) {
            this["mimeType"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new bridgeImage instance from a string or object.
     */
    static createFrom($$source: any = {}): bridgeImage {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new bridgeImage($$parsedSource as Partial<bridgeImage>);
    }
}
