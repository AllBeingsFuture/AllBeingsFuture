/**
 * Built-in Skill Definitions
 * Auto-seeded into DB on startup (idempotent).
 */

export interface SkillVariable {
  name: string
  description: string
  required: boolean
  defaultValue?: string
  type?: 'text' | 'select' | 'multiline'
  options?: string[]
}

export interface SkillDef {
  id: string
  name: string
  description: string
  category: string
  slashCommand: string
  type: 'prompt' | 'native'
  compatibleProviders: string[] | 'all'
  promptTemplate: string
  systemPromptAddition?: string
  inputVariables?: SkillVariable[]
  source: 'builtin' | 'marketplace' | 'local' | 'custom'
  version: string
  author: string
  tags: string[]
}

export const BUILTIN_SKILLS: SkillDef[] = [
  {
    id: 'builtin-code-review',
    name: '代码审查',
    description: '对代码进行全面审查，涵盖逻辑、性能、安全性和可维护性',
    category: 'development',
    slashCommand: 'review',
    type: 'prompt',
    compatibleProviders: 'all',
    promptTemplate: `请对以下代码进行全面审查：

{{user_input}}

请从以下维度分析：
1. **逻辑正确性** - 是否存在逻辑错误或边界情况未处理
2. **性能** - 是否有性能瓶颈或可优化点
3. **安全性** - 是否有安全漏洞（注入、越权、数据泄露等）
4. **可读性** - 命名、注释、结构是否清晰
5. **可维护性** - 是否符合最佳实践，是否便于扩展

请以结构化格式输出审查结果，并给出具体的改进建议（附代码示例）。`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['code', 'review', 'quality'],
  },
  {
    id: 'builtin-translate',
    name: '翻译',
    description: '将内容翻译为指定语言，保持原文语气和格式（默认中英互译）',
    category: 'language',
    slashCommand: 'translate',
    type: 'prompt',
    compatibleProviders: 'all',
    inputVariables: [
      {
        name: 'lang',
        description: '目标语言',
        required: false,
        defaultValue: '中文',
        type: 'select',
        options: ['中文', '英文', '日语', '韩语', '法语', '德语', '西班牙语', '俄语'],
      },
    ],
    promptTemplate: `请将以下内容翻译为{{lang}}，保持原文的语气、风格和格式：

{{user_input}}

注意：
- 专业术语保持准确
- 不要过度意译，尊重原文表达
- 如有歧义，优先参考上下文`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['language', 'translation'],
  },
  {
    id: 'builtin-explain',
    name: '解释代码',
    description: '用通俗易懂的语言解释代码的功能和实现原理',
    category: 'development',
    slashCommand: 'explain',
    type: 'prompt',
    compatibleProviders: 'all',
    promptTemplate: `请解释以下代码：

{{user_input}}

请包含：
1. **整体功能**（1-2 句话概括）
2. **关键逻辑步骤**（按执行顺序说明）
3. **使用的主要技术/模式**
4. **潜在注意事项**（边界情况、副作用等）

用通俗易懂的语言，适合中等水平开发者理解。`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['code', 'explain', 'learning'],
  },
  {
    id: 'builtin-write-test',
    name: '生成测试',
    description: '为代码或函数生成完整的单元测试',
    category: 'development',
    slashCommand: 'test',
    type: 'prompt',
    compatibleProviders: 'all',
    inputVariables: [
      {
        name: 'framework',
        description: '测试框架',
        required: false,
        defaultValue: 'jest',
        type: 'select',
        options: ['jest', 'vitest', 'mocha', 'pytest', 'unittest', 'go test', 'JUnit'],
      },
    ],
    promptTemplate: `请为以下代码使用 {{framework}} 编写完整的单元测试：

{{user_input}}

测试要求：
- 覆盖正常流程、边界情况和异常情况
- 测试命名清晰描述意图（given-when-then 风格）
- 使用 {{framework}} 的最佳实践
- 包含必要的 mock 和 stub
- 目标测试覆盖率 >= 80%`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['testing', 'code', 'quality'],
  },
  {
    id: 'builtin-write-doc',
    name: '生成文档',
    description: '为代码、函数或模块生成文档注释',
    category: 'documentation',
    slashCommand: 'doc',
    type: 'prompt',
    compatibleProviders: 'all',
    inputVariables: [
      {
        name: 'style',
        description: '文档风格',
        required: false,
        defaultValue: 'JSDoc',
        type: 'select',
        options: ['JSDoc', 'TSDoc', 'Docstring (Python)', 'GoDoc', 'Markdown README'],
      },
    ],
    promptTemplate: `请为以下代码生成 {{style}} 格式的文档注释：

{{user_input}}

文档需包含：
- 简短描述（一句话说明用途）
- 参数说明（类型、含义、是否可选）
- 返回值说明
- 使用示例（如适用）
- 注意事项（如异常情况、副作用等）`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['documentation', 'code'],
  },
  {
    id: 'builtin-refactor',
    name: '重构',
    description: '分析代码并给出具体重构建议，提升代码质量',
    category: 'development',
    slashCommand: 'refactor',
    type: 'prompt',
    compatibleProviders: 'all',
    promptTemplate: `请分析以下代码并给出具体的重构建议：

{{user_input}}

重点关注：
- **消除重复**（DRY 原则）
- **简化复杂逻辑**（降低圈复杂度）
- **改善命名和抽象**（提升可读性）
- **应用合适的设计模式**

对每个建议：
1. 说明当前问题
2. 解释重构理由
3. 提供重构后的代码示例`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['refactoring', 'code', 'quality'],
  },
  {
    id: 'builtin-commit-msg',
    name: '提交信息',
    description: '根据代码改动生成规范的 Git commit message',
    category: 'git',
    slashCommand: 'commit-msg',
    type: 'prompt',
    compatibleProviders: 'all',
    promptTemplate: `请根据以下代码改动生成规范的 Git commit message：

{{user_input}}

要求：
- 遵循 Conventional Commits 规范：<type>(<scope>): <description>
- type 选项：feat/fix/chore/docs/refactor/test/style/perf/ci
- 标题简洁（中文 <= 30 字，英文 <= 72 字符）
- 如有必要，添加详细描述（body）说明原因和影响
- 中文描述优先`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['git', 'commit'],
  },
  {
    id: 'builtin-debug',
    name: '调试',
    description: '分析错误信息和代码，帮助定位和解决 Bug',
    category: 'development',
    slashCommand: 'debug',
    type: 'prompt',
    compatibleProviders: 'all',
    promptTemplate: `请帮我分析以下问题：

{{user_input}}

请：
1. **分析可能的根本原因**（列出所有可能性，按可能性排序）
2. **指出最可能的原因**及判断依据
3. **给出具体的修复方案**（附代码示例）
4. **提供预防建议**（如何避免此类问题再次出现）

如果信息不足，请告诉我需要提供什么额外信息。`,
    source: 'builtin',
    version: '1.0.0',
    author: 'AllBeingsFuture',
    tags: ['debug', 'bug', 'troubleshoot'],
  },
]
