import type { PuzzleDifficulty, PracticePuzzle } from '@/types'
import type { CompoundWord } from '@/types'
import compoundWords from '@/data/compound-words.json'
import {
  parseCompoundWord,
  isLikelyCompoundWord,
  registerCompoundParts,
} from '@/lib/compound-utils'
import { getPrismaClient } from '@/lib/prisma-client'

interface WordEntry {
  word: string
  parts: string[]
  source?: 'canonical' | 'runtime'
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
  minSteps?: number
}

interface WordEnvironment {
  words: WordEntry[]
  partIndex: Map<string, WordEntry[]>
}

function toWordEntry(word: string, parts?: string[], source: WordEntry['source'] = 'runtime'): WordEntry | null {
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

const RAW_WORDS = (compoundWords as CompoundWord[])
  .map((entry) => toWordEntry(entry.word, entry.parts, 'canonical'))
  .filter((entry): entry is WordEntry => entry !== null)

const DEFAULT_ENVIRONMENT = createEnvironment(RAW_WORDS)
let practiceEnvironmentCache: WordEnvironment | null = null
let practiceEnvironmentPromise: Promise<WordEnvironment> | null = null

const DIFFICULTY_LENGTHS: Record<PuzzleDifficulty, { min: number; max: number }> = {
  easy: { min: 3, max: 4 }, // Reduced for suffix chaining
  medium: { min: 4, max: 5 }, // Reduced for suffix chaining - was 6-7
  hard: { min: 6, max: 7 }, // Reduced for suffix chaining - was 8-9
}

const MAX_CHAIN_ATTEMPTS = 800 // Increased for suffix chaining which is more restrictive

function buildPartIndex(words: WordEntry[]): Map<string, WordEntry[]> {
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

function createEnvironment(entries: WordEntry[]): WordEnvironment {
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
  // Suffix chaining rule: candidate's FIRST part must match current's LAST part
  const currentLastPart = current.parts.length > 0 ? current.parts[current.parts.length - 1].toLowerCase() : null
  if (!currentLastPart) return null

  const candidates = environment.partIndex.get(currentLastPart)
  if (!candidates) return null

  const shuffled = shuffleInPlace([...candidates])
  for (const candidate of shuffled) {
    if (candidate.word === current.word) continue
    if (used.has(candidate.word)) continue

    // Verify suffix chaining: candidate's first part must match current's last part
    const candidateFirstPart = candidate.parts.length > 0 ? candidate.parts[0].toLowerCase() : null
    if (!candidateFirstPart || candidateFirstPart !== currentLastPart) continue

    used.add(candidate.word)
    return candidate
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
  if (chain.length < 1) {
    return false
  }

  // With suffix chaining: start word = first part of first compound, goal word = last part of last compound
  // Check if they're the same (trivial puzzle)
  const firstCompound = chain[0]
  const lastCompound = chain[chain.length - 1]
  
  if (firstCompound.parts.length === 0 || lastCompound.parts.length === 0) {
    return false
  }
  
  const startWord = firstCompound.parts[0].toLowerCase()
  const goalWord = lastCompound.parts[lastCompound.parts.length - 1].toLowerCase()
  
  return startWord === goalWord
}

// Detect if there exists a direct one-word bridge that connects start to goal via suffix chaining
// With suffix chaining: a word exists that starts with start word and ends with goal word
function directBridgeExists(start: WordEntry, goal: WordEntry, environment: WordEnvironment): boolean {
  // Extract actual start and goal words (first part of start, last part of goal)
  const startWord = start.parts.length > 0 ? start.parts[0].toLowerCase() : start.word.toLowerCase()
  const goalWord = goal.parts.length > 0 ? goal.parts[goal.parts.length - 1].toLowerCase() : goal.word.toLowerCase()
  
  // Check if there's a compound word that starts with startWord and ends with goalWord
  // This would be a trivial one-word solution: startWord + ... + goalWord = compound
  for (const candidate of environment.words) {
    if (candidate.parts.length < 2) continue
    
    const candidateFirstPart = candidate.parts[0].toLowerCase()
    const candidateLastPart = candidate.parts[candidate.parts.length - 1].toLowerCase()
    
    // Check if this word directly bridges start to goal
    if (candidateFirstPart === startWord && candidateLastPart === goalWord) {
      return true
    }
  }
  
  return false
}

// Detect if there exists a two-step bridge via suffix chaining
// With suffix chaining: start -> word1 -> word2 -> goal
// Where: start == word1's first part, word1's last part == word2's first part, word2's last part == goal
function twoStepBridgeExists(start: WordEntry, goal: WordEntry, environment: WordEnvironment): boolean {
  // Extract actual start and goal words (first part of start, last part of goal)
  const startWord = start.parts.length > 0 ? start.parts[0].toLowerCase() : start.word.toLowerCase()
  const goalWord = goal.parts.length > 0 ? goal.parts[goal.parts.length - 1].toLowerCase() : goal.word.toLowerCase()
  
  // Check for two-step bridge: startWord -> word1 -> word2 -> goalWord
  // word1 must start with startWord
  // word2 must start with word1's last part and end with goalWord
  for (const word1 of environment.words) {
    if (word1.parts.length < 2) continue
    
    const word1FirstPart = word1.parts[0].toLowerCase()
    const word1LastPart = word1.parts[word1.parts.length - 1].toLowerCase()
    
    // word1 must start with startWord
    if (word1FirstPart !== startWord) continue
    
    // Now find word2 that starts with word1's last part and ends with goalWord
    for (const word2 of environment.words) {
      if (word2.word === word1.word) continue
      if (word2.parts.length < 2) continue
      
      const word2FirstPart = word2.parts[0].toLowerCase()
      const word2LastPart = word2.parts[word2.parts.length - 1].toLowerCase()
      
      // word2 must start with word1's last part and end with goalWord
      if (word2FirstPart === word1LastPart && word2LastPart === goalWord) {
        return true // Two-step bridge found: startWord -> word1 -> word2 -> goalWord
      }
    }
  }
  
  return false
}

// Find a word entry by word name
function findWordEntry(word: string, environment: WordEnvironment): WordEntry | null {
  const normalized = word.toLowerCase()
  return environment.words.find((entry) => entry.word === normalized) || null
}

async function loadPracticeEnvironment(): Promise<WordEnvironment> {
  if (practiceEnvironmentCache) {
    return practiceEnvironmentCache
  }

  if (practiceEnvironmentPromise) {
    return practiceEnvironmentPromise
  }

  // Always fall back to the baked-in list if we're not on the server
  if (typeof window !== 'undefined') {
    practiceEnvironmentCache = DEFAULT_ENVIRONMENT
    return practiceEnvironmentCache
  }

  practiceEnvironmentPromise = (async () => {
    try {
      const prisma = await getPrismaClient()
      const records = await prisma.compoundWord.findMany({
        select: { word: true, parts: true },
      })

      const merged = new Map<string, WordEntry>()

      for (const entry of RAW_WORDS) {
        registerCompoundParts(entry.word, entry.parts)
      }

      for (const record of records) {
        const entry = toWordEntry(record.word, record.parts, 'runtime')
        if (!entry) {
          continue
        }

        registerCompoundParts(entry.word, entry.parts)
        merged.set(entry.word, entry)
      }

      if (merged.size === 0) {
        for (const entry of RAW_WORDS) {
          merged.set(entry.word, entry)
        }
      } else {
        for (const entry of RAW_WORDS) {
          if (!merged.has(entry.word)) {
            merged.set(entry.word, entry)
          }
        }
      }

      const entries = Array.from(merged.values())
      if (entries.length === 0) {
        return DEFAULT_ENVIRONMENT
      }

      return createEnvironment(entries)
    } catch (error) {
      console.error('Failed to load dictionary compound words for practice puzzles:', error)
      return DEFAULT_ENVIRONMENT
    }
  })()

  try {
    practiceEnvironmentCache = await practiceEnvironmentPromise
  } finally {
    practiceEnvironmentPromise = null
  }

  return practiceEnvironmentCache
}

export async function generatePracticePuzzle(
  difficulty: PuzzleDifficulty,
  sharedStartWord?: string,
  sharedGoalWord?: string,
  minSteps: number = 1
): Promise<GeneratedPuzzle> {
  const fullEnvironment = await loadPracticeEnvironment()

  // If start and goal words are provided (shared puzzle), create a fixed puzzle
  if (sharedStartWord && sharedGoalWord) {
    const fallbackEnvironment = fullEnvironment === DEFAULT_ENVIRONMENT ? null : DEFAULT_ENVIRONMENT
    const startEntry =
      findWordEntry(sharedStartWord, fullEnvironment) ||
      (fallbackEnvironment ? findWordEntry(sharedStartWord, fallbackEnvironment) : null)
    const goalEntry =
      findWordEntry(sharedGoalWord, fullEnvironment) ||
      (fallbackEnvironment ? findWordEntry(sharedGoalWord, fallbackEnvironment) : null)
    
    if (!startEntry || !goalEntry) {
      throw new Error(`Invalid shared puzzle words: ${sharedStartWord} -> ${sharedGoalWord}`)
    }

    const seed = `shared-${sharedStartWord}-${sharedGoalWord}-${difficulty}`
    
    // Start and goal are always simple words (single part = the word itself)
    const startWord = sharedStartWord.toLowerCase()
    const goalWord = sharedGoalWord.toLowerCase()
    const startParts = [startWord]
    const goalParts = [goalWord]
    
    const wordParts: Record<string, string[]> = {}
    // Only include compound words in wordParts (not start/goal simple words)
    
    return {
      id: seed,
      seed,
      difficulty,
      startWord,
      goalWord,
      optimalSteps: 5, // Default optimal steps for shared puzzles
      isDaily: false,
      mode: 'practice',
      solutionPath: [startWord, goalWord], // Minimal path
      startParts,
      goalParts,
      wordParts,
    }
  }

  const range = DIFFICULTY_LENGTHS[difficulty] ?? DIFFICULTY_LENGTHS.medium
  const targetLength = randomInt(range.min, range.max)
  const lengthOptions = Array.from(new Set([targetLength, range.max, range.min])).filter(Boolean)

  let chain: WordEntry[] | null = null
  // For medium practice, try canonical words first, then fall back to full environment if needed
  const environmentsToTry =
    difficulty === 'easy'
      ? [DEFAULT_ENVIRONMENT, fullEnvironment]
      : difficulty === 'medium'
        ? [DEFAULT_ENVIRONMENT, fullEnvironment] // Allow full environment as fallback for medium
        : [fullEnvironment]

  for (const environment of environmentsToTry) {
    for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
      const lengthChoice = lengthOptions[attempt % lengthOptions.length] ?? targetLength
      const candidate = attemptBuildChain(lengthChoice, environment)
      if (!candidate) {
        continue
      }

      // Only check for trivial puzzles (start == goal) for hard difficulty
      // Allow medium to have start == goal if chain is long enough
      if (difficulty === 'hard' && startAndGoalSharePart(candidate)) {
        continue
      }

      // Enforce minimum steps: optimalSteps = chain.length - 1
      // For medium, allow at least 2 steps (chain of 3 words) - very lenient for suffix chaining
      const candidateOptimalSteps = Math.max(1, candidate.length - 1)
      const effectiveMinSteps = difficulty === 'medium' ? Math.max(2, minSteps) : Math.max(1, minSteps)
      if (candidateOptimalSteps < effectiveMinSteps) {
        continue
      }

      // For medium difficulty, skip bridge detection - accept any valid chain
      // Only check bridges for hard difficulty
      if (difficulty === 'hard') {
        const chainSteps = candidate.length - 1
        // Prevent trivial one-word bridge for very short chains
        if (chainSteps <= 3 && directBridgeExists(candidate[0], candidate[candidate.length - 1], environment)) {
          continue
        }
        // Prevent trivial two-step bridge for very short chains
        if (chainSteps <= 2 && twoStepBridgeExists(candidate[0], candidate[candidate.length - 1], environment)) {
          continue
        }
      }

      chain = candidate
      break
    }

    if (chain) {
      break
    }
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
    parts: entry.parts.length ? [...entry.parts] : parseCompoundWord(entry.word),
  }))

  const wordParts: Record<string, string[]> = {}
  for (const entry of normalizedChain) {
    wordParts[entry.word.toLowerCase()] = [...entry.parts]
  }

  // Start and goal are simple words (single part):
  // - Start = first part of first compound word in chain
  // - Goal = last part of last compound word in chain
  const firstCompound = normalizedChain[0]
  const lastCompound = normalizedChain[normalizedChain.length - 1]
  
  const startWord = firstCompound.parts.length > 0 ? firstCompound.parts[0] : firstCompound.word
  const goalWord = lastCompound.parts.length > 0 ? lastCompound.parts[lastCompound.parts.length - 1] : lastCompound.word
  
  // Start and goal are always single words (parts = [word])
  const startParts = [startWord]
  const goalParts = [goalWord]

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
    startParts,
    goalParts,
    wordParts,
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
  // Suffix chaining rule: candidate's FIRST part must match current's LAST part
  const currentLastPart = current.parts.length > 0 ? current.parts[current.parts.length - 1].toLowerCase() : null
  if (!currentLastPart) return null

  const candidates = environment.partIndex.get(currentLastPart)
  if (!candidates) return null

  const shuffled = seededShuffleInPlace([...candidates], random)
  for (const candidate of shuffled) {
    if (candidate.word === current.word) continue
    if (used.has(candidate.word)) continue

    // Verify suffix chaining: candidate's first part must match current's last part
    const candidateFirstPart = candidate.parts.length > 0 ? candidate.parts[0].toLowerCase() : null
    if (!candidateFirstPart || candidateFirstPart !== currentLastPart) continue

    used.add(candidate.word)
    return candidate
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
 * 
 * Uses only the canonical/common compound words (from compound-words.json)
 * to ensure daily puzzles use familiar, recognizable words.
 * Step length is medium (6-7 steps) for a good challenge.
 */
export async function generateDailyPuzzle(date: Date, options: DailyPuzzleOptions = {}): Promise<DailyPuzzleResult> {
  // For daily puzzles, prefer canonical words but allow filtered common words if needed
  // This ensures familiar, recognizable words while allowing suffix chain building
  
  // Start with canonical words, then add filtered common words from database if available
  const baseEnvironment = DEFAULT_ENVIRONMENT
  let environment = baseEnvironment
  
  // If we have wordEntries provided, merge in common words (words whose parts are all common)
  if (options.wordEntries && options.wordEntries.length > 0) {
    // Filter to words whose parts are all common/recognizable
    const commonParts = new Set([
      'air', 'any', 'back', 'ball', 'bed', 'bird', 'black', 'blue', 'book', 'box',
      'bread', 'break', 'butter', 'cake', 'car', 'card', 'care', 'coat', 'corn',
      'cup', 'day', 'dog', 'door', 'down', 'dream', 'drop', 'eye', 'fall', 'fire',
      'fish', 'flower', 'fly', 'foot', 'fruit', 'gold', 'grand', 'grass', 'green',
      'ground', 'gun', 'hair', 'hand', 'head', 'heart', 'high', 'hill', 'home',
      'honey', 'horse', 'hot', 'house', 'ice', 'key', 'land', 'life', 'light',
      'line', 'mail', 'man', 'meat', 'milk', 'mine', 'moon', 'mother', 'night',
      'out', 'over', 'pan', 'paper', 'pass', 'place', 'play', 'port', 'pot',
      'print', 'proof', 'rail', 'rain', 'ring', 'road', 'rock', 'room', 'sand',
      'sea', 'shine', 'ship', 'shoe', 'shop', 'side', 'silver', 'sky', 'snow',
      'some', 'son', 'star', 'step', 'stone', 'stop', 'storm', 'straw', 'sub', 'sun',
      'table', 'tail', 'thing', 'time', 'top', 'town', 'trap', 'tree', 'under',
      'up', 'walk', 'wall', 'ward', 'water', 'way', 'week', 'white', 'wind',
      'wood', 'work', 'worm', 'yard', 'berry', 'boat', 'bow', 'bush', 'chain',
      'cloth', 'craft', 'field', 'guard', 'keeper', 'knob', 'less', 'like',
      'maker', 'mark', 'master', 'mate', 'piece', 'plane', 'power', 'scape',
      'smith', 'ware', 'wheel', 'wise', 'wright', 'board', 'bridge', 'brook',
      'case', 'child', 'class', 'club', 'court', 'crew', 'cross', 'drive',
      'driver', 'farm', 'father', 'force', 'front', 'game', 'gate', 'girl',
      'glass', 'hill', 'hold', 'holder', 'iron', 'jack', 'king', 'lady', 'lane',
      'layer', 'lord', 'love', 'market', 'meal', 'mill', 'nail', 'neck', 'net',
      'news', 'note', 'pack', 'path', 'pen', 'point', 'pool', 'post', 'queen',
      'safe', 'sauce', 'school', 'shell'
    ])
    
    // Filter to words whose ALL parts are common
    const filteredEntries = options.wordEntries
      .map((entry) => toWordEntry(entry.word, entry.parts, 'runtime'))
      .filter((entry): entry is WordEntry => {
        if (!entry || entry.parts.length < 2) return false
        // Only include if ALL parts are common words
        return entry.parts.every(part => commonParts.has(part.toLowerCase()))
      })
    
    // Merge with canonical words
    const merged = new Map<string, WordEntry>()
    for (const entry of environment.words) {
      merged.set(entry.word, entry)
    }
    for (const entry of filteredEntries) {
      if (!merged.has(entry.word)) {
        merged.set(entry.word, entry)
      }
    }
    
    if (merged.size > environment.words.length) {
      environment = createEnvironment(Array.from(merged.values()))
    }
  }

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

    // Enforce minimum steps for daily (5, same as medium practice)
    const minSteps = Math.max(5, options.minSteps ?? 5)
    const candidateOptimalSteps = Math.max(1, candidate.length - 1)
    if (candidateOptimalSteps < minSteps) {
      continue
    }

    // Prevent trivial one-word bridge between start and goal
    if (directBridgeExists(candidate[0], candidate[candidate.length - 1], environment)) {
      continue
    }

    // Prevent trivial two-step bridge (same as medium practice)
    if (twoStepBridgeExists(candidate[0], candidate[candidate.length - 1], environment)) {
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

  // Start and goal are simple words:
  // - Start = first part of first compound word in chain
  // - Goal = last part of last compound word in chain
  const firstCompound = chain[0]
  const lastCompound = chain[chain.length - 1]
  
  const startWord = firstCompound.parts.length > 0 ? firstCompound.parts[0] : firstCompound.word
  const goalWord = lastCompound.parts.length > 0 ? lastCompound.parts[lastCompound.parts.length - 1] : lastCompound.word

  return {
    startWord,
    goalWord,
    optimalSteps,
    solutionPath: wordsOnly,
  }
}
