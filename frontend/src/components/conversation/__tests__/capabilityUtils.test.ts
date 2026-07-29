import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../stores/skillStore'
import { countEnabled, filterSlashSkills, getSlashQuery } from '../capabilityUtils'

const skills: Skill[] = [
  {
    id: '1',
    name: 'Code Review',
    description: 'Review code',
    category: 'dev',
    type: 'prompt',
    source: 'builtin',
    system: true,
    slashCommand: 'review',
    enabled: true,
  },
  {
    id: '2',
    name: 'Translate',
    description: 'Translate text',
    category: 'writing',
    type: 'prompt',
    source: 'builtin',
    system: true,
    slashCommand: 'translate',
    enabled: false,
  },
  {
    id: '3',
    name: 'Debug Helper',
    description: 'Debug issues',
    category: 'dev',
    type: 'prompt',
    source: 'custom',
    system: false,
    slashCommand: 'debug',
    enabled: true,
  },
]

describe('getSlashQuery', () => {
  it('returns null when text is not a slash command in progress', () => {
    expect(getSlashQuery('hello')).toBeNull()
    expect(getSlashQuery('')).toBeNull()
    expect(getSlashQuery('/review some code')).toBeNull()
    expect(getSlashQuery('/review\n')).toBeNull()
  })

  it('returns the command fragment while typing', () => {
    expect(getSlashQuery('/')).toBe('')
    expect(getSlashQuery('/re')).toBe('re')
    expect(getSlashQuery('/Review')).toBe('review')
  })
})

describe('filterSlashSkills', () => {
  it('returns empty when query is null', () => {
    expect(filterSlashSkills(skills, null)).toEqual([])
  })

  it('lists only enabled skills matching the prefix', () => {
    const matches = filterSlashSkills(skills, 're')
    expect(matches.map((s) => s.id)).toEqual(['1'])
  })

  it('returns all enabled slash skills for empty query', () => {
    const matches = filterSlashSkills(skills, '')
    expect(matches.map((s) => s.slashCommand)).toEqual(['review', 'debug'])
  })
})

describe('countEnabled', () => {
  it('counts enabled items', () => {
    expect(countEnabled(skills)).toBe(2)
    expect(countEnabled([])).toBe(0)
  })
})
