/**
 * Skill type definitions and (empty) built-in catalog.
 *
 * Built-in skills are intentionally not shipped. Users install their own
 * via Install / custom add. BUILTIN_SKILLS is kept as an empty array so
 * any residual imports resolve without re-seeding the registry.
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
  isEnabled?: boolean
  system?: boolean
  toolName?: string
  handler?: string
  path?: string
  rootDir?: string
  scripts?: string[]
  references?: string[]
  instructions?: string
  config?: Record<string, unknown>
}

/** Empty by product design — no pre-seeded skills. */
export const BUILTIN_SKILLS: SkillDef[] = []
