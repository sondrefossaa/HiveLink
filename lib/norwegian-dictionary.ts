// lib/norwegian-dictionary.ts
// Loads the three validation tiers from Norsk Ordbank data.
// - compoundParts: actual FORLEDD/ETTERLEDD values (highest trust)
// - commonWords: FrequencyWords top 50K (for difficulty ranking)
// - validWords: fullformsliste (broad validation, includes rare inflections)

import wordsData from '@/data/norwegian-words.json'

const COMPOUND_PARTS = new Set(wordsData.compoundParts)
const COMMON_WORDS = new Set(wordsData.commonWords)
const VALID_WORDS = new Set(wordsData.validWords)

/** Is this a known compound part from Norsk Ordbank? */
export function isCompoundPart(word: string): boolean {
  return COMPOUND_PARTS.has(word.normalize('NFC').toLocaleLowerCase('nb-NO'))
}

/** Is this a common Norwegian word (top 50K by frequency)? */
export function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.normalize('NFC').toLocaleLowerCase('nb-NO'))
}

/** Is this a valid Norwegian word form (any inflection)? */
export function isValidWord(word: string): boolean {
  return VALID_WORDS.has(word.normalize('NFC').toLocaleLowerCase('nb-NO'))
}

/** Check word against all three tiers. Returns the highest trust tier. */
export function wordTrustLevel(word: string): 'compound' | 'common' | 'valid' | 'none' {
  if (isCompoundPart(word)) return 'compound'
  if (isCommonWord(word)) return 'common'
  if (isValidWord(word)) return 'valid'
  return 'none'
}

/** Normalize a Norwegian word: NFC + lowercase. */
export function normalizeNo(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase('nb-NO')
}

/** Check if a string is a plausible Norwegian word (letters only). */
export function isNorwegianWordish(word: string): boolean {
  return /^\p{L}+$/u.test(word)
}
