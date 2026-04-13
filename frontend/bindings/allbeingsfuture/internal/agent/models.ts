// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { identity } from '../../../electron-api';

/**
 * AgentManager manages the lifecycle of spawned agent sessions.
 * It coordinates with ProcessService to create child CLI sessions,
 * tracks their state, and provides wait/cancel semantics.
 */
export class AgentManager {

    /** Creates a new AgentManager instance. */
    constructor($$source: Partial<AgentManager> = {}) {

        Object.assign(this, $$source);
    }

    /**
     * Creates a new AgentManager instance from a string or object.
     */
    static createFrom($$source: any = {}): AgentManager {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new AgentManager($$parsedSource as Partial<AgentManager>);
    }
}
