// @ts-check

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { createArray, createNullable, createMap, identity } from '../../../electron-api';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as time$0 from "../../../time/models.js";

export class AIProvider {
    /**
     * Creates a new AIProvider instance.
     * @param {Partial<AIProvider>} [$$source = {}] - The source object to create the AIProvider.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("command" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["command"] = "";
        }
        if (!("isBuiltin" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isBuiltin"] = false;
        }
        if (!("adapterType" in $$source)) {
            /**
             * @member
             * @type {AdapterType}
             */
            this["adapterType"] = AdapterType.$zero;
        }
        if (!("envOverrides" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["envOverrides"] = "";
        }
        if (!("executablePath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["executablePath"] = "";
        }
        if (!("nodeVersion" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["nodeVersion"] = "";
        }
        if (!("autoAcceptFlag" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["autoAcceptFlag"] = "";
        }
        if (!("resumeFlag" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["resumeFlag"] = "";
        }
        if (!("defaultArgs" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["defaultArgs"] = "";
        }
        if (!("autoAcceptArg" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["autoAcceptArg"] = "";
        }
        if (!("resumeArg" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["resumeArg"] = "";
        }
        if (!("sessionIdDetection" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionIdDetection"] = "";
        }
        if (!("resumeFormat" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["resumeFormat"] = "";
        }
        if (!("sessionIdPattern" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionIdPattern"] = "";
        }
        if (!("gitBashPath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["gitBashPath"] = "";
        }
        if (!("defaultModel" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["defaultModel"] = "";
        }
        if (!("maxOutputTokens" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxOutputTokens"] = 0;
        }
        if (!("reasoningEffort" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["reasoningEffort"] = "";
        }
        if (!("preferResponsesApi" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["preferResponsesApi"] = false;
        }
        if (!("sortOrder" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["sortOrder"] = 0;
        }
        if (!("isEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isEnabled"] = false;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["updatedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AIProvider instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {AIProvider}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new AIProvider(/** @type {Partial<AIProvider>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const AdapterType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    AdapterClaudeSDK: "claude-sdk",
    AdapterCodex: "codex-appserver",
    AdapterGemini: "gemini-headless",
    AdapterOpenCode: "opencode-sdk",
    AdapterOpenAIAPI: "openai-api",
};

export class AppSettings {
    /**
     * Creates a new AppSettings instance.
     * @param {Partial<AppSettings>} [$$source = {}] - The source object to create the AppSettings.
     */
    constructor($$source = {}) {
        if (!("proxyType" in $$source)) {
            /**
             * @member
             * @type {ProxyType}
             */
            this["proxyType"] = ProxyType.$zero;
        }
        if (!("proxyHost" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["proxyHost"] = "";
        }
        if (!("proxyPort" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["proxyPort"] = "";
        }
        if (!("proxyUsername" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["proxyUsername"] = "";
        }
        if (!("proxyPassword" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["proxyPassword"] = "";
        }
        if (!("voiceTranscriptionMode" in $$source)) {
            /**
             * @member
             * @type {VoiceTranscriptionMode}
             */
            this["voiceTranscriptionMode"] = VoiceTranscriptionMode.$zero;
        }
        if (!("voiceTranscriptionProviderId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["voiceTranscriptionProviderId"] = "";
        }
        if (!("autoWorktree" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoWorktree"] = false;
        }
        if (!("alwaysReplyInChinese" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["alwaysReplyInChinese"] = false;
        }
        if (!("autoLaunch" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoLaunch"] = false;
        }
        if (!("notificationEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["notificationEnabled"] = false;
        }
        if (!("fontSize" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["fontSize"] = 0;
        }
        if (!("theme" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["theme"] = "";
        }
        if (!("appSettingsVersion" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["appSettingsVersion"] = "";
        }
        if (!("defaultSessionMode" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["defaultSessionMode"] = "";
        }
        if (!("telegramBotToken" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramBotToken"] = "";
        }
        if (!("telegramAllowedChatIds" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramAllowedChatIds"] = "";
        }
        if (!("telegramWebhookUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramWebhookUrl"] = "";
        }
        if (!("telegramWebhookSecret" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramWebhookSecret"] = "";
        }
        if (!("telegramEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["telegramEnabled"] = false;
        }
        if (!("telegramMode" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramMode"] = "";
        }
        if (!("telegramAllowedUserIds" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramAllowedUserIds"] = "";
        }
        if (!("telegramCommandPrefix" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["telegramCommandPrefix"] = "";
        }
        if (!("telegramNotifyOnDone" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["telegramNotifyOnDone"] = false;
        }
        if (!("qqbotEnabled" in $$source)) {
            /**
             * QQ Bot (NapCatQQ / OneBot 11)
             * @member
             * @type {boolean}
             */
            this["qqbotEnabled"] = false;
        }
        if (!("qqbotHttpEndpoint" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotHttpEndpoint"] = "";
        }
        if (!("qqbotWsEndpoint" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotWsEndpoint"] = "";
        }
        if (!("qqbotAccessToken" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotAccessToken"] = "";
        }
        if (!("qqbotMode" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotMode"] = "";
        }
        if (!("qqbotAllowedUserIds" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotAllowedUserIds"] = "";
        }
        if (!("qqbotAllowedGroupIds" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotAllowedGroupIds"] = "";
        }
        if (!("qqbotCommandPrefix" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqbotCommandPrefix"] = "";
        }
        if (!("qqbotNotifyOnDone" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["qqbotNotifyOnDone"] = false;
        }
        if (!("qqofficialEnabled" in $$source)) {
            /**
             * QQ Official Bot (QQ 开放平台官方 API)
             * @member
             * @type {boolean}
             */
            this["qqofficialEnabled"] = false;
        }
        if (!("qqofficialAppId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqofficialAppId"] = "";
        }
        if (!("qqofficialAppSecret" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqofficialAppSecret"] = "";
        }
        if (!("qqofficialSandbox" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["qqofficialSandbox"] = false;
        }
        if (!("qqofficialCommandPrefix" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["qqofficialCommandPrefix"] = "";
        }
        if (!("qqofficialNotifyOnDone" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["qqofficialNotifyOnDone"] = false;
        }
        if (!("supervisorEnabled" in $$source)) {
            /**
             * Runtime Supervisor
             * @member
             * @type {boolean}
             */
            this["supervisorEnabled"] = false;
        }
        if (!("supervisorMaxTokens" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["supervisorMaxTokens"] = 0;
        }
        if (!("supervisorMaxIterations" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["supervisorMaxIterations"] = 0;
        }
        if (!("supervisorMaxToolCalls" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["supervisorMaxToolCalls"] = 0;
        }
        if (!("supervisorMaxDurationSeconds" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["supervisorMaxDurationSeconds"] = 0;
        }
        if (!("proactiveEnabled" in $$source)) {
            /**
             * Proactive Engine
             * @member
             * @type {boolean}
             */
            this["proactiveEnabled"] = false;
        }
        if (!("proactiveMaxDailyMessages" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["proactiveMaxDailyMessages"] = 0;
        }
        if (!("proactiveMinIntervalMinutes" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["proactiveMinIntervalMinutes"] = 0;
        }
        if (!("proactiveQuietHoursStart" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["proactiveQuietHoursStart"] = 0;
        }
        if (!("proactiveQuietHoursEnd" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["proactiveQuietHoursEnd"] = 0;
        }
        if (!("proactiveIdleThresholdHours" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["proactiveIdleThresholdHours"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AppSettings instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {AppSettings}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new AppSettings(/** @type {Partial<AppSettings>} */($$parsedSource));
    }
}

export class AuthConfig {
    /**
     * Creates a new AuthConfig instance.
     * @param {Partial<AuthConfig>} [$$source = {}] - The source object to create the AuthConfig.
     */
    constructor($$source = {}) {
        if (!("baseUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["baseUrl"] = "";
        }
        if (!("clientId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["clientId"] = "";
        }
        if (!("clientSecret" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["clientSecret"] = "";
        }
        if (!("jwtIssuer" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["jwtIssuer"] = "";
        }
        if (!("jwtSecret" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["jwtSecret"] = "";
        }
        if (!("accessTokenTTL" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["accessTokenTTL"] = 0;
        }
        if (!("refreshTokenTTL" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["refreshTokenTTL"] = 0;
        }
        if (!("allowAnonymous" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["allowAnonymous"] = false;
        }
        if (!("promotionMode" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["promotionMode"] = false;
        }
        if (!("apiKeyHeader" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["apiKeyHeader"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AuthConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {AuthConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new AuthConfig(/** @type {Partial<AuthConfig>} */($$parsedSource));
    }
}

export class AuthState {
    /**
     * Creates a new AuthState instance.
     * @param {Partial<AuthState>} [$$source = {}] - The source object to create the AuthState.
     */
    constructor($$source = {}) {
        if (!("accessToken" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["accessToken"] = "";
        }
        if (!("refreshToken" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["refreshToken"] = "";
        }
        if (!("tokenType" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["tokenType"] = "";
        }
        if (!("userId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["userId"] = "";
        }
        if (!("email" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["email"] = "";
        }
        if (!("displayName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["displayName"] = "";
        }
        if (!("expiresAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time | null}
             */
            this["expiresAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AuthState instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {AuthState}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new AuthState(/** @type {Partial<AuthState>} */($$parsedSource));
    }
}

export class BridgeConfig {
    /**
     * Creates a new BridgeConfig instance.
     * @param {Partial<BridgeConfig>} [$$source = {}] - The source object to create the BridgeConfig.
     */
    constructor($$source = {}) {
        if (!("host" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["host"] = "";
        }
        if (!("port" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["port"] = 0;
        }
        if (!("timeout" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timeout"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new BridgeConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {BridgeConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new BridgeConfig(/** @type {Partial<BridgeConfig>} */($$parsedSource));
    }
}

/**
 * BudgetAction 预算检查结果
 * @readonly
 * @enum {number}
 */
export const BudgetAction = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: 0,

    BudgetOK: 0,
    BudgetWarning: 1,
    BudgetDowngrade: 2,
    BudgetPause: 3,
};

/**
 * BudgetStatus 预算状态
 */
export class BudgetStatus {
    /**
     * Creates a new BudgetStatus instance.
     * @param {Partial<BudgetStatus>} [$$source = {}] - The source object to create the BudgetStatus.
     */
    constructor($$source = {}) {
        if (!("action" in $$source)) {
            /**
             * @member
             * @type {BudgetAction}
             */
            this["action"] = BudgetAction.$zero;
        }
        if (!("dimension" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["dimension"] = "";
        }
        if (!("usageRatio" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["usageRatio"] = 0;
        }
        if (!("message" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["message"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new BudgetStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {BudgetStatus}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new BudgetStatus(/** @type {Partial<BudgetStatus>} */($$parsedSource));
    }
}

export class ChatMessage {
    /**
     * Creates a new ChatMessage instance.
     * @param {Partial<ChatMessage>} [$$source = {}] - The source object to create the ChatMessage.
     */
    constructor($$source = {}) {
        if (!("role" in $$source)) {
            /**
             * "user", "assistant", "tool_use", or "thinking"
             * @member
             * @type {string}
             */
            this["role"] = "";
        }
        if (!("content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["content"] = "";
        }
        if (!("partial" in $$source)) {
            /**
             * true if assistant is still streaming
             * @member
             * @type {boolean}
             */
            this["partial"] = false;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["toolName"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {{ [_ in string]?: any } | undefined}
             */
            this["toolInput"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {boolean | undefined}
             */
            this["isThinking"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ChatMessage instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ChatMessage}
     */
    static createFrom($$source = {}) {
        const $$createField4_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("toolInput" in $$parsedSource) {
            $$parsedSource["toolInput"] = $$createField4_0($$parsedSource["toolInput"]);
        }
        return new ChatMessage(/** @type {Partial<ChatMessage>} */($$parsedSource));
    }
}

export class ChatState {
    /**
     * Creates a new ChatState instance.
     * @param {Partial<ChatState>} [$$source = {}] - The source object to create the ChatState.
     */
    constructor($$source = {}) {
        if (!("messages" in $$source)) {
            /**
             * @member
             * @type {ChatMessage[]}
             */
            this["messages"] = [];
        }
        if (!("streaming" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["streaming"] = false;
        }
        if (!("error" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["error"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ChatState instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ChatState}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType2;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("messages" in $$parsedSource) {
            $$parsedSource["messages"] = $$createField0_0($$parsedSource["messages"]);
        }
        return new ChatState(/** @type {Partial<ChatState>} */($$parsedSource));
    }
}

export class CreateWorktreeResult {
    /**
     * Creates a new CreateWorktreeResult instance.
     * @param {Partial<CreateWorktreeResult>} [$$source = {}] - The source object to create the CreateWorktreeResult.
     */
    constructor($$source = {}) {
        if (!("worktreePath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreePath"] = "";
        }
        if (!("branch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["branch"] = "";
        }
        if (!("baseCommit" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["baseCommit"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new CreateWorktreeResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {CreateWorktreeResult}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new CreateWorktreeResult(/** @type {Partial<CreateWorktreeResult>} */($$parsedSource));
    }
}

/**
 * FileChangeRecord 用于 RecordWorktreeChanges 的输入参数
 */
export class FileChangeRecord {
    /**
     * Creates a new FileChangeRecord instance.
     * @param {Partial<FileChangeRecord>} [$$source = {}] - The source object to create the FileChangeRecord.
     */
    constructor($$source = {}) {
        if (!("path" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["path"] = "";
        }
        if (!("changeType" in $$source)) {
            /**
             * @member
             * @type {FileChangeType}
             */
            this["changeType"] = FileChangeType.$zero;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new FileChangeRecord instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {FileChangeRecord}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new FileChangeRecord(/** @type {Partial<FileChangeRecord>} */($$parsedSource));
    }
}

/**
 * FileChangeType 文件变更类型
 * @readonly
 * @enum {string}
 */
export const FileChangeType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    FileChangeCreate: "create",
    FileChangeModify: "modify",
    FileChangeDelete: "delete",
};

export class FilewatchConfig {
    /**
     * Creates a new FilewatchConfig instance.
     * @param {Partial<FilewatchConfig>} [$$source = {}] - The source object to create the FilewatchConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("ignorePatterns" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["ignorePatterns"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new FilewatchConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {FilewatchConfig}
     */
    static createFrom($$source = {}) {
        const $$createField1_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("ignorePatterns" in $$parsedSource) {
            $$parsedSource["ignorePatterns"] = $$createField1_0($$parsedSource["ignorePatterns"]);
        }
        return new FilewatchConfig(/** @type {Partial<FilewatchConfig>} */($$parsedSource));
    }
}

/**
 * GitFileStatus represents a file with its git status code.
 */
export class GitFileStatus {
    /**
     * Creates a new GitFileStatus instance.
     * @param {Partial<GitFileStatus>} [$$source = {}] - The source object to create the GitFileStatus.
     */
    constructor($$source = {}) {
        if (!("path" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["path"] = "";
        }
        if (!("statusCode" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["statusCode"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new GitFileStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {GitFileStatus}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new GitFileStatus(/** @type {Partial<GitFileStatus>} */($$parsedSource));
    }
}

export class GitStatus {
    /**
     * Creates a new GitStatus instance.
     * @param {Partial<GitStatus>} [$$source = {}] - The source object to create the GitStatus.
     */
    constructor($$source = {}) {
        if (!("staged" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["staged"] = [];
        }
        if (!("unstaged" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["unstaged"] = [];
        }
        if (!("untracked" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["untracked"] = [];
        }
        if (!("branch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["branch"] = "";
        }
        if (!("ahead" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ahead"] = 0;
        }
        if (!("behind" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["behind"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new GitStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {GitStatus}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType3;
        const $$createField1_0 = $$createType3;
        const $$createField2_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("staged" in $$parsedSource) {
            $$parsedSource["staged"] = $$createField0_0($$parsedSource["staged"]);
        }
        if ("unstaged" in $$parsedSource) {
            $$parsedSource["unstaged"] = $$createField1_0($$parsedSource["unstaged"]);
        }
        if ("untracked" in $$parsedSource) {
            $$parsedSource["untracked"] = $$createField2_0($$parsedSource["untracked"]);
        }
        return new GitStatus(/** @type {Partial<GitStatus>} */($$parsedSource));
    }
}

/**
 * Intervention 干预指令
 */
export class Intervention {
    /**
     * Creates a new Intervention instance.
     * @param {Partial<Intervention>} [$$source = {}] - The source object to create the Intervention.
     */
    constructor($$source = {}) {
        if (!("level" in $$source)) {
            /**
             * @member
             * @type {InterventionLevel}
             */
            this["level"] = InterventionLevel.$zero;
        }
        if (!("pattern" in $$source)) {
            /**
             * @member
             * @type {PatternType}
             */
            this["pattern"] = PatternType.$zero;
        }
        if (!("message" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["message"] = "";
        }
        if (!("shouldInjectPrompt" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["shouldInjectPrompt"] = false;
        }
        if (!("shouldRollback" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["shouldRollback"] = false;
        }
        if (!("shouldTerminate" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["shouldTerminate"] = false;
        }
        if (!("shouldEscalate" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["shouldEscalate"] = false;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["promptInjection"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Intervention instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Intervention}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Intervention(/** @type {Partial<Intervention>} */($$parsedSource));
    }
}

/**
 * InterventionLevel 干预级别
 * @readonly
 * @enum {number}
 */
export const InterventionLevel = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: 0,

    InterventionNone: 0,
    InterventionNudge: 1,
    InterventionStrategySwitch: 2,
    InterventionModelSwitch: 3,
    InterventionEscalate: 4,
    InterventionTerminate: 5,
};

export class LogConfig {
    /**
     * Creates a new LogConfig instance.
     * @param {Partial<LogConfig>} [$$source = {}] - The source object to create the LogConfig.
     */
    constructor($$source = {}) {
        if (!("level" in $$source)) {
            /**
             * @member
             * @type {LogLevel}
             */
            this["level"] = LogLevel.$zero;
        }
        if (!("filePath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["filePath"] = "";
        }
        if (!("maxSizeMB" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxSizeMB"] = 0;
        }
        if (!("maxBackups" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxBackups"] = 0;
        }
        if (!("maxAgeDays" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxAgeDays"] = 0;
        }
        if (!("console" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["console"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new LogConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {LogConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new LogConfig(/** @type {Partial<LogConfig>} */($$parsedSource));
    }
}

/**
 * LogEntry represents a single commit in the log history.
 */
export class LogEntry {
    /**
     * Creates a new LogEntry instance.
     * @param {Partial<LogEntry>} [$$source = {}] - The source object to create the LogEntry.
     */
    constructor($$source = {}) {
        if (!("hash" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["hash"] = "";
        }
        if (!("shortHash" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["shortHash"] = "";
        }
        if (!("message" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["message"] = "";
        }
        if (!("author" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["author"] = "";
        }
        if (!("relativeDate" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["relativeDate"] = "";
        }
        if (!("refs" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["refs"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new LogEntry instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {LogEntry}
     */
    static createFrom($$source = {}) {
        const $$createField5_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("refs" in $$parsedSource) {
            $$parsedSource["refs"] = $$createField5_0($$parsedSource["refs"]);
        }
        return new LogEntry(/** @type {Partial<LogEntry>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const LogLevel = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    LogDebug: "debug",
    LogInfo: "info",
    LogWarn: "warn",
    LogError: "error",
};

export class MCPConfig {
    /**
     * Creates a new MCPConfig instance.
     * @param {Partial<MCPConfig>} [$$source = {}] - The source object to create the MCPConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("registryUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["registryUrl"] = "";
        }
        if (!("installDir" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["installDir"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MCPConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {MCPConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new MCPConfig(/** @type {Partial<MCPConfig>} */($$parsedSource));
    }
}

export class McpServer {
    /**
     * Creates a new McpServer instance.
     * @param {Partial<McpServer>} [$$source = {}] - The source object to create the McpServer.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("category" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["category"] = "";
        }
        if (!("transport" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["transport"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["command"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["args"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["url"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {{ [_ in string]?: string } | undefined}
             */
            this["headers"] = undefined;
        }
        if (!("compatibleProviders" in $$source)) {
            /**
             * @member
             * @type {any}
             */
            this["compatibleProviders"] = null;
        }
        if (!("fallbackMode" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["fallbackMode"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {any | undefined}
             */
            this["configSchema"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {{ [_ in string]?: any } | undefined}
             */
            this["userConfig"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {{ [_ in string]?: string } | undefined}
             */
            this["envVars"] = undefined;
        }
        if (!("isInstalled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isInstalled"] = false;
        }
        if (!("installMethod" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["installMethod"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["installCommand"] = undefined;
        }
        if (!("source" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["source"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["registryUrl"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["version"] = undefined;
        }
        if (!("isGlobalEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isGlobalEnabled"] = false;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["enabledForProviders"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["tags"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["author"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["homepage"] = undefined;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["createdAt"] = "";
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["updatedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new McpServer instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {McpServer}
     */
    static createFrom($$source = {}) {
        const $$createField6_0 = $$createType3;
        const $$createField8_0 = $$createType4;
        const $$createField12_0 = $$createType0;
        const $$createField13_0 = $$createType4;
        const $$createField21_0 = $$createType3;
        const $$createField22_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("args" in $$parsedSource) {
            $$parsedSource["args"] = $$createField6_0($$parsedSource["args"]);
        }
        if ("headers" in $$parsedSource) {
            $$parsedSource["headers"] = $$createField8_0($$parsedSource["headers"]);
        }
        if ("userConfig" in $$parsedSource) {
            $$parsedSource["userConfig"] = $$createField12_0($$parsedSource["userConfig"]);
        }
        if ("envVars" in $$parsedSource) {
            $$parsedSource["envVars"] = $$createField13_0($$parsedSource["envVars"]);
        }
        if ("enabledForProviders" in $$parsedSource) {
            $$parsedSource["enabledForProviders"] = $$createField21_0($$parsedSource["enabledForProviders"]);
        }
        if ("tags" in $$parsedSource) {
            $$parsedSource["tags"] = $$createField22_0($$parsedSource["tags"]);
        }
        return new McpServer(/** @type {Partial<McpServer>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const MemberStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    MemberPending: "pending",
    MemberStarting: "starting",
    MemberRunning: "running",
    MemberIdle: "idle",
    MemberCompleted: "completed",
    MemberFailed: "failed",
};

/**
 * MergeCheckResult represents the result of a merge conflict check (dry-run).
 */
export class MergeCheckResult {
    /**
     * Creates a new MergeCheckResult instance.
     * @param {Partial<MergeCheckResult>} [$$source = {}] - The source object to create the MergeCheckResult.
     */
    constructor($$source = {}) {
        if (!("mainBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mainBranch"] = "";
        }
        if (!("mainAheadCount" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["mainAheadCount"] = 0;
        }
        if (!("conflictingFiles" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["conflictingFiles"] = [];
        }
        if (!("canMerge" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["canMerge"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MergeCheckResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {MergeCheckResult}
     */
    static createFrom($$source = {}) {
        const $$createField2_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("conflictingFiles" in $$parsedSource) {
            $$parsedSource["conflictingFiles"] = $$createField2_0($$parsedSource["conflictingFiles"]);
        }
        return new MergeCheckResult(/** @type {Partial<MergeCheckResult>} */($$parsedSource));
    }
}

export class MergeResult {
    /**
     * Creates a new MergeResult instance.
     * @param {Partial<MergeResult>} [$$source = {}] - The source object to create the MergeResult.
     */
    constructor($$source = {}) {
        if (!("success" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["success"] = false;
        }
        if (!("mergedBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mergedBranch"] = "";
        }
        if (!("targetBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["targetBranch"] = "";
        }
        if (!("hasConflicts" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["hasConflicts"] = false;
        }
        if (!("conflictFiles" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["conflictFiles"] = [];
        }
        if (!("autoResolved" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoResolved"] = false;
        }
        if (!("message" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["message"] = "";
        }
        if (!("linesAdded" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["linesAdded"] = 0;
        }
        if (!("linesRemoved" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["linesRemoved"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new MergeResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {MergeResult}
     */
    static createFrom($$source = {}) {
        const $$createField4_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("conflictFiles" in $$parsedSource) {
            $$parsedSource["conflictFiles"] = $$createField4_0($$parsedSource["conflictFiles"]);
        }
        return new MergeResult(/** @type {Partial<MergeResult>} */($$parsedSource));
    }
}

export class NotificationConfig {
    /**
     * Creates a new NotificationConfig instance.
     * @param {Partial<NotificationConfig>} [$$source = {}] - The source object to create the NotificationConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("sound" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sound"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new NotificationConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {NotificationConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new NotificationConfig(/** @type {Partial<NotificationConfig>} */($$parsedSource));
    }
}

export class OrchestrationConfig {
    /**
     * Creates a new OrchestrationConfig instance.
     * @param {Partial<OrchestrationConfig>} [$$source = {}] - The source object to create the OrchestrationConfig.
     */
    constructor($$source = {}) {
        if (!("steps" in $$source)) {
            /**
             * @member
             * @type {OrchestrationStep[]}
             */
            this["steps"] = [];
        }
        if (!("mergeStrategy" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mergeStrategy"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["outputFormat"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new OrchestrationConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {OrchestrationConfig}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType6;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("steps" in $$parsedSource) {
            $$parsedSource["steps"] = $$createField0_0($$parsedSource["steps"]);
        }
        return new OrchestrationConfig(/** @type {Partial<OrchestrationConfig>} */($$parsedSource));
    }
}

export class OrchestrationStep {
    /**
     * Creates a new OrchestrationStep instance.
     * @param {Partial<OrchestrationStep>} [$$source = {}] - The source object to create the OrchestrationStep.
     */
    constructor($$source = {}) {
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }
        if (!("promptTemplate" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["promptTemplate"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new OrchestrationStep instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {OrchestrationStep}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new OrchestrationStep(/** @type {Partial<OrchestrationStep>} */($$parsedSource));
    }
}

/**
 * PatternType 检测到的异常模式
 * @readonly
 * @enum {string}
 */
export const PatternType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    PatternToolThrashing: "tool_thrashing",
    PatternEditThrashing: "edit_thrashing",
    PatternReasoningLoop: "reasoning_loop",
    PatternTokenAnomaly: "token_anomaly",
    PatternPlanDrift: "plan_drift",
    PatternSignatureRepeat: "signature_repeat",
    PatternExtremeIter: "extreme_iterations",
};

/**
 * PolicyAuditEntry represents a single audit log entry.
 */
export class PolicyAuditEntry {
    /**
     * Creates a new PolicyAuditEntry instance.
     * @param {Partial<PolicyAuditEntry>} [$$source = {}] - The source object to create the PolicyAuditEntry.
     */
    constructor($$source = {}) {
        if (!("timestamp" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timestamp"] = 0;
        }
        if (!("toolName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["toolName"] = "";
        }
        if (!("paramsPreview" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["paramsPreview"] = "";
        }
        if (!("decision" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["decision"] = "";
        }
        if (!("reason" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["reason"] = "";
        }
        if (!("policyName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["policyName"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new PolicyAuditEntry instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {PolicyAuditEntry}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new PolicyAuditEntry(/** @type {Partial<PolicyAuditEntry>} */($$parsedSource));
    }
}

/**
 * PolicyConfig is the complete policy configuration.
 */
export class PolicyConfig {
    /**
     * Creates a new PolicyConfig instance.
     * @param {Partial<PolicyConfig>} [$$source = {}] - The source object to create the PolicyConfig.
     */
    constructor($$source = {}) {
        if (!("toolPolicies" in $$source)) {
            /**
             * @member
             * @type {ToolPolicyRule[]}
             */
            this["toolPolicies"] = [];
        }
        if (!("scopePolicy" in $$source)) {
            /**
             * @member
             * @type {ScopePolicyRule}
             */
            this["scopePolicy"] = (new ScopePolicyRule());
        }
        if (!("autoConfirm" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoConfirm"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new PolicyConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {PolicyConfig}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType8;
        const $$createField1_0 = $$createType9;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("toolPolicies" in $$parsedSource) {
            $$parsedSource["toolPolicies"] = $$createField0_0($$parsedSource["toolPolicies"]);
        }
        if ("scopePolicy" in $$parsedSource) {
            $$parsedSource["scopePolicy"] = $$createField1_0($$parsedSource["scopePolicy"]);
        }
        return new PolicyConfig(/** @type {Partial<PolicyConfig>} */($$parsedSource));
    }
}

/**
 * PolicyDecision represents the outcome of a policy check.
 * @readonly
 * @enum {string}
 */
export const PolicyDecision = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    PolicyAllow: "allow",
    PolicyDeny: "deny",
    PolicyConfirm: "confirm",
};

/**
 * PolicyResult represents the result of a policy engine check.
 */
export class PolicyResult {
    /**
     * Creates a new PolicyResult instance.
     * @param {Partial<PolicyResult>} [$$source = {}] - The source object to create the PolicyResult.
     */
    constructor($$source = {}) {
        if (!("decision" in $$source)) {
            /**
             * @member
             * @type {PolicyDecision}
             */
            this["decision"] = PolicyDecision.$zero;
        }
        if (!("reason" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["reason"] = "";
        }
        if (!("policyName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["policyName"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["ruleName"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new PolicyResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {PolicyResult}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new PolicyResult(/** @type {Partial<PolicyResult>} */($$parsedSource));
    }
}

/**
 * ProactiveConfig 主动引擎配置
 */
export class ProactiveConfig {
    /**
     * Creates a new ProactiveConfig instance.
     * @param {Partial<ProactiveConfig>} [$$source = {}] - The source object to create the ProactiveConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("maxDailyMessages" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxDailyMessages"] = 0;
        }
        if (!("minIntervalMinutes" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["minIntervalMinutes"] = 0;
        }
        if (!("quietHoursStart" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["quietHoursStart"] = 0;
        }
        if (!("quietHoursEnd" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["quietHoursEnd"] = 0;
        }
        if (!("idleThresholdHours" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["idleThresholdHours"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProactiveConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProactiveConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ProactiveConfig(/** @type {Partial<ProactiveConfig>} */($$parsedSource));
    }
}

/**
 * ProactiveFeedbackStats 反馈统计
 */
export class ProactiveFeedbackStats {
    /**
     * Creates a new ProactiveFeedbackStats instance.
     * @param {Partial<ProactiveFeedbackStats>} [$$source = {}] - The source object to create the ProactiveFeedbackStats.
     */
    constructor($$source = {}) {
        if (!("totalRecords" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["totalRecords"] = 0;
        }
        if (!("positiveRate" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["positiveRate"] = 0;
        }
        if (!("negativeRate" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["negativeRate"] = 0;
        }
        if (!("ignoreRate" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ignoreRate"] = 0;
        }
        if (!("avgResponseMin" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["avgResponseMin"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProactiveFeedbackStats instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProactiveFeedbackStats}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ProactiveFeedbackStats(/** @type {Partial<ProactiveFeedbackStats>} */($$parsedSource));
    }
}

/**
 * ProactiveHeartbeatResult 心跳结果
 */
export class ProactiveHeartbeatResult {
    /**
     * Creates a new ProactiveHeartbeatResult instance.
     * @param {Partial<ProactiveHeartbeatResult>} [$$source = {}] - The source object to create the ProactiveHeartbeatResult.
     */
    constructor($$source = {}) {
        if (!("shouldSend" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["shouldSend"] = false;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {ProactiveMessageType | undefined}
             */
            this["msgType"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["content"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["reason"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProactiveHeartbeatResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProactiveHeartbeatResult}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ProactiveHeartbeatResult(/** @type {Partial<ProactiveHeartbeatResult>} */($$parsedSource));
    }
}

/**
 * ProactiveMessageType 主动消息类型
 * @readonly
 * @enum {string}
 */
export const ProactiveMessageType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    ProactiveMorningGreeting: "greeting",
    ProactiveTaskFollowup: "task_followup",
    ProactiveIdleChat: "idle_chat",
    ProactiveGoodnight: "goodnight",
    ProactiveMemoryRecall: "memory_recall",
};

/**
 * ProactiveReaction 用户对主动消息的反馈
 * @readonly
 * @enum {string}
 */
export const ProactiveReaction = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    ReactionPositive: "positive",
    ReactionNegative: "negative",
    ReactionIgnored: "ignored",
};

/**
 * ProactiveRecord 主动消息记录
 */
export class ProactiveRecord {
    /**
     * Creates a new ProactiveRecord instance.
     * @param {Partial<ProactiveRecord>} [$$source = {}] - The source object to create the ProactiveRecord.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("msgType" in $$source)) {
            /**
             * @member
             * @type {ProactiveMessageType}
             */
            this["msgType"] = ProactiveMessageType.$zero;
        }
        if (!("content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["content"] = "";
        }
        if (!("channel" in $$source)) {
            /**
             * telegram / qqbot / app
             * @member
             * @type {string}
             */
            this["channel"] = "";
        }
        if (!("reaction" in $$source)) {
            /**
             * @member
             * @type {ProactiveReaction}
             */
            this["reaction"] = ProactiveReaction.$zero;
        }
        if (!("responseDelayMinutes" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["responseDelayMinutes"] = 0;
        }
        if (!("timestamp" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timestamp"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProactiveRecord instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProactiveRecord}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ProactiveRecord(/** @type {Partial<ProactiveRecord>} */($$parsedSource));
    }
}

/**
 * ProactiveStatus 主动引擎运行状态
 */
export class ProactiveStatus {
    /**
     * Creates a new ProactiveStatus instance.
     * @param {Partial<ProactiveStatus>} [$$source = {}] - The source object to create the ProactiveStatus.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("todayMessageCount" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["todayMessageCount"] = 0;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {number | null | undefined}
             */
            this["lastMessageTime"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {number | null | undefined}
             */
            this["lastUserInteraction"] = undefined;
        }
        if (!("adjustedConfig" in $$source)) {
            /**
             * @member
             * @type {ProactiveConfig}
             */
            this["adjustedConfig"] = (new ProactiveConfig());
        }
        if (!("recentRecords" in $$source)) {
            /**
             * @member
             * @type {ProactiveRecord[]}
             */
            this["recentRecords"] = [];
        }
        if (!("feedbackStats" in $$source)) {
            /**
             * @member
             * @type {ProactiveFeedbackStats}
             */
            this["feedbackStats"] = (new ProactiveFeedbackStats());
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProactiveStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProactiveStatus}
     */
    static createFrom($$source = {}) {
        const $$createField4_0 = $$createType10;
        const $$createField5_0 = $$createType12;
        const $$createField6_0 = $$createType13;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("adjustedConfig" in $$parsedSource) {
            $$parsedSource["adjustedConfig"] = $$createField4_0($$parsedSource["adjustedConfig"]);
        }
        if ("recentRecords" in $$parsedSource) {
            $$parsedSource["recentRecords"] = $$createField5_0($$parsedSource["recentRecords"]);
        }
        if ("feedbackStats" in $$parsedSource) {
            $$parsedSource["feedbackStats"] = $$createField6_0($$parsedSource["feedbackStats"]);
        }
        return new ProactiveStatus(/** @type {Partial<ProactiveStatus>} */($$parsedSource));
    }
}

export class ProviderConfig {
    /**
     * Creates a new ProviderConfig instance.
     * @param {Partial<ProviderConfig>} [$$source = {}] - The source object to create the ProviderConfig.
     */
    constructor($$source = {}) {
        if (!("defaultId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["defaultId"] = "";
        }
        if (!("cliTimeout" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["cliTimeout"] = 0;
        }
        if (!("envOverrides" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["envOverrides"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ProviderConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ProviderConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ProviderConfig(/** @type {Partial<ProviderConfig>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const ProxyType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    ProxyNone: "none",
    ProxyHTTP: "http",
    ProxySocks5: "socks5",
};

export class QueueConfig {
    /**
     * Creates a new QueueConfig instance.
     * @param {Partial<QueueConfig>} [$$source = {}] - The source object to create the QueueConfig.
     */
    constructor($$source = {}) {
        if (!("maxConcurrency" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxConcurrency"] = 0;
        }
        if (!("maxRetries" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxRetries"] = 0;
        }
        if (!("retryBackoff" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["retryBackoff"] = 0;
        }
        if (!("persistEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["persistEnabled"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new QueueConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {QueueConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new QueueConfig(/** @type {Partial<QueueConfig>} */($$parsedSource));
    }
}

export class QueueTask {
    /**
     * Creates a new QueueTask instance.
     * @param {Partial<QueueTask>} [$$source = {}] - The source object to create the QueueTask.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("type" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["type"] = "";
        }
        if (!("payload" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["payload"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {QueueTaskStatus}
             */
            this["status"] = QueueTaskStatus.$zero;
        }
        if (!("assignedTo" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["assignedTo"] = "";
        }
        if (!("attempt" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["attempt"] = 0;
        }
        if (!("maxAttempts" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxAttempts"] = 0;
        }
        if (!("lastError" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["lastError"] = "";
        }
        if (!("runAfter" in $$source)) {
            /**
             * @member
             * @type {time$0.Time | null}
             */
            this["runAfter"] = null;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["updatedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new QueueTask instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {QueueTask}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new QueueTask(/** @type {Partial<QueueTask>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const QueueTaskStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    QueueTaskPending: "pending",
    QueueTaskInProgress: "in_progress",
    QueueTaskCompleted: "completed",
    QueueTaskFailed: "failed",
    QueueTaskCancelled: "cancelled",
};

export class RegistryConfig {
    /**
     * Creates a new RegistryConfig instance.
     * @param {Partial<RegistryConfig>} [$$source = {}] - The source object to create the RegistryConfig.
     */
    constructor($$source = {}) {
        if (!("cacheTTL" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["cacheTTL"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new RegistryConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {RegistryConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new RegistryConfig(/** @type {Partial<RegistryConfig>} */($$parsedSource));
    }
}

/**
 * RemoteStatus represents sync status with the upstream branch.
 */
export class RemoteStatus {
    /**
     * Creates a new RemoteStatus instance.
     * @param {Partial<RemoteStatus>} [$$source = {}] - The source object to create the RemoteStatus.
     */
    constructor($$source = {}) {
        if (!("hasUpstream" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["hasUpstream"] = false;
        }
        if (!("upstream" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["upstream"] = "";
        }
        if (!("ahead" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ahead"] = 0;
        }
        if (!("behind" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["behind"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new RemoteStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {RemoteStatus}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new RemoteStatus(/** @type {Partial<RemoteStatus>} */($$parsedSource));
    }
}

/**
 * ResourceBudgetConfig 资源预算配置（5 维度）
 */
export class ResourceBudgetConfig {
    /**
     * Creates a new ResourceBudgetConfig instance.
     * @param {Partial<ResourceBudgetConfig>} [$$source = {}] - The source object to create the ResourceBudgetConfig.
     */
    constructor($$source = {}) {
        if (!("maxTokens" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxTokens"] = 0;
        }
        if (!("maxCostUsd" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxCostUsd"] = 0;
        }
        if (!("maxDurationSeconds" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxDurationSeconds"] = 0;
        }
        if (!("maxIterations" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxIterations"] = 0;
        }
        if (!("maxToolCalls" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxToolCalls"] = 0;
        }
        if (!("warningThreshold" in $$source)) {
            /**
             * 0.80
             * @member
             * @type {number}
             */
            this["warningThreshold"] = 0;
        }
        if (!("downgradeThreshold" in $$source)) {
            /**
             * 0.90
             * @member
             * @type {number}
             */
            this["downgradeThreshold"] = 0;
        }
        if (!("pauseThreshold" in $$source)) {
            /**
             * 1.0
             * @member
             * @type {number}
             */
            this["pauseThreshold"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ResourceBudgetConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ResourceBudgetConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new ResourceBudgetConfig(/** @type {Partial<ResourceBudgetConfig>} */($$parsedSource));
    }
}

/**
 * ScopePolicyRule defines path and command restrictions.
 */
export class ScopePolicyRule {
    /**
     * Creates a new ScopePolicyRule instance.
     * @param {Partial<ScopePolicyRule>} [$$source = {}] - The source object to create the ScopePolicyRule.
     */
    constructor($$source = {}) {
        if (!("allowedPaths" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["allowedPaths"] = [];
        }
        if (!("blockedPaths" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["blockedPaths"] = [];
        }
        if (!("blockedCommands" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["blockedCommands"] = [];
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ScopePolicyRule instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ScopePolicyRule}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType3;
        const $$createField1_0 = $$createType3;
        const $$createField2_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("allowedPaths" in $$parsedSource) {
            $$parsedSource["allowedPaths"] = $$createField0_0($$parsedSource["allowedPaths"]);
        }
        if ("blockedPaths" in $$parsedSource) {
            $$parsedSource["blockedPaths"] = $$createField1_0($$parsedSource["blockedPaths"]);
        }
        if ("blockedCommands" in $$parsedSource) {
            $$parsedSource["blockedCommands"] = $$createField2_0($$parsedSource["blockedCommands"]);
        }
        return new ScopePolicyRule(/** @type {Partial<ScopePolicyRule>} */($$parsedSource));
    }
}

export class Session {
    /**
     * Creates a new Session instance.
     * @param {Partial<Session>} [$$source = {}] - The source object to create the Session.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workingDirectory"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {SessionStatus}
             */
            this["status"] = SessionStatus.$zero;
        }
        if (!("mode" in $$source)) {
            /**
             * @member
             * @type {SessionMode}
             */
            this["mode"] = SessionMode.$zero;
        }
        if (!("initialPrompt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["initialPrompt"] = "";
        }
        if (!("autoAccept" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoAccept"] = false;
        }
        if (!("worktreePath" in $$source)) {
            /**
             * Worktree fields
             * @member
             * @type {string}
             */
            this["worktreePath"] = "";
        }
        if (!("worktreeBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreeBranch"] = "";
        }
        if (!("worktreeBaseCommit" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreeBaseCommit"] = "";
        }
        if (!("worktreeBaseBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreeBaseBranch"] = "";
        }
        if (!("worktreeMerged" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["worktreeMerged"] = false;
        }
        if (!("worktreeSourceRepo" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreeSourceRepo"] = "";
        }
        if (!("taskId" in $$source)) {
            /**
             * Compat fields (legacy claudeops)
             * @member
             * @type {string}
             */
            this["taskId"] = "";
        }
        if (!("nameLocked" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["nameLocked"] = false;
        }
        if (!("estimatedTokens" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["estimatedTokens"] = 0;
        }
        if (!("config" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["config"] = "";
        }
        if (!("claudeSessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["claudeSessionId"] = "";
        }
        if (!("exitCode" in $$source)) {
            /**
             * @member
             * @type {number | null}
             */
            this["exitCode"] = null;
        }
        if (!("parentSessionId" in $$source)) {
            /**
             * Agent parent-child relationship
             * @member
             * @type {string}
             */
            this["parentSessionId"] = "";
        }
        if (!("startedAt" in $$source)) {
            /**
             * Timestamps
             * @member
             * @type {time$0.Time}
             */
            this["startedAt"] = null;
        }
        if (!("endedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time | null}
             */
            this["endedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Session instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Session}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Session(/** @type {Partial<Session>} */($$parsedSource));
    }
}

export class SessionConfig {
    /**
     * Creates a new SessionConfig instance.
     * @param {Partial<SessionConfig>} [$$source = {}] - The source object to create the SessionConfig.
     */
    constructor($$source = {}) {
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workingDirectory"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }
        if (!("mode" in $$source)) {
            /**
             * @member
             * @type {SessionMode}
             */
            this["mode"] = SessionMode.$zero;
        }
        if (!("initialPrompt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["initialPrompt"] = "";
        }
        if (!("autoAccept" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoAccept"] = false;
        }
        if (!("worktreeEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["worktreeEnabled"] = false;
        }
        if (!("gitRepoPath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["gitRepoPath"] = "";
        }
        if (!("gitBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["gitBranch"] = "";
        }
        if (!("taskId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["taskId"] = "";
        }
        if (!("nameLocked" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["nameLocked"] = false;
        }
        if (!("estimatedTokens" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["estimatedTokens"] = 0;
        }
        if (!("config" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["config"] = "";
        }
        if (!("claudeSessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["claudeSessionId"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SessionConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SessionConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new SessionConfig(/** @type {Partial<SessionConfig>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const SessionMode = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SessionModeNormal: "normal",
    SessionModeSupervisor: "supervisor",
    SessionModeMission: "mission",
};

/**
 * @readonly
 * @enum {string}
 */
export const SessionStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SessionStarting: "starting",
    SessionRunning: "running",
    SessionIdle: "idle",
    SessionWaitingInput: "waiting_input",
    SessionCompleted: "completed",
    SessionError: "error",
    SessionTerminated: "terminated",
};

export class Skill {
    /**
     * Creates a new Skill instance.
     * @param {Partial<Skill>} [$$source = {}] - The source object to create the Skill.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("category" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["category"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["slashCommand"] = undefined;
        }
        if (!("type" in $$source)) {
            /**
             * @member
             * @type {SkillType}
             */
            this["type"] = SkillType.$zero;
        }
        if (!("compatibleProviders" in $$source)) {
            /**
             * @member
             * @type {any}
             */
            this["compatibleProviders"] = null;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["promptTemplate"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["systemPromptAddition"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {SkillVariable[] | undefined}
             */
            this["inputVariables"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {OrchestrationConfig | null | undefined}
             */
            this["orchestrationConfig"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["requiredMcps"] = undefined;
        }
        if (!("isInstalled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isInstalled"] = false;
        }
        if (!("isEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isEnabled"] = false;
        }
        if (!("source" in $$source)) {
            /**
             * @member
             * @type {SkillSource}
             */
            this["source"] = SkillSource.$zero;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["version"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["author"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["tags"] = undefined;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["createdAt"] = "";
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["updatedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Skill instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Skill}
     */
    static createFrom($$source = {}) {
        const $$createField9_0 = $$createType15;
        const $$createField10_0 = $$createType17;
        const $$createField11_0 = $$createType3;
        const $$createField17_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("inputVariables" in $$parsedSource) {
            $$parsedSource["inputVariables"] = $$createField9_0($$parsedSource["inputVariables"]);
        }
        if ("orchestrationConfig" in $$parsedSource) {
            $$parsedSource["orchestrationConfig"] = $$createField10_0($$parsedSource["orchestrationConfig"]);
        }
        if ("requiredMcps" in $$parsedSource) {
            $$parsedSource["requiredMcps"] = $$createField11_0($$parsedSource["requiredMcps"]);
        }
        if ("tags" in $$parsedSource) {
            $$parsedSource["tags"] = $$createField17_0($$parsedSource["tags"]);
        }
        return new Skill(/** @type {Partial<Skill>} */($$parsedSource));
    }
}

export class SkillConfig {
    /**
     * Creates a new SkillConfig instance.
     * @param {Partial<SkillConfig>} [$$source = {}] - The source object to create the SkillConfig.
     */
    constructor($$source = {}) {
        if (!("registryUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["registryUrl"] = "";
        }
        if (!("defaultCategory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["defaultCategory"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SkillConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SkillConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new SkillConfig(/** @type {Partial<SkillConfig>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const SkillSource = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SkillSourceBuiltin: "builtin",
    SkillSourceMarketplace: "marketplace",
    SkillSourceLocal: "local",
    SkillSourceCustom: "custom",
};

/**
 * @readonly
 * @enum {string}
 */
export const SkillType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SkillTypePrompt: "prompt",
    SkillTypeNative: "native",
    SkillTypeOrchestration: "orchestration",
};

export class SkillVariable {
    /**
     * Creates a new SkillVariable instance.
     * @param {Partial<SkillVariable>} [$$source = {}] - The source object to create the SkillVariable.
     */
    constructor($$source = {}) {
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("required" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["required"] = false;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["defaultValue"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["type"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string[] | undefined}
             */
            this["options"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SkillVariable instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SkillVariable}
     */
    static createFrom($$source = {}) {
        const $$createField5_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("options" in $$parsedSource) {
            $$parsedSource["options"] = $$createField5_0($$parsedSource["options"]);
        }
        return new SkillVariable(/** @type {Partial<SkillVariable>} */($$parsedSource));
    }
}

/**
 * StickerResult represents a single sticker search result.
 */
export class StickerResult {
    /**
     * Creates a new StickerResult instance.
     * @param {Partial<StickerResult>} [$$source = {}] - The source object to create the StickerResult.
     */
    constructor($$source = {}) {
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("category" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["category"] = "";
        }
        if (!("url" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["url"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new StickerResult instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {StickerResult}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new StickerResult(/** @type {Partial<StickerResult>} */($$parsedSource));
    }
}

/**
 * StickerStatus represents the current status of the sticker engine.
 */
export class StickerStatus {
    /**
     * Creates a new StickerStatus instance.
     * @param {Partial<StickerStatus>} [$$source = {}] - The source object to create the StickerStatus.
     */
    constructor($$source = {}) {
        if (!("initialized" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["initialized"] = false;
        }
        if (!("totalStickers" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["totalStickers"] = 0;
        }
        if (!("keywords" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["keywords"] = 0;
        }
        if (!("categories" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["categories"] = 0;
        }
        if (!("cachedFiles" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["cachedFiles"] = 0;
        }
        if (!("dataDir" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["dataDir"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new StickerStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {StickerStatus}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new StickerStatus(/** @type {Partial<StickerStatus>} */($$parsedSource));
    }
}

export class StorageConfig {
    /**
     * Creates a new StorageConfig instance.
     * @param {Partial<StorageConfig>} [$$source = {}] - The source object to create the StorageConfig.
     */
    constructor($$source = {}) {
        if (!("workspaceRoot" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workspaceRoot"] = "";
        }
        if (!("tempDir" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["tempDir"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new StorageConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {StorageConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new StorageConfig(/** @type {Partial<StorageConfig>} */($$parsedSource));
    }
}

export class Suggestion {
    /**
     * Creates a new Suggestion instance.
     * @param {Partial<Suggestion>} [$$source = {}] - The source object to create the Suggestion.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("type" in $$source)) {
            /**
             * @member
             * @type {SuggestionType}
             */
            this["type"] = SuggestionType.$zero;
        }
        if (!("title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["title"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("sessionName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionName"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {SuggestionActionDef | null | undefined}
             */
            this["action"] = undefined;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["createdAt"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Suggestion instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Suggestion}
     */
    static createFrom($$source = {}) {
        const $$createField6_0 = $$createType19;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("action" in $$parsedSource) {
            $$parsedSource["action"] = $$createField6_0($$parsedSource["action"]);
        }
        return new Suggestion(/** @type {Partial<Suggestion>} */($$parsedSource));
    }
}

export class SuggestionActionDef {
    /**
     * Creates a new SuggestionActionDef instance.
     * @param {Partial<SuggestionActionDef>} [$$source = {}] - The source object to create the SuggestionActionDef.
     */
    constructor($$source = {}) {
        if (!("type" in $$source)) {
            /**
             * @member
             * @type {SuggestionActionType}
             */
            this["type"] = SuggestionActionType.$zero;
        }
        if (!("params" in $$source)) {
            /**
             * @member
             * @type {{ [_ in string]?: any }}
             */
            this["params"] = {};
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SuggestionActionDef instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SuggestionActionDef}
     */
    static createFrom($$source = {}) {
        const $$createField1_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("params" in $$parsedSource) {
            $$parsedSource["params"] = $$createField1_0($$parsedSource["params"]);
        }
        return new SuggestionActionDef(/** @type {Partial<SuggestionActionDef>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const SuggestionActionType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SuggestionCreateSession: "create_session",
    SuggestionNavigate: "navigate",
};

/**
 * @readonly
 * @enum {string}
 */
export const SuggestionType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    SuggestionAction: "action",
    SuggestionInfo: "info",
    SuggestionWarning: "warning",
};

/**
 * SupervisionEvent 监督事件记录
 */
export class SupervisionEvent {
    /**
     * Creates a new SupervisionEvent instance.
     * @param {Partial<SupervisionEvent>} [$$source = {}] - The source object to create the SupervisionEvent.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("pattern" in $$source)) {
            /**
             * @member
             * @type {PatternType}
             */
            this["pattern"] = PatternType.$zero;
        }
        if (!("level" in $$source)) {
            /**
             * @member
             * @type {InterventionLevel}
             */
            this["level"] = InterventionLevel.$zero;
        }
        if (!("detail" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["detail"] = "";
        }
        if (!("iteration" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["iteration"] = 0;
        }
        if (!("timestamp" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timestamp"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SupervisionEvent instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SupervisionEvent}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new SupervisionEvent(/** @type {Partial<SupervisionEvent>} */($$parsedSource));
    }
}

/**
 * SupervisorStatus 监督器运行状态
 */
export class SupervisorStatus {
    /**
     * Creates a new SupervisorStatus instance.
     * @param {Partial<SupervisorStatus>} [$$source = {}] - The source object to create the SupervisorStatus.
     */
    constructor($$source = {}) {
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("totalEvents" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["totalEvents"] = 0;
        }
        if (!("recentEvents" in $$source)) {
            /**
             * @member
             * @type {SupervisionEvent[]}
             */
            this["recentEvents"] = [];
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {BudgetStatus | null | undefined}
             */
            this["budgetStatus"] = undefined;
        }
        if (!("toolCallCount" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["toolCallCount"] = 0;
        }
        if (!("iterationCount" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["iterationCount"] = 0;
        }
        if (!("tokensUsed" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["tokensUsed"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SupervisorStatus instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SupervisorStatus}
     */
    static createFrom($$source = {}) {
        const $$createField3_0 = $$createType21;
        const $$createField4_0 = $$createType23;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("recentEvents" in $$parsedSource) {
            $$parsedSource["recentEvents"] = $$createField3_0($$parsedSource["recentEvents"]);
        }
        if ("budgetStatus" in $$parsedSource) {
            $$parsedSource["budgetStatus"] = $$createField4_0($$parsedSource["budgetStatus"]);
        }
        return new SupervisorStatus(/** @type {Partial<SupervisorStatus>} */($$parsedSource));
    }
}

export class SystemConfig {
    /**
     * Creates a new SystemConfig instance.
     * @param {Partial<SystemConfig>} [$$source = {}] - The source object to create the SystemConfig.
     */
    constructor($$source = {}) {
        if (!("auth" in $$source)) {
            /**
             * @member
             * @type {AuthConfig}
             */
            this["auth"] = (new AuthConfig());
        }
        if (!("log" in $$source)) {
            /**
             * @member
             * @type {LogConfig}
             */
            this["log"] = (new LogConfig());
        }
        if (!("telemetry" in $$source)) {
            /**
             * @member
             * @type {TelemetryConfig}
             */
            this["telemetry"] = (new TelemetryConfig());
        }
        if (!("queue" in $$source)) {
            /**
             * @member
             * @type {QueueConfig}
             */
            this["queue"] = (new QueueConfig());
        }
        if (!("workflow" in $$source)) {
            /**
             * @member
             * @type {WorkflowConfig}
             */
            this["workflow"] = (new WorkflowConfig());
        }
        if (!("task" in $$source)) {
            /**
             * @member
             * @type {TaskDefaults}
             */
            this["task"] = (new TaskDefaults());
        }
        if (!("storage" in $$source)) {
            /**
             * @member
             * @type {StorageConfig}
             */
            this["storage"] = (new StorageConfig());
        }
        if (!("filewatch" in $$source)) {
            /**
             * @member
             * @type {FilewatchConfig}
             */
            this["filewatch"] = (new FilewatchConfig());
        }
        if (!("worktree" in $$source)) {
            /**
             * @member
             * @type {WorktreeConfig}
             */
            this["worktree"] = (new WorktreeConfig());
        }
        if (!("provider" in $$source)) {
            /**
             * @member
             * @type {ProviderConfig}
             */
            this["provider"] = (new ProviderConfig());
        }
        if (!("bridge" in $$source)) {
            /**
             * @member
             * @type {BridgeConfig}
             */
            this["bridge"] = (new BridgeConfig());
        }
        if (!("mcp" in $$source)) {
            /**
             * @member
             * @type {MCPConfig}
             */
            this["mcp"] = (new MCPConfig());
        }
        if (!("skill" in $$source)) {
            /**
             * @member
             * @type {SkillConfig}
             */
            this["skill"] = (new SkillConfig());
        }
        if (!("registry" in $$source)) {
            /**
             * @member
             * @type {RegistryConfig}
             */
            this["registry"] = (new RegistryConfig());
        }
        if (!("notification" in $$source)) {
            /**
             * @member
             * @type {NotificationConfig}
             */
            this["notification"] = (new NotificationConfig());
        }
        if (!("telegram" in $$source)) {
            /**
             * @member
             * @type {TelegramConfig}
             */
            this["telegram"] = (new TelegramConfig());
        }
        if (!("update" in $$source)) {
            /**
             * @member
             * @type {UpdateConfig}
             */
            this["update"] = (new UpdateConfig());
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new SystemConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {SystemConfig}
     */
    static createFrom($$source = {}) {
        const $$createField0_0 = $$createType24;
        const $$createField1_0 = $$createType25;
        const $$createField2_0 = $$createType26;
        const $$createField3_0 = $$createType27;
        const $$createField4_0 = $$createType28;
        const $$createField5_0 = $$createType29;
        const $$createField6_0 = $$createType30;
        const $$createField7_0 = $$createType31;
        const $$createField8_0 = $$createType32;
        const $$createField9_0 = $$createType33;
        const $$createField10_0 = $$createType34;
        const $$createField11_0 = $$createType35;
        const $$createField12_0 = $$createType36;
        const $$createField13_0 = $$createType37;
        const $$createField14_0 = $$createType38;
        const $$createField15_0 = $$createType39;
        const $$createField16_0 = $$createType40;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("auth" in $$parsedSource) {
            $$parsedSource["auth"] = $$createField0_0($$parsedSource["auth"]);
        }
        if ("log" in $$parsedSource) {
            $$parsedSource["log"] = $$createField1_0($$parsedSource["log"]);
        }
        if ("telemetry" in $$parsedSource) {
            $$parsedSource["telemetry"] = $$createField2_0($$parsedSource["telemetry"]);
        }
        if ("queue" in $$parsedSource) {
            $$parsedSource["queue"] = $$createField3_0($$parsedSource["queue"]);
        }
        if ("workflow" in $$parsedSource) {
            $$parsedSource["workflow"] = $$createField4_0($$parsedSource["workflow"]);
        }
        if ("task" in $$parsedSource) {
            $$parsedSource["task"] = $$createField5_0($$parsedSource["task"]);
        }
        if ("storage" in $$parsedSource) {
            $$parsedSource["storage"] = $$createField6_0($$parsedSource["storage"]);
        }
        if ("filewatch" in $$parsedSource) {
            $$parsedSource["filewatch"] = $$createField7_0($$parsedSource["filewatch"]);
        }
        if ("worktree" in $$parsedSource) {
            $$parsedSource["worktree"] = $$createField8_0($$parsedSource["worktree"]);
        }
        if ("provider" in $$parsedSource) {
            $$parsedSource["provider"] = $$createField9_0($$parsedSource["provider"]);
        }
        if ("bridge" in $$parsedSource) {
            $$parsedSource["bridge"] = $$createField10_0($$parsedSource["bridge"]);
        }
        if ("mcp" in $$parsedSource) {
            $$parsedSource["mcp"] = $$createField11_0($$parsedSource["mcp"]);
        }
        if ("skill" in $$parsedSource) {
            $$parsedSource["skill"] = $$createField12_0($$parsedSource["skill"]);
        }
        if ("registry" in $$parsedSource) {
            $$parsedSource["registry"] = $$createField13_0($$parsedSource["registry"]);
        }
        if ("notification" in $$parsedSource) {
            $$parsedSource["notification"] = $$createField14_0($$parsedSource["notification"]);
        }
        if ("telegram" in $$parsedSource) {
            $$parsedSource["telegram"] = $$createField15_0($$parsedSource["telegram"]);
        }
        if ("update" in $$parsedSource) {
            $$parsedSource["update"] = $$createField16_0($$parsedSource["update"]);
        }
        return new SystemConfig(/** @type {Partial<SystemConfig>} */($$parsedSource));
    }
}

export class TaskConfig {
    /**
     * Creates a new TaskConfig instance.
     * @param {Partial<TaskConfig>} [$$source = {}] - The source object to create the TaskConfig.
     */
    constructor($$source = {}) {
        if (!("title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["title"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("priority" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["priority"] = 0;
        }
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workingDirectory"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TaskConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TaskConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TaskConfig(/** @type {Partial<TaskConfig>} */($$parsedSource));
    }
}

export class TaskDefaults {
    /**
     * Creates a new TaskDefaults instance.
     * @param {Partial<TaskDefaults>} [$$source = {}] - The source object to create the TaskDefaults.
     */
    constructor($$source = {}) {
        if (!("defaultStatus" in $$source)) {
            /**
             * @member
             * @type {QueueTaskStatus}
             */
            this["defaultStatus"] = QueueTaskStatus.$zero;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TaskDefaults instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TaskDefaults}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TaskDefaults(/** @type {Partial<TaskDefaults>} */($$parsedSource));
    }
}

export class TaskItem {
    /**
     * Creates a new TaskItem instance.
     * @param {Partial<TaskItem>} [$$source = {}] - The source object to create the TaskItem.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["title"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {TaskStatus}
             */
            this["status"] = TaskStatus.$zero;
        }
        if (!("priority" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["priority"] = 0;
        }
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workingDirectory"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["updatedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TaskItem instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TaskItem}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TaskItem(/** @type {Partial<TaskItem>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const TaskItemStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    TaskPending: "pending",
    TaskInProgress: "in_progress",
    TaskCompleted: "completed",
    TaskBlocked: "blocked",
};

/**
 * @readonly
 * @enum {string}
 */
export const TaskItemType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    TaskTypeGoal: "goal",
    TaskTypeTask: "task",
};

/**
 * @readonly
 * @enum {string}
 */
export const TaskStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    TaskStatusTodo: "todo",
    TaskStatusInProgress: "in_progress",
    TaskStatusWaiting: "waiting",
    TaskStatusDone: "done",
};

export class TaskUpdate {
    /**
     * Creates a new TaskUpdate instance.
     * @param {Partial<TaskUpdate>} [$$source = {}] - The source object to create the TaskUpdate.
     */
    constructor($$source = {}) {
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | null | undefined}
             */
            this["title"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | null | undefined}
             */
            this["description"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {TaskStatus | null | undefined}
             */
            this["status"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {number | null | undefined}
             */
            this["priority"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | null | undefined}
             */
            this["sessionId"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | null | undefined}
             */
            this["workingDirectory"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | null | undefined}
             */
            this["providerId"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TaskUpdate instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TaskUpdate}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TaskUpdate(/** @type {Partial<TaskUpdate>} */($$parsedSource));
    }
}

export class TeamDefinition {
    /**
     * Creates a new TeamDefinition instance.
     * @param {Partial<TeamDefinition>} [$$source = {}] - The source object to create the TeamDefinition.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("roles" in $$source)) {
            /**
             * @member
             * @type {TeamRoleDefinition[]}
             */
            this["roles"] = [];
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["updatedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamDefinition instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamDefinition}
     */
    static createFrom($$source = {}) {
        const $$createField3_0 = $$createType42;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("roles" in $$parsedSource) {
            $$parsedSource["roles"] = $$createField3_0($$parsedSource["roles"]);
        }
        return new TeamDefinition(/** @type {Partial<TeamDefinition>} */($$parsedSource));
    }
}

export class TeamInstance {
    /**
     * Creates a new TeamInstance instance.
     * @param {Partial<TeamInstance>} [$$source = {}] - The source object to create the TeamInstance.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("teamId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["teamId"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("workingDirectory" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workingDirectory"] = "";
        }
        if (!("task" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["task"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {TeamInstanceStatus}
             */
            this["status"] = TeamInstanceStatus.$zero;
        }
        if (!("members" in $$source)) {
            /**
             * @member
             * @type {TeamMember[]}
             */
            this["members"] = [];
        }
        if (!("startedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["startedAt"] = null;
        }
        if (!("endedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time | null}
             */
            this["endedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamInstance instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamInstance}
     */
    static createFrom($$source = {}) {
        const $$createField6_0 = $$createType44;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("members" in $$parsedSource) {
            $$parsedSource["members"] = $$createField6_0($$parsedSource["members"]);
        }
        return new TeamInstance(/** @type {Partial<TeamInstance>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const TeamInstanceStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    TeamStarting: "starting",
    TeamRunning: "running",
    TeamPaused: "paused",
    TeamCompleted: "completed",
    TeamFailed: "failed",
};

export class TeamMember {
    /**
     * Creates a new TeamMember instance.
     * @param {Partial<TeamMember>} [$$source = {}] - The source object to create the TeamMember.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("instanceId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["instanceId"] = "";
        }
        if (!("roleName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["roleName"] = "";
        }
        if (!("displayName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["displayName"] = "";
        }
        if (!("agentId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["agentId"] = "";
        }
        if (!("childSessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["childSessionId"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {MemberStatus}
             */
            this["status"] = MemberStatus.$zero;
        }
        if (!("color" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["color"] = "";
        }
        if (!("joinedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["joinedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamMember instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamMember}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TeamMember(/** @type {Partial<TeamMember>} */($$parsedSource));
    }
}

export class TeamMessage {
    /**
     * Creates a new TeamMessage instance.
     * @param {Partial<TeamMessage>} [$$source = {}] - The source object to create the TeamMessage.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("instanceId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["instanceId"] = "";
        }
        if (!("taskId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["taskId"] = "";
        }
        if (!("fromRole" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["fromRole"] = "";
        }
        if (!("toRole" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["toRole"] = "";
        }
        if (!("content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["content"] = "";
        }
        if (!("messageType" in $$source)) {
            /**
             * @member
             * @type {TeamMessageType}
             */
            this["messageType"] = TeamMessageType.$zero;
        }
        if (!("timestamp" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["timestamp"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamMessage instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamMessage}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TeamMessage(/** @type {Partial<TeamMessage>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const TeamMessageType = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    MsgChat: "chat",
    MsgTaskAssign: "task_assign",
    MsgTaskComplete: "task_complete",
    MsgBroadcast: "broadcast",
};

export class TeamRoleDefinition {
    /**
     * Creates a new TeamRoleDefinition instance.
     * @param {Partial<TeamRoleDefinition>} [$$source = {}] - The source object to create the TeamRoleDefinition.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("teamId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["teamId"] = "";
        }
        if (!("roleName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["roleName"] = "";
        }
        if (!("displayName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["displayName"] = "";
        }
        if (!("systemPrompt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["systemPrompt"] = "";
        }
        if (!("providerId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["providerId"] = "";
        }
        if (!("color" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["color"] = "";
        }
        if (!("sortOrder" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["sortOrder"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamRoleDefinition instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamRoleDefinition}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TeamRoleDefinition(/** @type {Partial<TeamRoleDefinition>} */($$parsedSource));
    }
}

export class TeamTaskItem {
    /**
     * Creates a new TeamTaskItem instance.
     * @param {Partial<TeamTaskItem>} [$$source = {}] - The source object to create the TeamTaskItem.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("instanceId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["instanceId"] = "";
        }
        if (!("title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["title"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("type" in $$source)) {
            /**
             * @member
             * @type {TaskItemType}
             */
            this["type"] = TaskItemType.$zero;
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {TaskItemStatus}
             */
            this["status"] = TaskItemStatus.$zero;
        }
        if (!("assignedTo" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["assignedTo"] = "";
        }
        if (!("completedBy" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["completedBy"] = "";
        }
        if (!("dependencies" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["dependencies"] = [];
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TeamTaskItem instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TeamTaskItem}
     */
    static createFrom($$source = {}) {
        const $$createField8_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("dependencies" in $$parsedSource) {
            $$parsedSource["dependencies"] = $$createField8_0($$parsedSource["dependencies"]);
        }
        return new TeamTaskItem(/** @type {Partial<TeamTaskItem>} */($$parsedSource));
    }
}

export class TelegramConfig {
    /**
     * Creates a new TelegramConfig instance.
     * @param {Partial<TelegramConfig>} [$$source = {}] - The source object to create the TelegramConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("botToken" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["botToken"] = "";
        }
        if (!("allowedUsers" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["allowedUsers"] = [];
        }
        if (!("webhookUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["webhookUrl"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TelegramConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TelegramConfig}
     */
    static createFrom($$source = {}) {
        const $$createField2_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("allowedUsers" in $$parsedSource) {
            $$parsedSource["allowedUsers"] = $$createField2_0($$parsedSource["allowedUsers"]);
        }
        return new TelegramConfig(/** @type {Partial<TelegramConfig>} */($$parsedSource));
    }
}

export class TelemetryConfig {
    /**
     * Creates a new TelemetryConfig instance.
     * @param {Partial<TelemetryConfig>} [$$source = {}] - The source object to create the TelemetryConfig.
     */
    constructor($$source = {}) {
        if (!("enabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["enabled"] = false;
        }
        if (!("endpoint" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["endpoint"] = "";
        }
        if (!("batchSize" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["batchSize"] = 0;
        }
        if (!("flushInterval" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["flushInterval"] = 0;
        }
        if (!("retryMax" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["retryMax"] = 0;
        }
        if (!("sampleRate" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["sampleRate"] = 0;
        }
        if (!("timeout" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timeout"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TelemetryConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TelemetryConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TelemetryConfig(/** @type {Partial<TelemetryConfig>} */($$parsedSource));
    }
}

/**
 * ToolPolicyRule defines security rules for a specific tool.
 */
export class ToolPolicyRule {
    /**
     * Creates a new ToolPolicyRule instance.
     * @param {Partial<ToolPolicyRule>} [$$source = {}] - The source object to create the ToolPolicyRule.
     */
    constructor($$source = {}) {
        if (!("toolName" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["toolName"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {PolicyDecision | undefined}
             */
            this["decision"] = undefined;
        }
        if (!("requireConfirmation" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["requireConfirmation"] = false;
        }
        if (!("dangerousPatterns" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["dangerousPatterns"] = [];
        }
        if (!("blockedPatterns" in $$source)) {
            /**
             * @member
             * @type {string[]}
             */
            this["blockedPatterns"] = [];
        }
        if (!("maxExecutionTime" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["maxExecutionTime"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new ToolPolicyRule instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {ToolPolicyRule}
     */
    static createFrom($$source = {}) {
        const $$createField3_0 = $$createType3;
        const $$createField4_0 = $$createType3;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("dangerousPatterns" in $$parsedSource) {
            $$parsedSource["dangerousPatterns"] = $$createField3_0($$parsedSource["dangerousPatterns"]);
        }
        if ("blockedPatterns" in $$parsedSource) {
            $$parsedSource["blockedPatterns"] = $$createField4_0($$parsedSource["blockedPatterns"]);
        }
        return new ToolPolicyRule(/** @type {Partial<ToolPolicyRule>} */($$parsedSource));
    }
}

/**
 * TrackedFileChange 经过归因的文件改动记录
 */
export class TrackedFileChange {
    /**
     * Creates a new TrackedFileChange instance.
     * @param {Partial<TrackedFileChange>} [$$source = {}] - The source object to create the TrackedFileChange.
     */
    constructor($$source = {}) {
        if (!("filePath" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["filePath"] = "";
        }
        if (!("changeType" in $$source)) {
            /**
             * @member
             * @type {FileChangeType}
             */
            this["changeType"] = FileChangeType.$zero;
        }
        if (!("timestamp" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["timestamp"] = 0;
        }
        if (!("sessionId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["sessionId"] = "";
        }
        if (!("concurrent" in $$source)) {
            /**
             * 多会话同时改动同一文件时标记
             * @member
             * @type {boolean}
             */
            this["concurrent"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new TrackedFileChange instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {TrackedFileChange}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new TrackedFileChange(/** @type {Partial<TrackedFileChange>} */($$parsedSource));
    }
}

export class UpdateConfig {
    /**
     * Creates a new UpdateConfig instance.
     * @param {Partial<UpdateConfig>} [$$source = {}] - The source object to create the UpdateConfig.
     */
    constructor($$source = {}) {
        if (!("channel" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["channel"] = "";
        }
        if (!("baseUrl" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["baseUrl"] = "";
        }
        if (!("autoCheck" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoCheck"] = false;
        }
        if (!("autoDownload" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoDownload"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new UpdateConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {UpdateConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new UpdateConfig(/** @type {Partial<UpdateConfig>} */($$parsedSource));
    }
}

export class UpdateState {
    /**
     * Creates a new UpdateState instance.
     * @param {Partial<UpdateState>} [$$source = {}] - The source object to create the UpdateState.
     */
    constructor($$source = {}) {
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {UpdateStatus}
             */
            this["status"] = UpdateStatus.$zero;
        }
        if (!("currentVersion" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["currentVersion"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["latestVersion"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {boolean | undefined}
             */
            this["isMajorUpdate"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["releaseNotes"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {number | undefined}
             */
            this["percent"] = undefined;
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["message"] = undefined;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new UpdateState instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {UpdateState}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new UpdateState(/** @type {Partial<UpdateState>} */($$parsedSource));
    }
}

/**
 * @readonly
 * @enum {string}
 */
export const UpdateStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    UpdateIdle: "idle",
    UpdateChecking: "checking",
    UpdateAvailable: "available",
    UpdateNotAvailable: "not-available",
    UpdateDownloading: "downloading",
    UpdateDownloaded: "downloaded",
    UpdateError: "error",
};

/**
 * @readonly
 * @enum {string}
 */
export const VoiceTranscriptionMode = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    VoiceOpenAI: "openai",
    VoiceVolcengine: "volcengine",
};

/**
 * Workflow represents a persisted workflow definition (DB row).
 */
export class Workflow {
    /**
     * Creates a new Workflow instance.
     * @param {Partial<Workflow>} [$$source = {}] - The source object to create the Workflow.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["name"] = "";
        }
        if (!("description" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["description"] = "";
        }
        if (!("definition" in $$source)) {
            /**
             * JSON-serialized WorkflowDefinition
             * @member
             * @type {string}
             */
            this["definition"] = "";
        }
        if (!("isTemplate" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isTemplate"] = false;
        }
        if (!("createdAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["createdAt"] = null;
        }
        if (!("updatedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["updatedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Workflow instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Workflow}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Workflow(/** @type {Partial<Workflow>} */($$parsedSource));
    }
}

export class WorkflowConfig {
    /**
     * Creates a new WorkflowConfig instance.
     * @param {Partial<WorkflowConfig>} [$$source = {}] - The source object to create the WorkflowConfig.
     */
    constructor($$source = {}) {
        if (!("autoApprove" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoApprove"] = false;
        }
        if (!("stepTimeout" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["stepTimeout"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorkflowConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorkflowConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new WorkflowConfig(/** @type {Partial<WorkflowConfig>} */($$parsedSource));
    }
}

/**
 * WorkflowExecutionRecord represents a persisted workflow execution (DB row).
 */
export class WorkflowExecutionRecord {
    /**
     * Creates a new WorkflowExecutionRecord instance.
     * @param {Partial<WorkflowExecutionRecord>} [$$source = {}] - The source object to create the WorkflowExecutionRecord.
     */
    constructor($$source = {}) {
        if (!("id" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["id"] = "";
        }
        if (!("workflowId" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["workflowId"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * @member
             * @type {WorkflowExecutionStatus}
             */
            this["status"] = WorkflowExecutionStatus.$zero;
        }
        if (!("variables" in $$source)) {
            /**
             * JSON
             * @member
             * @type {string}
             */
            this["variables"] = "";
        }
        if (!("stepStatuses" in $$source)) {
            /**
             * JSON
             * @member
             * @type {string}
             */
            this["stepStatuses"] = "";
        }
        if (!("stepOutputs" in $$source)) {
            /**
             * JSON
             * @member
             * @type {string}
             */
            this["stepOutputs"] = "";
        }
        if (!("error" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["error"] = "";
        }
        if (!("startedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time}
             */
            this["startedAt"] = null;
        }
        if (!("completedAt" in $$source)) {
            /**
             * @member
             * @type {time$0.Time | null}
             */
            this["completedAt"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorkflowExecutionRecord instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorkflowExecutionRecord}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new WorkflowExecutionRecord(/** @type {Partial<WorkflowExecutionRecord>} */($$parsedSource));
    }
}

/**
 * WorkflowExecutionStatus is the overall status of a workflow run.
 * @readonly
 * @enum {string}
 */
export const WorkflowExecutionStatus = {
    /**
     * The Go zero value for the underlying type of the enum.
     */
    $zero: "",

    WFExecPending: "pending",
    WFExecRunning: "running",
    WFExecPaused: "paused",
    WFExecCompleted: "completed",
    WFExecFailed: "failed",
    WFExecCancelled: "cancelled",
};

export class WorktreeConfig {
    /**
     * Creates a new WorktreeConfig instance.
     * @param {Partial<WorktreeConfig>} [$$source = {}] - The source object to create the WorktreeConfig.
     */
    constructor($$source = {}) {
        if (!("autoEnabled" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["autoEnabled"] = false;
        }
        if (!("rootDir" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["rootDir"] = "";
        }
        if (!("mainBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mainBranch"] = "";
        }
        if (!("mergeStrategy" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mergeStrategy"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorktreeConfig instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorktreeConfig}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new WorktreeConfig(/** @type {Partial<WorktreeConfig>} */($$parsedSource));
    }
}

/**
 * WorktreeDiffFile represents a file changed in a worktree branch relative to main.
 */
export class WorktreeDiffFile {
    /**
     * Creates a new WorktreeDiffFile instance.
     * @param {Partial<WorktreeDiffFile>} [$$source = {}] - The source object to create the WorktreeDiffFile.
     */
    constructor($$source = {}) {
        if (!("path" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["path"] = "";
        }
        if (!("status" in $$source)) {
            /**
             * A=added, M=modified, D=deleted, R=renamed
             * @member
             * @type {string}
             */
            this["status"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorktreeDiffFile instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorktreeDiffFile}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new WorktreeDiffFile(/** @type {Partial<WorktreeDiffFile>} */($$parsedSource));
    }
}

/**
 * WorktreeDiffSummary represents the diff summary between a worktree branch and its base.
 */
export class WorktreeDiffSummary {
    /**
     * Creates a new WorktreeDiffSummary instance.
     * @param {Partial<WorktreeDiffSummary>} [$$source = {}] - The source object to create the WorktreeDiffSummary.
     */
    constructor($$source = {}) {
        if (!("mainBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["mainBranch"] = "";
        }
        if (!("worktreeBranch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["worktreeBranch"] = "";
        }
        if (/** @type {any} */(false)) {
            /**
             * @member
             * @type {string | undefined}
             */
            this["worktreeBranchCommit"] = undefined;
        }
        if (!("files" in $$source)) {
            /**
             * @member
             * @type {WorktreeDiffFile[]}
             */
            this["files"] = [];
        }
        if (!("added" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["added"] = 0;
        }
        if (!("modified" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["modified"] = 0;
        }
        if (!("deleted" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["deleted"] = 0;
        }
        if (!("aheadCount" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["aheadCount"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorktreeDiffSummary instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorktreeDiffSummary}
     */
    static createFrom($$source = {}) {
        const $$createField3_0 = $$createType46;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("files" in $$parsedSource) {
            $$parsedSource["files"] = $$createField3_0($$parsedSource["files"]);
        }
        return new WorktreeDiffSummary(/** @type {Partial<WorktreeDiffSummary>} */($$parsedSource));
    }
}

export class WorktreeInfo {
    /**
     * Creates a new WorktreeInfo instance.
     * @param {Partial<WorktreeInfo>} [$$source = {}] - The source object to create the WorktreeInfo.
     */
    constructor($$source = {}) {
        if (!("path" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["path"] = "";
        }
        if (!("branch" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["branch"] = "";
        }
        if (!("headCommit" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["headCommit"] = "";
        }
        if (!("isMain" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["isMain"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new WorktreeInfo instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {WorktreeInfo}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new WorktreeInfo(/** @type {Partial<WorktreeInfo>} */($$parsedSource));
    }
}

// Private type creation functions
const $$createType0 = createMap(identity, identity);
const $$createType1 = ChatMessage.createFrom;
const $$createType2 = createArray($$createType1);
const $$createType3 = createArray(identity);
const $$createType4 = createMap(identity, identity);
const $$createType5 = OrchestrationStep.createFrom;
const $$createType6 = createArray($$createType5);
const $$createType7 = ToolPolicyRule.createFrom;
const $$createType8 = createArray($$createType7);
const $$createType9 = ScopePolicyRule.createFrom;
const $$createType10 = ProactiveConfig.createFrom;
const $$createType11 = ProactiveRecord.createFrom;
const $$createType12 = createArray($$createType11);
const $$createType13 = ProactiveFeedbackStats.createFrom;
const $$createType14 = SkillVariable.createFrom;
const $$createType15 = createArray($$createType14);
const $$createType16 = OrchestrationConfig.createFrom;
const $$createType17 = createNullable($$createType16);
const $$createType18 = SuggestionActionDef.createFrom;
const $$createType19 = createNullable($$createType18);
const $$createType20 = SupervisionEvent.createFrom;
const $$createType21 = createArray($$createType20);
const $$createType22 = BudgetStatus.createFrom;
const $$createType23 = createNullable($$createType22);
const $$createType24 = AuthConfig.createFrom;
const $$createType25 = LogConfig.createFrom;
const $$createType26 = TelemetryConfig.createFrom;
const $$createType27 = QueueConfig.createFrom;
const $$createType28 = WorkflowConfig.createFrom;
const $$createType29 = TaskDefaults.createFrom;
const $$createType30 = StorageConfig.createFrom;
const $$createType31 = FilewatchConfig.createFrom;
const $$createType32 = WorktreeConfig.createFrom;
const $$createType33 = ProviderConfig.createFrom;
const $$createType34 = BridgeConfig.createFrom;
const $$createType35 = MCPConfig.createFrom;
const $$createType36 = SkillConfig.createFrom;
const $$createType37 = RegistryConfig.createFrom;
const $$createType38 = NotificationConfig.createFrom;
const $$createType39 = TelegramConfig.createFrom;
const $$createType40 = UpdateConfig.createFrom;
const $$createType41 = TeamRoleDefinition.createFrom;
const $$createType42 = createArray($$createType41);
const $$createType43 = TeamMember.createFrom;
const $$createType44 = createArray($$createType43);
const $$createType45 = WorktreeDiffFile.createFrom;
const $$createType46 = createArray($$createType45);
