import { describe, expect, it } from 'vitest'
import { getSessionParentId, isTopLevelSession } from '../utils'

describe('isTopLevelSession / getSessionParentId', () => {
  it('treats sessions without parent as top-level', () => {
    const session = { id: 'root-1' }
    expect(getSessionParentId(session)).toBe('')
    expect(isTopLevelSession(session)).toBe(true)
  })

  it('treats empty parentSessionId as top-level', () => {
    const session = { id: 'root-2', parentSessionId: '' }
    expect(isTopLevelSession(session)).toBe(true)
    expect(isTopLevelSession(session, { 'root-2': { parentSessionId: '' } })).toBe(true)
  })

  it('hides sessions with parentSessionId even when parent is absent from the list', () => {
    const orphan = { id: 'child-orphan', parentSessionId: 'deleted-parent' }
    // Parent not in childToParent and not present in any sessionIds set — still nested.
    expect(isTopLevelSession(orphan, {})).toBe(false)
    expect(getSessionParentId(orphan, {})).toBe('deleted-parent')
  })

  it('hides sessions bound only via childToParent', () => {
    const child = { id: 'child-map' }
    const childToParent = {
      'child-map': { parentSessionId: 'parent-still-or-not' },
    }
    expect(isTopLevelSession(child, childToParent)).toBe(false)
    expect(getSessionParentId(child, childToParent)).toBe('parent-still-or-not')
  })

  it('prefers childToParent over session.parentSessionId when both set', () => {
    const child = { id: 'child-both', parentSessionId: 'from-session' }
    const childToParent = {
      'child-both': { parentSessionId: 'from-map' },
    }
    expect(getSessionParentId(child, childToParent)).toBe('from-map')
    expect(isTopLevelSession(child, childToParent)).toBe(false)
  })

  it('filters a mixed list so orphans never surface as top-level', () => {
    const sessions = [
      { id: 'grandpa' },
      { id: 'father', parentSessionId: 'grandpa' },
      { id: 'son', parentSessionId: 'father' },
      { id: 'orphan', parentSessionId: 'gone' },
      { id: 'peer' },
    ]
    // Simulate parent already deleted: only orphan + peer remain in store for that branch.
    const remaining = sessions.filter((s) => s.id === 'orphan' || s.id === 'peer')
    const topLevel = remaining.filter((s) => isTopLevelSession(s))
    expect(topLevel.map((s) => s.id)).toEqual(['peer'])
  })
})
