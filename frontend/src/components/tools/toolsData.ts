/**
 * AllBeingsFuture 内置工具目录数据
 *
 * 96 款实用工具，覆盖文件管理、浏览器自动化、桌面自动化、
 * 网络搜索、定时任务、MCP 扩展程序等 16 大类别。
 */

export interface ToolItem {
  name: string
  description: string
}

export interface ToolCategory {
  id: string
  label: string
  labelEn: string
  icon: string        // lucide icon name
  color: string       // tailwind accent color class
  tools: ToolItem[]
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'filesystem',
    label: '文件系统',
    labelEn: 'File System',
    icon: 'FolderOpen',
    color: 'text-blue-400',
    tools: [
      { name: 'run_shell', description: '执行 Shell 命令 — 运行脚本、安装依赖、执行系统命令' },
      { name: 'write_file', description: '写入/创建文件内容' },
      { name: 'read_file', description: '读取文件内容，支持分页浏览（默认前 300 行）' },
      { name: 'list_directory', description: '列出目录内容，包括文件和子目录（默认 200 项）' },
    ],
  },
  {
    id: 'browser',
    label: '浏览器自动化',
    labelEn: 'Browser',
    icon: 'Globe',
    color: 'text-cyan-400',
    tools: [
      { name: 'browser_task', description: '智能浏览器任务 — 委托 browser-use Agent 处理复杂多步交互' },
      { name: 'browser_open', description: '启动浏览器或检查浏览器状态' },
      { name: 'browser_navigate', description: '导航到指定 URL，推荐用于搜索任务' },
      { name: 'browser_get_content', description: '提取当前网页的页面内容和元素文本' },
      { name: 'browser_screenshot', description: '截取浏览器页面截图' },
      { name: 'view_image', description: '查看和分析本地图片文件' },
      { name: 'browser_close', description: '关闭浏览器并释放资源' },
    ],
  },
  {
    id: 'desktop',
    label: '桌面自动化',
    labelEn: 'Desktop',
    icon: 'Monitor',
    color: 'text-purple-400',
    tools: [
      { name: 'desktop_click', description: '在指定坐标执行鼠标点击' },
      { name: 'desktop_type', description: '模拟键盘输入文本' },
      { name: 'desktop_screenshot', description: '截取桌面屏幕截图' },
      { name: 'desktop_hotkey', description: '执行键盘快捷键组合' },
      { name: 'desktop_scroll', description: '模拟鼠标滚轮滚动' },
      { name: 'desktop_find_element', description: '通过 UI 自动化定位界面元素' },
      { name: 'desktop_get_active_window', description: '获取当前活动窗口信息' },
      { name: 'desktop_launch_app', description: '启动桌面应用程序' },
    ],
  },
  {
    id: 'web_search',
    label: '网络搜索',
    labelEn: 'Web Search',
    icon: 'Search',
    color: 'text-green-400',
    tools: [
      { name: 'web_search', description: '使用 DuckDuckGo 进行网页搜索' },
      { name: 'news_search', description: '使用 DuckDuckGo 搜索新闻' },
    ],
  },
  {
    id: 'memory',
    label: '记忆系统',
    labelEn: 'Memory',
    icon: 'Brain',
    color: 'text-pink-400',
    tools: [
      { name: 'add_memory', description: '将重要信息记录到长期记忆中' },
      { name: 'search_memory', description: '按关键词和类型过滤搜索相关记忆' },
      { name: 'get_memory_stats', description: '获取记忆系统统计信息' },
      { name: 'consolidate_memories', description: '手动触发记忆整合与 LLM 驱动的清理' },
      { name: 'list_recent_tasks', description: '列出最近完成的任务/情节' },
      { name: 'search_conversation_traces', description: '搜索完整对话历史，包括工具调用和结果' },
      { name: 'trace_memory', description: '跨记忆层追溯：从记忆 ID 回溯到源对话' },
    ],
  },
  {
    id: 'skills',
    label: '技能管理',
    labelEn: 'Skills',
    icon: 'Puzzle',
    color: 'text-amber-400',
    tools: [
      { name: 'list_skills', description: '列出所有已安装的技能' },
      { name: 'get_skill_info', description: '获取技能的详细说明和使用指南' },
      { name: 'run_skill_script', description: '运行技能预置的脚本文件' },
      { name: 'get_skill_reference', description: '获取技能参考文档' },
      { name: 'install_skill', description: '从 URL 或 Git 仓库安装技能' },
      { name: 'load_skill', description: '从 skills/ 目录加载新创建的技能' },
      { name: 'reload_skill', description: '重新加载已修改的技能以应用更改' },
      { name: 'manage_skill_enabled', description: '启用或禁用外部技能' },
    ],
  },
  {
    id: 'scheduled',
    label: '定时任务',
    labelEn: 'Scheduled',
    icon: 'Clock',
    color: 'text-orange-400',
    tools: [
      { name: 'schedule_task', description: '创建定时任务或提醒' },
      { name: 'list_scheduled_tasks', description: '列出所有定时任务及其状态和下次执行时间' },
      { name: 'cancel_scheduled_task', description: '永久删除定时任务' },
      { name: 'update_scheduled_task', description: '修改定时任务设置（不删除）' },
      { name: 'trigger_scheduled_task', description: '立即触发定时任务，无需等待计划时间' },
    ],
  },
  {
    id: 'agent',
    label: '多 Agent 协作',
    labelEn: 'Agent',
    icon: 'Network',
    color: 'text-indigo-400',
    tools: [
      { name: 'delegate_to_agent', description: '将任务委派给已有的专业 Agent' },
      { name: 'spawn_agent', description: '从现有 Agent 档案继承创建临时 Agent' },
      { name: 'delegate_parallel', description: '并行委派任务给多个 Agent' },
      { name: 'create_agent', description: '从零开始创建全新的 Agent' },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP 扩展程序',
    labelEn: 'MCP',
    icon: 'Plug',
    color: 'text-teal-400',
    tools: [
      { name: 'call_mcp_tool', description: '调用 MCP 服务器工具以扩展能力' },
      { name: 'list_mcp_servers', description: '列出所有配置的 MCP 服务器及连接状态' },
      { name: 'get_mcp_instructions', description: '获取 MCP 服务器的详细使用说明' },
      { name: 'add_mcp_server', description: '添加/安装新的 MCP 服务器配置' },
      { name: 'remove_mcp_server', description: '移除 MCP 服务器配置' },
      { name: 'connect_mcp_server', description: '连接到已配置的 MCP 服务器' },
      { name: 'disconnect_mcp_server', description: '断开与 MCP 服务器的连接' },
      { name: 'reload_mcp_servers', description: '从磁盘重新加载所有 MCP 服务器配置' },
    ],
  },
  {
    id: 'im_channel',
    label: 'IM 通道',
    labelEn: 'IM Channel',
    icon: 'MessageSquare',
    color: 'text-sky-400',
    tools: [
      { name: 'deliver_artifacts', description: '通过网关向 IM 聊天发送文件/图片/语音' },
      { name: 'get_voice_file', description: '获取用户发送的语音消息本地文件路径' },
      { name: 'get_image_file', description: '获取用户发送的图片本地文件路径' },
      { name: 'get_chat_history', description: '获取当前聊天历史记录' },
      { name: 'get_chat_info', description: '获取当前聊天/群组信息' },
      { name: 'get_user_info', description: '根据用户 ID 获取用户信息' },
      { name: 'get_chat_members', description: '获取当前群聊的成员列表' },
      { name: 'get_recent_messages', description: '获取聊天的最新消息' },
    ],
  },
  {
    id: 'plan',
    label: '任务计划',
    labelEn: 'Plan',
    icon: 'ListChecks',
    color: 'text-emerald-400',
    tools: [
      { name: 'create_plan', description: '创建任务执行计划 — 多步骤任务必须首先调用' },
      { name: 'update_plan_step', description: '更新计划步骤的状态' },
      { name: 'get_plan_status', description: '获取当前计划的执行状态' },
      { name: 'complete_plan', description: '标记计划完成并生成总结报告' },
    ],
  },
  {
    id: 'system',
    label: '系统功能',
    labelEn: 'System',
    icon: 'Cpu',
    color: 'text-slate-400',
    tools: [
      { name: 'ask_user', description: '向用户提问并暂停执行直到回复' },
      { name: 'enable_thinking', description: '控制深度思考模式的开关' },
      { name: 'get_session_logs', description: '获取当前会话的系统日志' },
      { name: 'get_tool_info', description: '获取系统工具的详细参数定义' },
      { name: 'generate_image', description: '使用配置的图像模型 API 从文本提示生成图片' },
      { name: 'set_task_timeout', description: '调整当前任务的超时策略' },
      { name: 'get_workspace_map', description: '获取工作区目录结构和关键路径描述' },
    ],
  },
  {
    id: 'persona',
    label: '人格系统',
    labelEn: 'Persona',
    icon: 'Sparkles',
    color: 'text-rose-400',
    tools: [
      { name: 'switch_persona', description: '切换到预设的人格角色' },
      { name: 'update_persona_trait', description: '更新特定的人格偏好维度' },
      { name: 'toggle_proactive', description: '开关主动/生活陪伴模式' },
      { name: 'get_persona_profile', description: '获取当前完整的人格档案' },
    ],
  },
  {
    id: 'profile',
    label: '用户档案',
    labelEn: 'Profile',
    icon: 'UserCircle',
    color: 'text-violet-400',
    tools: [
      { name: 'update_user_profile', description: '更新结构化用户档案字段（姓名、领域、系统、IDE 等）' },
      { name: 'skip_profile_question', description: '当用户明确拒绝回答时跳过档案问题' },
      { name: 'get_user_profile', description: '获取当前用户档案摘要' },
    ],
  },
  {
    id: 'agent_hub',
    label: 'Agent 商店',
    labelEn: 'Agent Hub',
    icon: 'Store',
    color: 'text-fuchsia-400',
    tools: [
      { name: 'search_hub_agents', description: '在 AllBeingsFuture 平台 Agent 商店中搜索 Agent' },
      { name: 'install_hub_agent', description: '从 AllBeingsFuture 平台 Agent 商店下载并安装 Agent' },
      { name: 'publish_agent', description: '将本地 Agent 发布到 AllBeingsFuture 平台 Agent 商店' },
      { name: 'get_hub_agent_detail', description: '获取 AllBeingsFuture 平台上特定 Agent 的详细信息' },
    ],
  },
  {
    id: 'agent_package',
    label: 'Agent 导入导出',
    labelEn: 'Agent Package',
    icon: 'Package',
    color: 'text-lime-400',
    tools: [
      { name: 'export_agent', description: '将本地 Agent 导出为可移植的 .abf-agent 包文件' },
      { name: 'import_agent', description: '从 .abf-agent 包文件导入 Agent' },
      { name: 'list_exportable_agents', description: '列出所有可导出为 .abf-agent 包的 Agent 档案' },
      { name: 'inspect_agent_package', description: '预览 .abf-agent 包文件的内容（不安装）' },
      { name: 'batch_export_agents', description: '批量导出多个 Agent' },
    ],
  },
  {
    id: 'skill_store',
    label: '技能商店',
    labelEn: 'Skill Store',
    icon: 'ShoppingBag',
    color: 'text-yellow-400',
    tools: [
      { name: 'search_store_skills', description: '在 AllBeingsFuture 平台技能商店中搜索技能' },
      { name: 'install_store_skill', description: '从 AllBeingsFuture 平台技能商店安装技能' },
      { name: 'get_store_skill_detail', description: '获取 AllBeingsFuture 平台上特定技能的详细信息' },
      { name: 'submit_skill_repo', description: '提交 GitHub 仓库到 AllBeingsFuture 技能商店索引' },
    ],
  },
  {
    id: 'config',
    label: '系统配置',
    labelEn: 'Config',
    icon: 'Settings',
    color: 'text-neutral-400',
    tools: [
      { name: 'system_config', description: '统一系统配置工具 — 查看/修改设置、LLM 端点、UI 偏好' },
    ],
  },
]

/** 工具总数 */
export const TOTAL_TOOL_COUNT = TOOL_CATEGORIES.reduce((sum, cat) => sum + cat.tools.length, 0)

/** 分类总数 */
export const TOTAL_CATEGORY_COUNT = TOOL_CATEGORIES.length
