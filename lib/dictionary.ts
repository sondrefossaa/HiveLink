// lib/dictionary.ts
// Client-safe dictionary built from the bundled data/compound-words.json.
// Norwegian: no doubled-consonant variants needed.

import compoundWordsJson from '@/data/compound-words.json'
import type { CompoundWord } from '@/types'
import {
  parseCompoundWord,
  isLikelyCompoundWord,
  registerCompoundParts,
} from '@/lib/compound-utils'
import { normalizeNo } from '@/lib/norwegian-dictionary'

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
  const normalizedWord = normalizeNo(word)
  const providedParts = parts ? parts.map(p => normalizeNo(p)).filter(Boolean) : []

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
      parts: parsedParts.map(p => normalizeNo(p)),
      source,
    }
  }

  return null
}

export function buildPartIndex(words: WordEntry[]): Map<string, WordEntry[]> {
  const index = new Map<string, WordEntry[]>()

  function addKey(key: string, entry: WordEntry) {
    const list = index.get(key) ?? []
    if (!list.includes(entry)) {
      list.push(entry)
    }
    index.set(key, list)
  }

  for (const entry of words) {
    const indexedKeys = new Set<string>()

    // Index by FIRST part for suffix chaining
    if (entry.parts.length > 0) {
      const firstPart = entry.parts[0].toLowerCase()
      addKey(firstPart, entry)
      indexedKeys.add(firstPart)
    }

    // Also index by all parts for other uses
    const uniqueParts = Array.from(new Set(entry.parts))
    for (const part of uniqueParts) {
      const partLower = part.toLowerCase()
      if (!indexedKeys.has(partLower)) {
        addKey(partLower, entry)
      }
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

const WORD_PARTS_MAP: Map<string, string[]> = new Map(
  CANONICAL_WORDS.map((entry) => [entry.word, entry.parts])
)

export function getPartsForWord(word: string): string[] | null {
  const parts = WORD_PARTS_MAP.get(normalizeNo(word))
  return parts ? [...parts] : null
}

export function hasDictionaryWord(word: string): boolean {
  return WORD_PARTS_MAP.has(normalizeNo(word))
}

export function getWordEntries(): Array<{ word: string; parts: string[] }> {
  return CANONICAL_WORDS.map(({ word, parts }) => ({ word, parts }))
}

export function getWordsStartingWith(part: string, limit?: number): WordEntry[] {
  const firstPart = normalizeNo(part)
  const candidates = DEFAULT_ENVIRONMENT.partIndex.get(firstPart) ?? []
  const filtered = candidates.filter(
    (entry) => entry.parts.length > 0 && entry.parts[0].toLowerCase() === firstPart
  )
  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered
}
