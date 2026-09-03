import type { PuzzleDifficulty, PracticePuzzle } from '@/types'
import { weakestEdgeScore } from '@/lib/frequency-policy'
import {
  createEnvironment,
  getEligibleIncomingKeys,
  findMatchingKey,
  getEndpointKeys,
  getEnvironment,
  getFullEnvironment,
  toWordEntry,
  type WordEntry,
  type WordEnvironment,
} from '@/lib/dictionary'

interface GeneratedPuzzle extends PracticePuzzle {
  solutionPath: string[]
  solutionAnalysisIds: number[]
}

interface DailyPuzzleResult {
  startWord: string
  goalWord: string
  parSteps: number
  absoluteOptimalSteps?: number
  solutionPath: string[]
  solutionAnalysisIds: number[]
}

interface DailyPuzzleOptions {
  wordEntries?: WordEntry[]
  minSteps?: number
}

const DIFFICULTY_LENGTHS: Record<PuzzleDifficulty, { min: number; max: number }> = {
  easy: { min: 2, max: 3 },
  medium: { min: 3, max: 4 },
  hard: { min: 4, max: 5 },
}

const MAX_CHAIN_ATTEMPTS = 800 // Increased for suffix chaining which is more restrictive

function findShortestChain(
  startKey: string,
  goalKey: string,
  environment: WordEnvironment
): WordEntry[] | null {
  const queue: Array<{ key: string; path: WordEntry[] }> = [{ key: startKey, path: [] }]
  const bestDepth = new Map<string, number>([[startKey, 0]])

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const current = queue[queueIndex]
    for (const candidate of environment.incomingIndex.get(current.key) ?? []) {
      if (current.path.some(entry => entry.word === candidate.word)) continue
      const path = [...current.path, candidate]
      if (candidate.outgoingKeys.includes(goalKey)) return path

      for (const nextKey of candidate.outgoingKeys) {
        if ((bestDepth.get(nextKey) ?? Infinity) <= path.length) continue
        bestDepth.set(nextKey, path.length)
        queue.push({ key: nextKey, path })
      }
    }
  }
  return null
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

function weightedShuffleInPlace(array: WordEntry[]): WordEntry[] {
  return array
    .map(entry => ({ entry, key: -Math.log(Math.max(Math.random(), Number.EPSILON)) / Math.exp(entry.frequency * 6) }))
    .sort((left, right) => left.key - right.key)
    .map(value => value.entry)
}

function seededShuffleInPlace<T>(array: T[], random: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function seededWeightedShuffle(array: WordEntry[], random: () => number): WordEntry[] {
  return array
    .map(entry => ({ entry, key: -Math.log(Math.max(random(), Number.EPSILON)) / Math.exp(entry.frequency * 6) }))
    .sort((left, right) => left.key - right.key)
    .map(value => value.entry)
}

function pickRandomStart(environment: WordEnvironment, difficulty: PuzzleDifficulty): WordEntry {
  const layeredWords = environment.words.filter((entry) =>
    getEndpointKeys(getEligibleIncomingKeys(entry, difficulty), difficulty).length > 0
  )
  const pool = layeredWords.length > 0 ? layeredWords : environment.words

  if (pool.length === 0) {
    throw new Error('No available words to generate a puzzle')
  }

  return pool[randomInt(0, pool.length - 1)]
}

function pickNextWord(current: WordEntry, used: Set<string>, environment: WordEnvironment): WordEntry | null {
  const candidates = [...new Map(current.outgoingKeys.flatMap(key =>
    environment.incomingIndex.get(key) ?? []
  ).map(entry => [entry.word, entry])).values()]
  if (candidates.length === 0) return null

  const shuffled = weightedShuffleInPlace([...candidates])
  for (const candidate of shuffled) {
    if (candidate.word === current.word) continue
    if (used.has(candidate.word)) continue

    if (!findMatchingKey(current.outgoingKeys, candidate.incomingKeys)) continue

    used.add(candidate.word)
    return candidate
  }

  return null
}

function attemptBuildChain(targetLength: number, environment: WordEnvironment, endpointDifficulty: PuzzleDifficulty): WordEntry[] | null {
  if (environment.words.length === 0) {
    return null
  }

  const chain: WordEntry[] = []
  const used = new Set<string>()
  const start = pickRandomStart(environment, endpointDifficulty)
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

  return success && chain.length === targetLength ? chain : null
}

function startAndGoalSharePart(chain: WordEntry[], endpointDifficulty: PuzzleDifficulty): boolean {
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
  
  const startWord = getEndpointKeys(getEligibleIncomingKeys(chain[0], endpointDifficulty), endpointDifficulty).at(-1)
  const goalWord = getEndpointKeys(chain.at(-1)!.outgoingKeys, endpointDifficulty).at(-1)
  if (!startWord || !goalWord) return true
  
  return startWord === goalWord
}

// Detect if there exists a direct one-word bridge that connects start to goal via suffix chaining
// With suffix chaining: a word exists that starts with start word and ends with goal word
function directBridgeExists(start: WordEntry, goal: WordEntry, environment: WordEnvironment): boolean {
  // Extract actual start and goal words (first part of start, last part of goal)
  const startWord = start.startKeys.at(-1)
  const goalWord = goal.goalKeys.at(-1)
  if (!startWord || !goalWord) return true
  
  // Check if there's a compound word that starts with startWord and ends with goalWord
  // This would be a trivial one-word solution: startWord + ... + goalWord = compound
  for (const candidate of environment.words) {
    if (candidate.parts.length < 2) continue
    
    if (candidate.incomingKeys.includes(startWord) && candidate.outgoingKeys.includes(goalWord)) {
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
  const startWord = start.startKeys.at(-1)
  const goalWord = goal.goalKeys.at(-1)
  if (!startWord || !goalWord) return true
  
  // Check for two-step bridge: startWord -> word1 -> word2 -> goalWord
  // word1 must start with startWord
  // word2 must start with word1's last part and end with goalWord
  for (const word1 of environment.words) {
    if (word1.parts.length < 2) continue
    
    if (!word1.incomingKeys.includes(startWord)) continue
    
    // Now find word2 that starts with word1's last part and ends with goalWord
    for (const word2 of environment.words) {
      if (word2.word === word1.word) continue
      if (word2.parts.length < 2) continue
      
      if (findMatchingKey(word1.outgoingKeys, word2.incomingKeys) && word2.outgoingKeys.includes(goalWord)) {
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

// Practice puzzles load the compact static dictionary without a database.
async function loadPracticeEnvironment(): Promise<WordEnvironment> {
  return getFullEnvironment()
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
    const startEntry = findWordEntry(sharedStartWord, fullEnvironment)
    const goalEntry = findWordEntry(sharedGoalWord, fullEnvironment)
    
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
      parSteps: 5,
      isDaily: false,
      mode: 'practice',
      solutionPath: [startWord, goalWord], // Minimal path
      solutionAnalysisIds: [],
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
  const environmentsToTry = [await getEnvironment(difficulty)]

  for (const environment of environmentsToTry) {
    for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
      const lengthChoice = lengthOptions[attempt % lengthOptions.length] ?? targetLength
      const candidate = attemptBuildChain(lengthChoice, environment, difficulty)
      if (!candidate) {
        continue
      }

      // Only check for trivial puzzles (start == goal) for hard difficulty
      // Allow medium to have start == goal if chain is long enough
      if (difficulty === 'hard' && startAndGoalSharePart(candidate, difficulty)) {
        continue
      }

      const effectiveMinSteps = Math.max(range.min, minSteps)
      const startKey = getEndpointKeys(getEligibleIncomingKeys(candidate[0], difficulty), difficulty).at(-1)
      const goalKey = getEndpointKeys(candidate.at(-1)!.outgoingKeys, difficulty).at(-1)
      if (!startKey || !goalKey) continue
      const shortest = findShortestChain(startKey, goalKey, environment)
      if (!shortest || shortest.length < effectiveMinSteps || shortest.length > range.max) continue

      chain = shortest
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
  const parSteps = chain.length
  const seed = `practice-${difficulty}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

  const normalizedChain = chain.map((entry) => ({
    word: entry.word,
    parts: [...entry.parts],
  }))

  const wordParts: Record<string, string[]> = {}
  for (const entry of normalizedChain) {
    wordParts[entry.word.toLowerCase()] = [...entry.parts]
  }

  // Start and goal are simple words (single part):
  // - Start = first part of first compound word in chain
  // - Goal = last part of last compound word in chain
  const startWord = getEndpointKeys(getEligibleIncomingKeys(chain[0], difficulty), difficulty).at(-1)!
  const goalWord = getEndpointKeys(chain.at(-1)!.outgoingKeys, difficulty).at(-1)!
  
  // Start and goal are always single words (parts = [word])
  const startParts = [startWord]
  const goalParts = [goalWord]

  return {
    id: seed,
    seed,
    difficulty,
    startWord,
    goalWord,
    parSteps,
    absoluteOptimalSteps: findShortestChain(startWord, goalWord, fullEnvironment)?.length,
    isDaily: false,
    mode: 'practice',
    solutionPath: wordsOnly,
    solutionAnalysisIds: chain.map(entry => entry.analysisId),
    startParts,
    goalParts,
    wordParts,
  }
}

// Seeded versions for daily puzzle generation
function pickSeededRandomStart(random: () => number, environment: WordEnvironment, endpointDifficulty: PuzzleDifficulty): WordEntry {
  const layeredWords = environment.words.filter((entry) =>
    getEndpointKeys(getEligibleIncomingKeys(entry, endpointDifficulty), endpointDifficulty).length > 0
  )
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
  const candidates = [...new Map(current.outgoingKeys.flatMap(key =>
    environment.incomingIndex.get(key) ?? []
  ).map(entry => [entry.word, entry])).values()]
  if (candidates.length === 0) return null

  const shuffled = seededWeightedShuffle([...candidates], random)
  for (const candidate of shuffled) {
    if (candidate.word === current.word) continue
    if (used.has(candidate.word)) continue

    if (!findMatchingKey(current.outgoingKeys, candidate.incomingKeys)) continue

    used.add(candidate.word)
    return candidate
  }

  return null
}

function attemptSeededBuildChain(
  targetLength: number,
  random: () => number,
  environment: WordEnvironment,
  endpointDifficulty: PuzzleDifficulty
): WordEntry[] | null {
  if (environment.words.length === 0) {
    return null
  }

  const chain: WordEntry[] = []
  const used = new Set<string>()
  const start = pickSeededRandomStart(random, environment, endpointDifficulty)
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

  return success && chain.length === targetLength ? chain : null
}

function findSeededChainAtDepth(
  startKey: string,
  minDepth: number,
  maxDepth: number,
  random: () => number,
  environment: WordEnvironment,
  endpointDifficulty: PuzzleDifficulty
): { goalKey: string; chain: WordEntry[] } | null {
  const queue: Array<{ key: string; depth: number }> = [{ key: startKey, depth: 0 }]
  const seen = new Set([startKey])
  const predecessor = new Map<string, { previousKey: string; entry: WordEntry }>()
  const goals: string[] = []

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]
    if (current.depth >= maxDepth) continue
    for (const entry of environment.incomingIndex.get(current.key) ?? []) {
      for (const nextKey of entry.outgoingKeys) {
        if (seen.has(nextKey)) continue
        const depth = current.depth + 1
        seen.add(nextKey)
        predecessor.set(nextKey, { previousKey: current.key, entry })
        queue.push({ key: nextKey, depth })
        if (
          depth >= minDepth &&
          nextKey !== startKey &&
          getEndpointKeys([nextKey], endpointDifficulty).length > 0
        ) {
          goals.push(nextKey)
        }
      }
    }
  }

  const paths = goals.flatMap(goalKey => {
    const chain: WordEntry[] = []
    let key = goalKey
    while (key !== startKey) {
      const step = predecessor.get(key)
      if (!step) break
      chain.unshift(step.entry)
      key = step.previousKey
    }
    return key === startKey && new Set(chain.map(entry => entry.word)).size === chain.length
      ? [{ goalKey, chain, score: weakestEdgeScore(chain.map(entry => entry.frequency)) }]
      : []
  })
  if (paths.length > 0) {
    const ordered = paths
      .map(path => ({ path, key: -Math.log(Math.max(random(), Number.EPSILON)) / Math.exp(path.score * 8) }))
      .sort((left, right) => left.key - right.key)
    const selected = ordered[0].path
    return { goalKey: selected.goalKey, chain: selected.chain }
  }
  return null
}

/**
 * Generate a daily puzzle for a specific date.
 * Uses a seeded random number generator to ensure the same puzzle
 * is generated for the same date, even across different servers.
 * 
 * Uses the medium graph with easy-tier noun endpoints.
 * Step length follows the medium 3-4 step range.
 */
export async function generateDailyPuzzle(date: Date, options: DailyPuzzleOptions = {}): Promise<DailyPuzzleResult> {
  // For daily puzzles, prefer canonical words but allow filtered common words if needed
  // This ensures familiar, recognizable words while allowing suffix chain building
  
  // Start with canonical words, then add filtered common words from database if available
  const baseEnvironment = await getEnvironment('medium')
  let environment = baseEnvironment
  
  // If we have wordEntries provided, merge in common words (words whose parts are all common)
  if (options.wordEntries && options.wordEntries.length > 0) {
    // Filter to words whose parts are all common/recognizable Norwegian words
    const filteredEntries = options.wordEntries
      .map((entry) => toWordEntry(entry.word, entry.parts, 'runtime'))
      .filter((entry): entry is WordEntry => {
        if (!entry || entry.parts.length < 2) return false
        return entry.source === 'canonical'
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
      environment = createEnvironment(Array.from(merged.values()), 1)
    }
  }

  if (environment.words.length === 0) {
    throw new Error('No compound words available for daily puzzle generation')
  }

  const seed = dateToSeed(date)
  const random = createSeededRandom(seed)
  
  // Daily puzzles are always medium difficulty
  const range = DIFFICULTY_LENGTHS.medium
  const startKeys = [...new Set(environment.words.flatMap(entry => getEndpointKeys(entry.incomingKeys, 'easy')))]
    .filter(key => environment.incomingIndex.has(key))
  seededShuffleInPlace(startKeys, random)
  let selected: { startKey: string; goalKey: string; chain: WordEntry[] } | null = null
  for (const startKey of startKeys) {
    const result = findSeededChainAtDepth(startKey, options.minSteps ?? range.min, range.max, random, environment, 'easy')
    if (!result) continue
    selected = { startKey, ...result }
    break
  }

  if (!selected) {
    throw new Error('Unable to generate a valid daily puzzle')
  }

  const { startKey: startWord, goalKey: goalWord, chain } = selected
  const wordsOnly = chain.map((entry) => entry.word)
  const parSteps = chain.length

  return {
    startWord,
    goalWord,
    parSteps,
    absoluteOptimalSteps: findShortestChain(startWord, goalWord, await getFullEnvironment())?.length,
    solutionPath: wordsOnly,
    solutionAnalysisIds: chain.map(entry => entry.analysisId),
  }
}
