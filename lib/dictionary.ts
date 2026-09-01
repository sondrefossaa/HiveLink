// lib/dictionary.ts
// Client-safe dictionary built from the bundled data/compound-words.json.
// Replaces the former database-backed compound word table.

import compoundWordsJson from '@/data/compound-words.json'
import type { CompoundWord } from '@/types'
import {
  parseCompoundWord,
  isLikelyCompoundWord,
  registerCompoundParts,
} from '@/lib/compound-utils'

export interface WordEntry {
  word: string
  parts: string[]
  source?: 'canonical' | 'runtime'
}

export interface WordEnvironment {
  words: WordEntry[]
  partIndex: Map<string, WordEntry[]>
}

export function toWordEntry(
  word: string,
  parts?: string[],
  source: WordEntry['source'] = 'runtime'
): WordEntry | null {
  const normalizedWord = word.toLowerCase()
  const providedParts = parts ? parts.map((part) => part.toLowerCase()).filter(Boolean) : []

  if (
    providedParts.length >= 2 &&
    providedParts.join('') === normalizedWord &&
    isLikelyCompoundWord(word, providedParts)
  ) {
    return { word: normalizedWord, parts: providedParts, source }
  }

  const parsedParts = parseCompoundWord(word)
  if (isLikelyCompoundWord(word, parsedParts)) {
    return {
      word: normalizedWord,
      parts: parsedParts.map((part) => part.toLowerCase()),
      source,
    }
  }

  return null
}

export function buildPartIndex(words: WordEntry[]): Map<string, WordEntry[]> {
  const index = new Map<string, WordEntry[]>()
  for (const entry of words) {
    // For suffix chaining, index by FIRST part (to find candidates that start with a given part)
    if (entry.parts.length > 0) {
      const firstPart = entry.parts[0].toLowerCase()
      const list = index.get(firstPart) ?? []
      list.push(entry)
      index.set(firstPart, list)
    }
    // Also index by all parts for other uses
    const uniqueParts = Array.from(new Set(entry.parts))
    for (const part of uniqueParts) {
      const partLower = part.toLowerCase()
      if (partLower === entry.parts[0].toLowerCase()) continue // Already added above
      const list = index.get(partLower) ?? []
      if (!list.includes(entry)) {
        list.push(entry)
      }
      index.set(partLower, list)
    }
  }
  return index
}

export function createEnvironment(entries: WordEntry[]): WordEnvironment {
  const normalized = entries.map((entry) => ({
    word: entry.word.toLowerCase(),
    parts: entry.parts.map((part) => part.toLowerCase()),
    source: entry.source ?? 'runtime',
  }))

  const words = normalized.filter((entry) => entry.parts.length >= 2)

  return {
    words,
    partIndex: buildPartIndex(words),
  }
}

// Canonical words bundled with the app, registered with the compound-utils
// part caches so validation works fully offline.
export const CANONICAL_WORDS: WordEntry[] = (compoundWordsJson as CompoundWord[])
  .map((entry) => {
    const wordEntry = toWordEntry(entry.word, entry.parts, 'canonical')
    if (wordEntry) {
      registerCompoundParts(wordEntry.word, wordEntry.parts)
    }
    return wordEntry
  })
  .filter((entry): entry is WordEntry => entry !== null)

export const DEFAULT_ENVIRONMENT: WordEnvironment = createEnvironment(CANONICAL_WORDS)

// Lowercased word -> parts lookup for the bundled dictionary.
const WORD_PARTS_MAP: Map<string, string[]> = new Map(
  CANONICAL_WORDS.map((entry) => [entry.word, entry.parts])
)

/** Get the bundled parts for a word, or null if unknown. */
export function getPartsForWord(word: string): string[] | null {
  const parts = WORD_PARTS_MAP.get(word.toLowerCase())
  return parts ? [...parts] : null
}

/** Check if a word exists in the bundled dictionary. */
export function hasDictionaryWord(word: string): boolean {
  return WORD_PARTS_MAP.has(word.toLowerCase())
}

/** All bundled compound word entries ({ word, parts }). */
export function getWordEntries(): Array<{ word: string; parts: string[] }> {
  return CANONICAL_WORDS.map(({ word, parts }) => ({ word, parts }))
}

/** All words that start with the given part (suffix chaining candidates). */
export function getWordsStartingWith(part: string, limit?: number): WordEntry[] {
  const firstPart = part.toLowerCase()
  const candidates = DEFAULT_ENVIRONMENT.partIndex.get(firstPart) ?? []
  const filtered = candidates.filter(
    (entry) => entry.parts.length > 0 && entry.parts[0].toLowerCase() === firstPart
  )
  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered
}
