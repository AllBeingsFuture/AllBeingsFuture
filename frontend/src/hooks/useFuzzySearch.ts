/**
 * Fuzzy 搜索 Hook — 自实现 fuzzy matching，含评分和高亮区间
 * 用于 Quick Open 文件名搜索
 */

import { useMemo } from 'react'

/** 匹配高亮区间 [start, end) */
export interface HighlightRange {
  start: number
  end: number
}

export interface FuzzyMatchResult<T> {
  item: T
  score: number
  highlights: HighlightRange[]
}

/**
 * 对单个目标字符串进行 fuzzy 匹配
 * @returns null 表示不匹配；否则返回评分和高亮区间
 */
export function fuzzyMatch(query: string, target: string): { score: number; highlights: HighlightRange[] } | null {
  if (!query) return { score: 0, highlights: [] }

  const queryLower = query.toLowerCase()
  const targetLower = target.toLowerCase()

  // 快速检查：query 中每个字符都必须在 target 中出现（按顺序）
  let qi = 0
  for (let ti = 0; ti < targetLower.length && qi < queryLower.length; ti++) {
    if (targetLower[ti] === queryLower[qi]) qi++
  }
  if (qi < queryLower.length) return null

  // 计算评分和高亮区间
  let score = 0
  const highlights: HighlightRange[] = []
  qi = 0

  let consecutiveMatches = 0
  let lastMatchIdx = -2

  for (let ti = 0; ti < targetLower.length && qi < queryLower.length; ti++) {
    if (targetLower[ti] === queryLower[qi]) {
      // 基础匹配分
      score += 1

      // 连续匹配加分
      if (ti === lastMatchIdx + 1) {
        consecutiveMatches++
        score += consecutiveMatches * 2
      } else {
        consecutiveMatches = 0
      }

      // 词边界匹配加分（首字符、大小写字母、分隔符后）
      if (ti === 0) {
        score += 8 // 首字符匹配
      } else {
        const prevChar = target[ti - 1]
        const currChar = target[ti]
        // 驼峰边界或分隔符后
        if (
          prevChar === '/' || prevChar === '\\' || prevChar === '.' ||
          prevChar === '-' || prevChar === '_' || prevChar === ' ' ||
          (prevChar === prevChar.toLowerCase() && currChar === currChar.toUpperCase() && currChar !== currChar.toLowerCase())
        ) {
          score += 6
        }
      }

      // 精确大小写匹配加分
      if (target[ti] === query[qi]) {
        score += 1
      }

      // 收集高亮区间（合并相邻）
      if (highlights.length > 0 && highlights[highlights.length - 1].end === ti) {
        highlights[highlights.length - 1].end = ti + 1
      } else {
        highlights.push({ start: ti, end: ti + 1 })
      }

      lastMatchIdx = ti
      qi++
    }
  }

  // 惩罚未匹配字符（target 越长惩罚越大）
  score -= (target.length - query.length) * 0.5

  // 文件名（最后一个路径段）匹配加权
  const lastSep = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))
  const filename = lastSep >= 0 ? target.substring(lastSep + 1) : target
  const filenameLower = filename.toLowerCase()

  // 如果查询完全匹配文件名前缀，大幅加分
  if (filenameLower.startsWith(queryLower)) {
    score += 20
  } else if (filenameLower.includes(queryLower)) {
    score += 10
  }

  return { score, highlights }
}

/**
 * 对列表进行 fuzzy 搜索，返回匹配结果（按评分降序排列）
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  maxResults = 50
): FuzzyMatchResult<T>[] {
  if (!query.trim()) return items.slice(0, maxResults).map(item => ({ item, score: 0, highlights: [] }))

  const results: FuzzyMatchResult<T>[] = []

  for (const item of items) {
    const text = getText(item)
    const match = fuzzyMatch(query, text)
    if (match) {
      results.push({ item, score: match.score, highlights: match.highlights })
    }
  }

  results.sort((a, b) => b.score - a.score)

  return results.slice(0, maxResults)
}

/**
 * React Hook：对列表进行 fuzzy 搜索（自动 memo）
 */
export function useFuzzySearch<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  maxResults = 50
): FuzzyMatchResult<T>[] {
  return useMemo(
    () => fuzzyFilter(items, query, getText, maxResults),
    [items, query, getText, maxResults]
  )
}
