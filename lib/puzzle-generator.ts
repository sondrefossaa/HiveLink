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

interface DailyPuzzleResult {
  startWord: string
  goalWord: string
  optimalSteps: number
  solutionPath: string[]
}

interface DailyPuzzleOptions {
  wordEntries?: WordEntry[]
}

interface WordEnvironment {
  words: WordEntry[]
  partIndex: Map<string, WordEntry[]>
}

const RAW_WORDS = (compoundWords as CompoundWord[]).map((entry) => ({
  word: entry.word.toLowerCase(),
  parts: entry.parts.map((part) => part.toLowerCase()),
}))

const DEFAULT_ENVIRONMENT = createEnvironment(RAW_WORDS)

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

function createEnvironment(entries: WordEntry[]): WordEnvironment {
  const normalized = entries.map((entry) => ({
    word: entry.word.toLowerCase(),
    parts: entry.parts.map((part) => part.toLowerCase()),
  }))

  const words = normalized.filter((entry) => entry.parts.length >= 2)

  return {
    words,
    partIndex: buildPartIndex(words),
  }
}

// Seeded random number generator (Mulberry32)
function createSeededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Convert date to a seed number
function dateToSeed(date: Date): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  // Create a unique number from the date
  return year * 10000 + month * 100 + day
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function seededRandomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function seededShuffleInPlace<T>(array: T[], random: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function pickRandomStart(environment: WordEnvironment): WordEntry {
  const layeredWords = environment.words.filter((entry) => new Set(entry.parts).size >= 2)
  const pool = layeredWords.length > 0 ? layeredWords : environment.words

  if (pool.length === 0) {
    throw new Error('No available words to generate a puzzle')
  }

  return pool[randomInt(0, pool.length - 1)]
}

function pickNextWord(current: WordEntry, used: Set<string>, environment: WordEnvironment): WordEntry | null {
  const parts = shuffleInPlace(Array.from(new Set(current.parts)))

  for (const part of parts) {
    const candidates = environment.partIndex.get(part)
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

function attemptBuildChain(targetLength: number, environment: WordEnvironment): WordEntry[] | null {
  if (environment.words.length === 0) {
    return null
  }

  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const chain: WordEntry[] = []
    const used = new Set<string>()
    const start = pickRandomStart(environment)
    chain.push(start)
    used.add(start.word)

    let success = true

    while (chain.length < targetLength) {
      const next = pickNextWord(chain[chain.length - 1], used, environment)
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

// Find a word entry by word name
function findWordEntry(word: string, environment: WordEnvironment): WordEntry | null {
  const normalized = word.toLowerCase()
  return environment.words.find((entry) => entry.word === normalized) || null
}

export async function generatePracticePuzzle(
  difficulty: PuzzleDifficulty,
  sharedStartWord?: string,
  sharedGoalWord?: string
): Promise<GeneratedPuzzle> {
  const environment = DEFAULT_ENVIRONMENT

  // If start and goal words are provided (shared puzzle), create a fixed puzzle
  if (sharedStartWord && sharedGoalWord) {
    const startEntry = findWordEntry(sharedStartWord, environment)
    const goalEntry = findWordEntry(sharedGoalWord, environment)
    
    if (!startEntry || !goalEntry) {
      throw new Error(`Invalid shared puzzle words: ${sharedStartWord} -> ${sharedGoalWord}`)
    }

    const seed = `shared-${sharedStartWord}-${sharedGoalWord}-${difficulty}`
    
    return {
      id: seed,
      seed,
      difficulty,
      startWord: startEntry.word,
      goalWord: goalEntry.word,
      optimalSteps: 5, // Default optimal steps for shared puzzles
      isDaily: false,
      mode: 'practice',
      solutionPath: [startEntry.word, goalEntry.word], // Minimal path
    }
  }

  const range = DIFFICULTY_LENGTHS[difficulty] ?? DIFFICULTY_LENGTHS.medium
  const targetLength = randomInt(range.min, range.max)
  const lengthOptions = Array.from(new Set([targetLength, range.max, range.min])).filter(Boolean)

  let chain: WordEntry[] | null = null

  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const lengthChoice = lengthOptions[attempt % lengthOptions.length] ?? targetLength
    const candidate = attemptBuildChain(lengthChoice, environment)
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

// Seeded versions for daily puzzle generation
function pickSeededRandomStart(random: () => number, environment: WordEnvironment): WordEntry {
  const layeredWords = environment.words.filter((entry) => new Set(entry.parts).size >= 2)
  const pool = layeredWords.length > 0 ? layeredWords : environment.words

  if (pool.length === 0) {
    throw new Error('No available words to generate a daily puzzle')
  }

  return pool[seededRandomInt(0, pool.length - 1, random)]
}

function pickSeededNextWord(
  current: WordEntry,
  used: Set<string>,
  random: () => number,
  environment: WordEnvironment
): WordEntry | null {
  const parts = seededShuffleInPlace(Array.from(new Set(current.parts)), random)

  for (const part of parts) {
    const candidates = environment.partIndex.get(part)
    if (!candidates) continue

    const shuffled = seededShuffleInPlace([...candidates], random)
    for (const candidate of shuffled) {
      if (candidate.word === current.word) continue
      if (used.has(candidate.word)) continue

      const shared = findSharedPart(current.parts, candidate.parts)
      if (!shared) continue

      used.add(candidate.word)
      return candidate
    }
  }

  return null
}

function attemptSeededBuildChain(
  targetLength: number,
  random: () => number,
  environment: WordEnvironment
): WordEntry[] | null {
  if (environment.words.length === 0) {
    return null
  }

  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const chain: WordEntry[] = []
    const used = new Set<string>()
    const start = pickSeededRandomStart(random, environment)
    chain.push(start)
    used.add(start.word)

    let success = true

    while (chain.length < targetLength) {
      const next = pickSeededNextWord(chain[chain.length - 1], used, random, environment)
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

/**
 * Generate a daily puzzle for a specific date.
 * Uses a seeded random number generator to ensure the same puzzle
 * is generated for the same date, even across different servers.
 */
export async function generateDailyPuzzle(date: Date, options: DailyPuzzleOptions = {}): Promise<DailyPuzzleResult> {
  const environment = options.wordEntries
    ? createEnvironment(options.wordEntries)
    : DEFAULT_ENVIRONMENT

  if (environment.words.length === 0) {
    throw new Error('No compound words available for daily puzzle generation')
  }

  const seed = dateToSeed(date)
  const random = createSeededRandom(seed)
  
  // Daily puzzles are always medium difficulty
  const range = DIFFICULTY_LENGTHS.medium
  const targetLength = seededRandomInt(range.min, range.max, random)
  const lengthOptions = Array.from(new Set([targetLength, range.max, range.min])).filter(Boolean)

  let chain: WordEntry[] | null = null

  for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
    const lengthChoice = lengthOptions[attempt % lengthOptions.length] ?? targetLength
    const candidate = attemptSeededBuildChain(lengthChoice, random, environment)
    if (!candidate) {
      continue
    }

    // For medium difficulty, avoid puzzles where start and goal share a part
    if (startAndGoalSharePart(candidate)) {
      continue
    }

    chain = candidate
    break
  }

  if (!chain) {
    throw new Error('Unable to generate a valid daily puzzle')
  }

  const wordsOnly = chain.map((entry) => entry.word)
  const optimalSteps = Math.max(1, chain.length - 1)

  return {
    startWord: chain[0].word,
    goalWord: chain[chain.length - 1].word,
    optimalSteps,
    solutionPath: wordsOnly,
  }
}
