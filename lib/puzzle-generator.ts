import type { PuzzleDifficulty, PracticePuzzle } from '@/types'
import type { CompoundWord } from '@/types'
import compoundWords from '@/data/compound-words.json'
import { findSharedPart, parseCompoundWord } from '@/lib/compound-utils'

interface WordEntry {
  word: string
  parts: string[]
}

interface GeneratedPuzzle extends PracticePuzzle {
  solutionPath: string[]
}

const RAW_WORDS = (compoundWords as CompoundWord[]).map((entry) => ({
  word: entry.word.toLowerCase(),
  parts: entry.parts.map((part) => part.toLowerCase()),
}))

const WORDS: WordEntry[] = RAW_WORDS.filter((entry) => entry.parts.length >= 2)

const PART_INDEX = buildPartIndex(WORDS)

const DIFFICULTY_LENGTHS: Record<PuzzleDifficulty, { min: number; max: number }> = {
  easy: { min: 4, max: 5 },
  medium: { min: 6, max: 7 },
  hard: { min: 8, max: 9 },
}

const MAX_CHAIN_ATTEMPTS = 400

function buildPartIndex(words: WordEntry[]): Map<string, WordEntry[]> {
  const index = new Map<string, WordEntry[]>()
  for (const entry of words) {
    const uniqueParts = Array.from(new Set(entry.parts))
    for (const part of uniqueParts) {
      const list = index.get(part) ?? []
      list.push(entry)
      index.set(part, list)
    }
  }
  return index
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function pickRandomStart(): WordEntry {
  const layeredWords = WORDS.filter((entry) => new Set(entry.parts).size >= 2)
  const pool = layeredWords.length > 0 ? layeredWords : WORDS
  return pool[randomInt(0, pool.length - 1)]
}

function pickNextWord(current: WordEntry, used: Set<string>): WordEntry | null {
  const parts = shuffleInPlace(Array.from(new Set(current.parts)))

  for (const part of parts) {
    const candidates = PART_INDEX.get(part)
    if (!candidates) continue

    const shuffled = shuffleInPlace([...candidates])
    for (const candidate of shuffled) {
      if (candidate.word === current.word) continue
      if (used.has(candidate.word)) continue

      const shared = findSharedPart(current.parts, candidate.parts)
      if (!shared) continue

      // Ensure the connection only shares the intended part
      used.add(candidate.word)
      return candidate
    }
  }

  return null
}

function attemptBuildChain(targetLength: number): WordEntry[] | null {
  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const chain: WordEntry[] = []
    const used = new Set<string>()
    const start = pickRandomStart()
    chain.push(start)
    used.add(start.word)

    let success = true

    while (chain.length < targetLength) {
      const next = pickNextWord(chain[chain.length - 1], used)
      if (!next) {
        success = false
        break
      }
      chain.push(next)
    }

    if (success && chain.length === targetLength) {
      return chain
    }
  }

  return null
}

function startAndGoalSharePart(chain: WordEntry[]): boolean {
  if (chain.length < 2) {
    return false
  }

  const start = chain[0]
  const goal = chain[chain.length - 1]
  return Boolean(findSharedPart(start.parts, goal.parts))
}

export async function generatePracticePuzzle(
  difficulty: PuzzleDifficulty
): Promise<GeneratedPuzzle> {
  const range = DIFFICULTY_LENGTHS[difficulty] ?? DIFFICULTY_LENGTHS.medium
  const targetLength = randomInt(range.min, range.max)
  const lengthOptions = Array.from(new Set([targetLength, range.max, range.min])).filter(Boolean)

  let chain: WordEntry[] | null = null

  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const lengthChoice = lengthOptions[attempt % lengthOptions.length] ?? targetLength
    const candidate = attemptBuildChain(lengthChoice)
    if (!candidate) {
      continue
    }

    if ((difficulty === 'hard' || difficulty === 'medium') && startAndGoalSharePart(candidate)) {
      continue
    }

    chain = candidate
    break
  }

  if (!chain) {
    throw new Error('Unable to generate a valid practice puzzle')
  }

  const wordsOnly = chain.map((entry) => entry.word)
  const optimalSteps = Math.max(1, chain.length - 1)
  const seed = `practice-${difficulty}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

  const normalizedChain = chain.map((entry) => ({
    word: entry.word,
    parts: entry.parts.length ? entry.parts : parseCompoundWord(entry.word),
  }))

  // Ensure start and goal nodes respect casing (use original dataset casing if available)
  const startWord = normalizedChain[0].word
  const goalWord = normalizedChain[normalizedChain.length - 1].word

  return {
    id: seed,
    seed,
    difficulty,
    startWord,
    goalWord,
    optimalSteps,
    isDaily: false,
    mode: 'practice',
    solutionPath: wordsOnly,
  }
}
