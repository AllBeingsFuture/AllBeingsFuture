/**
 * SkillEngine - Template expansion, variable parsing, slash command handling
 */

import type { SkillDef, SkillVariable } from './builtin-skills.js'

export interface SkillExecuteResult {
  success: boolean
  /** The expanded prompt text, ready to send to AI */
  prompt: string
  /** The matched skill definition */
  skill: SkillDef
  /** Any missing required variables */
  missingVariables: string[]
  /** Error message if failed */
  error?: string
}

export interface SlashCommandMatch {
  matched: boolean
  skill?: SkillDef
  /** The text after the /command (user input portion) */
  remainingInput: string
}

export class SkillEngine {
  private skills: SkillDef[] = []

  /**
   * Load skills into the engine.
   * Call this with all available skills (builtin + user-defined from DB).
   */
  loadSkills(skills: SkillDef[]): void {
    this.skills = skills
  }

  /**
   * Expand a skill's prompt template with variables.
   * Replaces {{variable}} placeholders with provided values or defaults.
   */
  expandTemplate(template: string, variables: Record<string, string>): string {
    let prompt = template

    // Replace provided variables
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }

    // Remove any remaining unreplaced placeholders
    prompt = prompt.replace(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g, '')

    return prompt.trim()
  }

  /**
   * Parse --key=value or --key="value with spaces" from user input.
   * Only parses variables defined in the skill definition.
   * Returns parsed variables and remaining text.
   */
  parseVariablesFromInput(
    userInput: string,
    skillDef: SkillDef,
  ): { parsedVariables: Record<string, string>; remainingInput: string } {
    const parsedVariables: Record<string, string> = {}
    let remaining = userInput

    if (!skillDef.inputVariables || skillDef.inputVariables.length === 0) {
      return { parsedVariables, remainingInput: remaining }
    }

    // Match --varname=value or --varname="value with spaces"
    const varPattern = /--(\w+)=(?:"([^"]*)"|(\S+))/g
    const matches = [...userInput.matchAll(varPattern)]

    for (const match of matches) {
      const varName = match[1]
      const varValue = match[2] ?? match[3] ?? ''
      // Only parse variables defined in the skill
      if (skillDef.inputVariables.some((v: SkillVariable) => v.name === varName)) {
        parsedVariables[varName] = varValue
        remaining = remaining.replace(match[0], '').trim()
      }
    }

    return { parsedVariables, remainingInput: remaining }
  }

  /**
   * Execute a skill: parse input, expand template, return ready-to-send prompt.
   */
  executeSkill(skillId: string, userInput: string): SkillExecuteResult {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) {
      return {
        success: false,
        prompt: '',
        skill: undefined as any,
        missingVariables: [],
        error: `Skill not found: ${skillId}`,
      }
    }

    if (!skill.promptTemplate) {
      // No template, return the user input as-is
      return {
        success: true,
        prompt: userInput,
        skill,
        missingVariables: [],
      }
    }

    // Parse variables from input
    const { parsedVariables, remainingInput } = this.parseVariablesFromInput(userInput, skill)

    // Build the full variables map: user_input + parsed vars + defaults
    const allVariables: Record<string, string> = {
      user_input: remainingInput,
      input: remainingInput,
      ...parsedVariables,
    }

    // Fill in defaults for variables not provided
    if (skill.inputVariables) {
      for (const variable of skill.inputVariables) {
        if (!allVariables[variable.name] && variable.defaultValue !== undefined) {
          allVariables[variable.name] = variable.defaultValue
        }
      }
    }

    // Validate required variables
    const missingVariables = this.validateVariables(skill, allVariables)

    // Expand template
    let prompt = this.expandTemplate(skill.promptTemplate, allVariables)

    // Prepend system prompt addition if defined
    if (skill.systemPromptAddition) {
      prompt = `${skill.systemPromptAddition}\n\n${prompt}`
    }

    return {
      success: missingVariables.length === 0,
      prompt,
      skill,
      missingVariables,
      error: missingVariables.length > 0
        ? `Missing required variables: ${missingVariables.join(', ')}`
        : undefined,
    }
  }

  /**
   * Get all loaded skills.
   */
  listAvailableSkills(): SkillDef[] {
    return this.skills.filter(s => s.type === 'prompt' || s.type === 'native')
  }

  /**
   * Match user input starting with / to a skill.
   * Input like "/review some code here" matches the skill with slashCommand "review".
   */
  matchSlashCommand(input: string): SlashCommandMatch {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/')) {
      return { matched: false, remainingInput: trimmed }
    }

    // Extract the command name: /command-name rest of text
    const spaceIdx = trimmed.indexOf(' ')
    const command = spaceIdx === -1
      ? trimmed.slice(1)
      : trimmed.slice(1, spaceIdx)
    const remainingInput = spaceIdx === -1
      ? ''
      : trimmed.slice(spaceIdx + 1).trim()

    // Find matching skill
    const skill = this.skills.find(
      s => s.slashCommand === command && s.type === 'prompt'
    )

    if (skill) {
      return { matched: true, skill, remainingInput }
    }

    return { matched: false, remainingInput: trimmed }
  }

  /**
   * Validate that all required variables are provided.
   * Returns list of missing required variable names.
   */
  private validateVariables(skill: SkillDef, provided: Record<string, string>): string[] {
    if (!skill.inputVariables) return []
    return skill.inputVariables
      .filter(v => v.required && !provided[v.name] && !v.defaultValue)
      .map(v => v.name)
  }
}
