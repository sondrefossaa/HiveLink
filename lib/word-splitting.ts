// lib/word-splitting.ts
// Deterministic compound-word splitting shared by the import script and runtime parsing.
//
// Why: the original importer returned the FIRST left-to-right split where both
// halves are dictionary words. Because word lists contain obscure words
// ("bable", "nable", "scribable"), suffix-bearing words got garbage splits
// (clubbable -> club + bable instead of clubb + able). This module scores ALL
// candidate splits and picks the best one, with support for doubled-consonant
// stems (clubb <- club) and boundary-shift variants so either representation
// can be used when chaining words.

// Common English suffixes (>= 3 chars) that strongly indicate the right-hand
// part of a split. Deliberately narrow: only suffixes where the suffix split
// is clearly BETTER for the game than the "both halves are dictionary words"
// split it replaces (fixes garbage boundaries like "bable", "nable", "sable",
// "ageable"). Broad suffix lists (-ing, -ness, -tion, -ies...) would mass-rewrite
// entries like butter+flies -> butterfl+ies, which chain worse and read worse.
const KNOWN_SUFFIXES: ReadonlySet<string> = new Set([
  'able', 'ible', 'less',
])

// Consonants that are commonly doubled at morpheme boundaries in English
// (club + b + able, run + n + ing, ...).
const DOUBLABLE_CONSONANTS: ReadonlySet<string> = new Set([
  'b', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'r', 's', 't', 'z',
])

const MIN_PART_LENGTH = 3
const LONG_PART_LENGTH = 5

// Score tiers. A suffix split with a real (or doubled) stem always beats a
// "both halves happen to be dictionary words" split.
const SCORE_BOTH_COMMON = 40
const SCORE_BOTH_DICT = 10
const SCORE_SUFFIX_WORD_STEM = 50
const SCORE_SUFFIX_DOUBLED_STEM = 50
const SCORE_SUFFIX_BARE_STEM = 30

// Minimum score required to replace an entry whose stored split cannot be
// scored at all (manual/legacy entries). Prevents garbage like "goldf+ish"
// from replacing curated splits.
export const MIN_SCORE_TO_REPLACE_UNSCOREABLE = SCORE_SUFFIX_WORD_STEM

export interface SplitContext {
  /** Is this a valid dictionary word? */
  isWord: (word: string) => boolean
  /** Is this a common, high-frequency word? (optional, improves ranking) */
  isCommon?: (word: string) => boolean
  /** Are 3-4 letter words allowed as parts? (whitelist, e.g. VALID_SHORT_PARTS) */
  isAllowedShortPart?: (word: string) => boolean
}

export interface SplitCandidate {
  parts: string[]
  score: number
}

export function isKnownSuffix(part: string): boolean {
  return KNOWN_SUFFIXES.has(part.toLowerCase())
}

function isConsonant(char: string): boolean {
  return /^[b-df-hj-np-tv-z]$/.test(char)
}

/**
 * If the word ends in a doubled consonant, return the word with one copy
 * removed (clubb -> club), otherwise null. The caller must verify the result
 * is actually a dictionary word.
 */
function dedouble(word: string): string | null {
  if (word.length < 4) return null
  const last = word[word.length - 1]
  const prev = word[word.length - 2]
  if (last === prev && isConsonant(last)) {
    return word.slice(0, -1)
  }
  return null
}

/**
 * A "wordish" string can legitimately stand on its own as a part: a dictionary
 * word, a common word, or a known suffix.
 */
function isWordish(ctx: SplitContext, word: string): boolean {
  if (ctx.isWord(word)) return true
  if (ctx.isCommon && ctx.isCommon(word)) return true
  return isKnownSuffix(word)
}

// Frequency lists contain 3-letter junk ("ing", "ion", "ist", "ted"), so a
// common word is only trusted as a short part when it has at least 4 letters.
const MIN_COMMON_TRUST_LENGTH = 4

function isTrustedPart(ctx: SplitContext, part: string): boolean {
  if (part.length < MIN_COMMON_TRUST_LENGTH) return false
  if (ctx.isAllowedShortPart && ctx.isAllowedShortPart(part)) return true
  return ctx.isCommon ? ctx.isCommon(part) && ctx.isWord(part) : false
}

/**
 * Admissibility rules carried over from the original importer:
 * - parts are at least 3 chars
 * - a part shorter than 5 chars must be whitelisted, a known suffix, or a
 *   common dictionary word (e.g. "gold", "fish", "air" are fine; "psia" is not)
 * - at least one part must be 5+ chars, OR both parts are trusted (this keeps
 *   classic 4+4 compounds like gold+fish admissible)
 */
function isAdmissiblePart(ctx: SplitContext, part: string): boolean {
  if (part.length >= LONG_PART_LENGTH) return true
  if (isKnownSuffix(part)) return true
  if (ctx.isAllowedShortPart && ctx.isAllowedShortPart(part)) return true
  if (ctx.isCommon && ctx.isCommon(part) && ctx.isWord(part)) return true
  return false
}

function scoreSplit(ctx: SplitContext, left: string, right: string): number | null {
  if (left.length < MIN_PART_LENGTH || right.length < MIN_PART_LENGTH) {
    return null
  }
  if (!isAdmissiblePart(ctx, left) || !isAdmissiblePart(ctx, right)) {
    return null
  }
  const atLeastOneLong = left.length >= LONG_PART_LENGTH || right.length >= LONG_PART_LENGTH
  if (!atLeastOneLong && !(isTrustedPart(ctx, left) && isTrustedPart(ctx, right))) {
    return null
  }

  let score = 0

  const leftCommon = ctx.isCommon
    ? left.length >= MIN_COMMON_TRUST_LENGTH && ctx.isCommon(left)
    : false
  const rightCommon = ctx.isCommon
    ? right.length >= MIN_COMMON_TRUST_LENGTH && ctx.isCommon(right)
    : false
  if (leftCommon && rightCommon) {
    score += SCORE_BOTH_COMMON
  } else if (ctx.isWord(left) && ctx.isWord(right)) {
    score += SCORE_BOTH_DICT
  }

  if (isKnownSuffix(right)) {
    if (ctx.isWord(left)) {
      score += SCORE_SUFFIX_WORD_STEM
    } else {
      const stem = dedouble(left)
      if (stem && ctx.isWord(stem)) {
        // Doubled-consonant stem: clubb + able (club), runn + able (run)
        score += SCORE_SUFFIX_DOUBLED_STEM
      } else if (left.length >= LONG_PART_LENGTH) {
        // Bare stem: circumscrib + able (circumscribe)
        score += SCORE_SUFFIX_BARE_STEM
      }
    }
  }

  return score > 0 ? score : null
}

function tieBreakScore(
  left: string,
  right: string,
  ctx: SplitContext
): [number, string] {
  const leftCommon =
    (ctx.isCommon && ctx.isCommon(left) && left.length >= MIN_COMMON_TRUST_LENGTH)
  const rightCommon =
    (ctx.isCommon && ctx.isCommon(right) && right.length >= MIN_COMMON_TRUST_LENGTH)
  const bothCommon = leftCommon && rightCommon ? 1 : 0
  return [bothCommon, left]
}

function isBetterTie(
  left: string,
  right: string,
  bestLeft: string,
  bestRight: string,
  ctx: SplitContext
): boolean {
  const [aBothCommon, aLeft] = tieBreakScore(left, right, ctx)
  const [bBothCommon, bLeft] = tieBreakScore(bestLeft, bestRight, ctx)
  if (aBothCommon !== bBothCommon) return aBothCommon > bBothCommon
  if (aLeft.length !== bLeft.length) return aLeft.length > bLeft.length
  return aLeft < bLeft
}

/**
 * Score an existing parts array (used to compare against the best split when
 * re-splitting). Returns null if the parts are not a scoreable 2-part split.
 */
export function scoreParts(
  word: string,
  parts: string[],
  ctx: SplitContext
): number | null {
  const normalized = word.toLowerCase()
  if (parts.length !== 2) return null
  const left = parts[0].toLowerCase()
  const right = parts[1].toLowerCase()
  if (left + right !== normalized) return null
  return scoreSplit(ctx, left, right)
}

/**
 * Find the best-scoring 2-part split of a word. Deterministic: the same word
 * always produces the same result. Ties break on longer left part, then
 * lexicographically smaller left part.
 */
export function findBestSplit(
  word: string,
  ctx: SplitContext
): SplitCandidate | null {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  if (normalized.length < MIN_PART_LENGTH * 2) return null

  let best: SplitCandidate | null = null

  for (let i = MIN_PART_LENGTH; i <= normalized.length - MIN_PART_LENGTH; i++) {
    const left = normalized.slice(0, i)
    const right = normalized.slice(i)
    const score = scoreSplit(ctx, left, right)
    if (score === null) continue

    if (
      !best ||
      score > best.score ||
      (score === best.score && isBetterTie(left, right, best.parts[0], best.parts[1], ctx))
    ) {
      best = { parts: [left, right], score }
    }
  }

  return best
}

/**
 * Count how many distinct splits share the given score (used to flag
 * ambiguous words in the resplit audit).
 */
export function countSplitsWithScore(
  word: string,
  ctx: SplitContext,
  targetScore: number
): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  let count = 0
  for (let i = MIN_PART_LENGTH; i <= normalized.length - MIN_PART_LENGTH; i++) {
    const left = normalized.slice(0, i)
    const right = normalized.slice(i)
    if (scoreSplit(ctx, left, right) === targetScore) {
      count++
    }
  }
  return count
}

function endsWithExactly(word: string, char: string, count: number): boolean {
  if (word.length < count) return false
  for (let i = 0; i < count; i++) {
    if (word[word.length - 1 - i] !== char) return false
  }
  return word[word.length - 1 - count] !== char
}

/**
 * Generate all doubled-consonant boundary-shift variants of a parts array.
 *
 * A morpheme boundary sitting on a doubled consonant can be represented two
 * ways: [club, bable] and [clubb, able] both spell "clubbable". This returns
 * every such variant so chain matching works no matter which representation
 * is stored. Shifts are constrained so both sides of the shifted boundary
 * stay plausible (dictionary word / common word / known suffix).
 *
 * Example: ["clubb", "able"] -> [["clubb", "able"], ["club", "bable"]]
 */
export function boundaryVariants(
  parts: string[],
  ctx: SplitContext
): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  const queue = [parts.map((part) => part.toLowerCase())]

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = current.join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(current)

    if (current.length < 2) continue

    for (let i = 0; i < current.length - 1; i++) {
      const left = current[i]
      const right = current[i + 1]
      if (left.length === 0 || right.length === 0) continue

      // Shift the shared letter from the start of right onto the end of left:
      // [club, bable] -> [clubb, able]
      const shared = right[0]
      if (
        DOUBLABLE_CONSONANTS.has(shared) &&
        left[left.length - 1] === shared &&
        endsWithExactly(left, shared, 1)
      ) {
        const newRight = right.slice(1)
        if (newRight.length >= MIN_PART_LENGTH && isWordish(ctx, newRight)) {
          const next = [...current]
          next[i] = left + shared
          next[i + 1] = newRight
          queue.push(next)
        }
      }

      // Shift one copy of a doubled letter from the end of left onto right:
      // [clubb, able] -> [club, bable]
      const last = left[left.length - 1]
      if (
        left.length >= 4 &&
        DOUBLABLE_CONSONANTS.has(last) &&
        endsWithExactly(left, last, 2) &&
        isWordish(ctx, left.slice(0, -1))
      ) {
        const next = [...current]
        next[i] = left.slice(0, -1)
        next[i + 1] = last + right
        queue.push(next)
      }
    }
  }

  return out
}

/**
 * Single source of truth for suffix chaining: the last part of the previous
 * word must be able to match the first part of the new word, considering
 * doubled-consonant boundary variants on both sides.
 *
 * ["night", "club"] can chain to ["clubb", "able"] (clubbable) and
 * ["clubb", "able"] can chain to any word whose first part is "able".
 */
export function canChain(
  prevParts: string[],
  newParts: string[],
  ctx: SplitContext
): boolean {
  if (prevParts.length === 0 || newParts.length === 0) return false

  const prevLasts = new Set(
    boundaryVariants(prevParts, ctx).map((v) => v[v.length - 1])
  )
  const newFirsts = new Set(
    boundaryVariants(newParts, ctx).map((v) => v[0])
  )

  for (const last of prevLasts) {
    if (newFirsts.has(last)) return true
  }
  return false
}
