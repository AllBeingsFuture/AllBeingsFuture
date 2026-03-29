import type { WorkbenchCommand, WorkbenchCommandHandler } from './types'

class WorkbenchCommandBus {
  private handlers = new Set<WorkbenchCommandHandler>()

  subscribe(handler: WorkbenchCommandHandler) {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  async dispatch(command: WorkbenchCommand) {
    let lastResult: unknown
    for (const handler of this.handlers) {
      lastResult = await handler(command)
    }
    return lastResult
  }
}

export const workbenchCommandBus = new WorkbenchCommandBus()
