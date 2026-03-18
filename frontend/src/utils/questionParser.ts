/**
 * Interactive Question Parser
 *
 * Detects when AI output contains interactive questions with numbered options,
 * yes/no questions, or multiple-choice patterns. Ported from SpectrAI's
 * parseInteractiveQuestion logic and adapted for AllBeingsFuture.
 */

export type QuestionType = 'numbered' | 'yesno' | 'choice'

export interface ParsedQuestion {
  type: QuestionType
  /** The detected question text */
  question: string
  /** Option labels the user can click */
  options: string[]
}

/**
 * Returns true if the line looks like code rather than natural language.
 * Used to filter out false positives from code blocks.
 */
function isCodeLikeLine(line: string): boolean {
  // Inline code containing file paths
  if (/`[^`]*\/[^`]+`/.test(line)) return true
  // Bare file paths with common extensions
  if (/\b[\w-]+\/[\w./%-]+\.(ts|tsx|js|jsx|mjs|css|scss|less|json|py|go|rs|vue|md|html)\b/.test(line)) return true
  // Fenced code block markers
  if (/^```/.test(line)) return true
  return false
}

/**
 * Returns true if a question-like line is actually code (e.g. a function call).
 */
function isCodeLikeQuestion(line: string): boolean {
  if (/[a-z][A-Z]/.test(line) && /\(.*\)/.test(line)) return true
  if (/[=>{}<]/.test(line) && /[();]/.test(line)) return true
  return false
}

/**
 * Parse AI assistant text to detect interactive questions with options.
 *
 * Detection patterns:
 * 1. Numbered lists: "1. Option A\n2. Option B\n3. Option C"
 * 2. Yes/No questions: patterns ending with question marks that indicate binary choice
 * 3. Letter choice: "[A] ... [B] ... [C] ..." or "(A) ... (B) ..."
 *
 * @param text  The AI assistant message content
 * @returns Parsed question with type and options, or null if none detected
 */
export function parseInteractiveQuestion(text: string): ParsedQuestion | null {
  if (!text || text.length < 10) return null

  // Strip fenced code blocks to avoid false positives
  const textWithoutCode = text.replace(/```[\s\S]*?```/g, '')
  const lines = textWithoutCode
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // Regex for common question keywords (Chinese + English)
  const questionKeywordRe =
    /^(请选择|请问|你想|您想|哪种|哪个|which|what|how|choose|select|prefer)/i

  // Find the last natural-language question line
  let questionIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i]
    if (isCodeLikeQuestion(t)) continue
    if (t.includes('?') || t.includes('？') || questionKeywordRe.test(t)) {
      questionIdx = i
      break
    }
  }
  if (questionIdx === -1) return null

  const questionLine = lines[questionIdx]

  // ---- Yes/No Detection ----
  const isNearEnd = questionIdx >= lines.length - 3
  const yesNoPatterns =
    // Chinese yes/no patterns
    /[吗吧呢][?？]\s*$/.test(questionLine) ||
    /(?:是否|要不要|需不需要|能不能|可不可以|行不行).*(?:[?？]|$)/.test(questionLine) ||
    // English yes/no patterns
    /^(do you|should i|would you like|can i|are you|shall i|will you)/i.test(questionLine) ||
    // Explicit y/n markers
    /\(y\/n\)/i.test(questionLine) ||
    /\byes\s*\/\s*no\b/i.test(questionLine) ||
    /是\s*\/\s*否/.test(questionLine)

  if (yesNoPatterns && isNearEnd) {
    return {
      type: 'yesno',
      question: questionLine,
      options: ['是的', '不用了'],
    }
  }

  // ---- Letter Choice Detection: [A] ... [B] ... or (A) ... (B) ... ----
  const choiceRe = /^\[([A-Za-z])\]\s+(.{1,80})$|^\(([A-Za-z])\)\s+(.{1,80})$/
  const choiceOptions: string[] = []
  for (let i = questionIdx + 1; i < lines.length && choiceOptions.length < 6; i++) {
    const line = lines[i]
    if (isCodeLikeLine(line)) break
    const m = line.match(choiceRe)
    if (!m) break
    // Group 2 or 4 depending on which alternative matched
    choiceOptions.push((m[2] || m[4]).trim())
  }
  // Also try looking before the question
  if (choiceOptions.length < 2) {
    choiceOptions.length = 0
    for (let i = questionIdx - 1; i >= 0 && choiceOptions.length < 6; i--) {
      const line = lines[i]
      if (isCodeLikeLine(line)) break
      const m = line.match(choiceRe)
      if (!m) break
      choiceOptions.unshift((m[2] || m[4]).trim())
    }
  }
  if (choiceOptions.length >= 2 && choiceOptions.length <= 6) {
    return {
      type: 'choice',
      question: questionLine,
      options: choiceOptions,
    }
  }

  // ---- Numbered List Detection: 1. Option / 1) Option ----
  const optionRe = /^(?:\d+[.)]\s+|[A-Za-z][.)]\s+|\([A-Za-z\d]\)\s+)(.{1,80})$/
  const collectContiguousOptions = (start: number, step: 1 | -1): string[] => {
    const result: string[] = []
    let i = start
    while (i >= 0 && i < lines.length && result.length < 6) {
      const line = lines[i]
      if (isCodeLikeLine(line)) break
      const m = line.match(optionRe)
      if (!m) break
      result.push(m[1].trim())
      i += step
    }
    return result
  }

  const beforeOptions = collectContiguousOptions(questionIdx - 1, -1).reverse()
  const afterOptions = collectContiguousOptions(questionIdx + 1, 1)
  const beforeValid = beforeOptions.length >= 2 && beforeOptions.length <= 6
  const afterValid = afterOptions.length >= 2 && afterOptions.length <= 6

  if (beforeValid || afterValid) {
    const numberedOptions =
      beforeValid && afterValid
        ? beforeOptions.length >= afterOptions.length
          ? beforeOptions
          : afterOptions
        : beforeValid
          ? beforeOptions
          : afterOptions
    return {
      type: 'numbered',
      question: questionLine,
      options: numberedOptions,
    }
  }

  return null
}
