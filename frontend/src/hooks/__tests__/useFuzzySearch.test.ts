import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from '../useFuzzySearch'

describe('fuzzyMatch', () => {
  it('highlights matched characters in order', () => {
    const result = fuzzyMatch('abc', 'a_b_c.txt')
    expect(result).not.toBeNull()
    expect(result!.highlights).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ])
  })
})
