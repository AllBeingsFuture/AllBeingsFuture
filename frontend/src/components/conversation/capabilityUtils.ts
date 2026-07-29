import type { Skill } from '../../stores/skillStore'

/**
 * Parse an in-progress slash query from the composer text.
 * Returns the command fragment (without leading `/`) while the user is still
 * typing the command token; returns null once args/space appear or text
 * does not start with `/`.
 */
export function getSlashQuery(text: string): string | null {
  if (!text.startsWith('/')) return null
  const rest = text.slice(1)
  if (rest.includes(' ') || rest.includes('\n') || rest.includes('\t')) return null
  return rest.toLowerCase()
}

/**
 * Filter enabled skills whose slash command matches the in-progress query.
 */
export function filterSlashSkills(skills: Skill[], query: string | null): Skill[] {
  if (query === null) return []
  return skills.filter((skill) => {
    if (!skill.enabled) return false
    const cmd = (skill.slashCommand || '').trim().toLowerCase()
    if (!cmd) return false
    return query.length === 0 || cmd.startsWith(query) || skill.name.toLowerCase().includes(query)
  })
}

export function countEnabled(items: Array<{ enabled: boolean }>): number {
  return items.reduce((n, item) => n + (item.enabled ? 1 : 0), 0)
}
