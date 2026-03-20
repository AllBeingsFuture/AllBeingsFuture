/** 工作区仓库条目 */
export interface WorkspaceRepo {
  id: string
  workspaceId: string
  /** git 仓库绝对路径 */
  repoPath: string
  /** 显示名称 */
  name: string
  /** 是否为主仓库（AI 会话的实际 workDir） */
  isPrimary: boolean
  /** 排序顺序 */
  sortOrder: number
}

/** 工作区（一组相关 git 仓库的命名集合） */
export interface Workspace {
  id: string
  name: string
  description?: string
  /** 父目录路径（可选，仅用于展示） */
  rootPath?: string
  repos: WorkspaceRepo[]
  createdAt: string
  updatedAt: string
}
