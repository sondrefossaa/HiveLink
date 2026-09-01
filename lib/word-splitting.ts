// lib/word-splitting.ts
// Norwegian compound word splitting.
//
// Norwegian compounds are orthographically clearer than English:
// - No doubled-consonant ambiguity
// - Head-final (rightmost element is always the head)
// - Linking elements (fuge) are explicit in Norsk Ordbank data
//
// Strategy:
// 1. Exact lookup in compound dictionary → authoritative parts
// 2. Heuristic split: try plain boundary, binde-s, binde-e
// 3. Score by frequency, prefer both-common splits
// 4. Reject if no valid split found

import {
  isCompoundPart,
  isCommonWord,
  normalizeNo,
  isNorwegianWordish,
} from './norwegian-dictionary'

export interface SplitContext {
  isWord: (word: string) => boolean
  isCommon?: (word: string) => boolean
}

export interface SplitCandidate {
  parts: string[]
  score: number
}

const MIN_PART_LENGTH = 2

// Common Norwegian fuger (linking elements)
const RUNTIME_FUGER = ['s', 'e']

function scoreSplit(ctx: SplitContext, left: string, right: string): number {
  const leftCommon = ctx.isCommon ? ctx.isCommon(left) : false
  const rightCommon = ctx.isCommon ? ctx.isCommon(right) : false

  if (leftCommon && rightCommon) return 100
  if (ctx.isWord(left) && ctx.isWord(right)) return 50
  if (ctx.isWord(left) || ctx.isWord(right)) return 10
  return 0
}

/**
 * Find all valid 2-part splits of a word.
 * Tries plain boundary, binde-s, and binde-e.
 */
export function findAllSplits(
  word: string,
  ctx: SplitContext
): SplitCandidate[] {
  const normalized = normalizeNo(word)
  if (normalized.length < MIN_PART_LENGTH * 2) return []

  const candidates: SplitCandidate[] = []

  // 1. Try plain boundary: foo|bar
  for (let i = MIN_PART_LENGTH; i <= normalized.length - MIN_PART_LENGTH; i++) {
    const left = normalized.slice(0, i)
    const right = normalized.slice(i)

    if (!isNorwegianWordish(left) || !isNorwegianWordish(right)) continue

    const score = scoreSplit(ctx, left, right)
    if (score > 0) {
      candidates.push({ parts: [left, right], score })
    }
  }

  // 2. Try binde-s: foo + s + bar → check if "foo" + "s" + "bar" spells the word
  //    and both foo and bar are valid compound parts
  for (let i = MIN_PART_LENGTH; i <= normalized.length - MIN_PART_LENGTH - 1; i++) {
    const left = normalized.slice(0, i)
    const rest = normalized.slice(i)

    if (rest.startsWith('s') && rest.length > 1) {
      const right = rest.slice(1)
      if (right.length >= MIN_PART_LENGTH && isNorwegianWordish(left) && isNorwegianWordish(right)) {
        const score = scoreSplit(ctx, left, right)
        if (score > 0) {
          candidates.push({ parts: [left, right], score: score + 5 }) // slight bonus for explicit fuge
        }
      }
    }
  }

  // 3. Try binde-e: foo + e + bar
  for (let i = MIN_PART_LENGTH; i <= normalized.length - MIN_PART_LENGTH - 1; i++) {
    const left = normalized.slice(0, i)
    const rest = normalized.slice(i)

    if (rest.startsWith('e') && rest.length > 1) {
      const right = rest.slice(1)
      if (right.length >= MIN_PART_LENGTH && isNorwegianWordish(left) && isNorwegianWordish(right)) {
        const score = scoreSplit(ctx, left, right)
        if (score > 0) {
          candidates.push({ parts: [left, right], score: score + 3 })
        }
      }
    }
  }

  // Deduplicate by parts key, keep highest score
  const seen = new Map<string, SplitCandidate>()
  for (const c of candidates) {
    const key = c.parts.join('|')
    const existing = seen.get(key)
    if (!existing || c.score > existing.score) {
      seen.set(key, c)
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score)
}

/**
 * Find the best 2-part split of a word.
 */
export function findBestSplit(
  word: string,
  ctx: SplitContext
): SplitCandidate | null {
  const candidates = findAllSplits(word, ctx)
  return candidates[0] ?? null
}

/**
 * Check if two words can chain: last part of prev == first part of new.
 * Norwegian: no boundary variants needed (no doubled-consonant shifts).
 */
export function canChain(
  prevParts: string[],
  newParts: string[],
  _ctx?: SplitContext
): boolean {
  if (prevParts.length === 0 || newParts.length === 0) return false
  const prevLast = prevParts[prevParts.length - 1].toLowerCase()
  const newFirst = newParts[0].toLowerCase()
  return prevLast === newFirst
}
