import {
  Activity, FileText, FileEdit, FilePlus, FileX, Terminal, Search,
  Wrench, AlertCircle, HelpCircle, MessageSquare, CheckCircle,
  ListChecks, BookOpen, Bot, Clock, HelpCircle as Unknown
} from 'lucide-react'

export const STATUS_COLORS: Record<string, string> = {
  starting: '#8B949E',
  running: '#3FB950',
  idle: '#58A6FF',
  waiting_input: '#D29922',
  paused: '#8B949E',
  completed: '#58A6FF',
  error: '#F85149',
  terminated: '#8B949E',
  interrupted: '#8B949E',
}

export const ACTIVITY_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  session_start:        { color: '#3FB950', label: '启动',     icon: Activity },
  thinking:             { color: '#BC8CFF', label: '思考',     icon: Bot },
  file_read:            { color: '#58A6FF', label: '读取',     icon: FileText },
  file_write:           { color: '#D2A8FF', label: '写入',     icon: FileEdit },
  file_create:          { color: '#3FB950', label: '创建文件', icon: FilePlus },
  file_delete:          { color: '#F85149', label: '删除文件', icon: FileX },
  command_execute:      { color: '#D29922', label: '命令',     icon: Terminal },
  command_output:       { color: '#8B949E', label: '命令输出', icon: Terminal },
  search:               { color: '#58A6FF', label: '搜索',     icon: Search },
  tool_use:             { color: '#D29922', label: '工具',     icon: Wrench },
  error:                { color: '#F85149', label: '错误',     icon: AlertCircle },
  waiting_confirmation: { color: '#D29922', label: '等待确认', icon: HelpCircle },
  user_input:           { color: '#58A6FF', label: '输入',     icon: MessageSquare },
  turn_complete:        { color: '#3FB950', label: '回合完成', icon: CheckCircle },
  task_complete:        { color: '#3FB950', label: '任务完成', icon: ListChecks },
  context_summary:      { color: '#8B949E', label: '上下文',   icon: BookOpen },
  assistant_message:    { color: '#58A6FF', label: '回复',     icon: Bot },
  idle:                 { color: '#8B949E', label: '空闲',     icon: Clock },
  unknown_activity:     { color: '#484F58', label: '未知',     icon: Unknown },
}
