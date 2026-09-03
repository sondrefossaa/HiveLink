import type { CompactCompoundDictionary, PuzzleDifficulty } from '@/types'
import { normalizeNo } from '@/lib/norwegian-dictionary'

export interface WordEntry {
  analysisId: number
  word: string
  parts: string[]
  terminalParts: string[]
  incomingKeys: string[]
  outgoingKeys: string[]
  startKeys: string[]
  goalKeys: string[]
  frequency: number
  tier: PuzzleDifficulty
  source: 'canonical' | 'runtime'
}

export interface WordEnvironment {
  words: WordEntry[]
  incomingIndex: Map<string, WordEntry[]>
}

const TIER_NAMES: PuzzleDifficulty[] = ['easy', 'medium', 'hard']
const TIER_RANK: Record<PuzzleDifficulty, number> = { easy: 0, medium: 1, hard: 2 }
let loadPromise: Promise<void> | null = null
let canonicalWords: WordEntry[] = []
let wordEntriesMap = new Map<string, WordEntry[]>()
let nodeInfo = new Map<string, { noun: boolean; tier: number }>()
const environments = new Map<PuzzleDifficulty, WordEnvironment>()

async function readCompactDictionary(): Promise<CompactCompoundDictionary> {
  if (typeof window !== 'undefined') {
    const response = await fetch('/dictionary/compound-words.json')
    if (!response.ok) throw new Error(`Kunne ikke laste ordlisten (${response.status})`)
    return response.json() as Promise<CompactCompoundDictionary>
  }

  const fsModule = 'node:fs/promises'
  const pathModule = 'node:path'
  const [{ readFile }, { join }] = await Promise.all([
    import(/* webpackIgnore: true */ fsModule),
    import(/* webpackIgnore: true */ pathModule),
  ])
  return JSON.parse(await readFile(join(process.cwd(), 'public', 'dictionary', 'compound-words.json'), 'utf8')) as CompactCompoundDictionary
}

async function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const compact = await readCompactDictionary()
    const strings = compact.s
    nodeInfo = new Map(compact.n.map(row => [strings[row[0]], { noun: row[1] === 1, tier: row[7] }]))
    canonicalWords = compact.a.map((raw, analysisId) => {
      const row = raw as [number, number[], number[], number[], number[], number, number, number, number, number, number, number, number]
      const decode = (ids: number[]) => ids.map(id => strings[id])
      const incomingKeys = decode(row[3])
      const outgoingKeys = decode(row[4])
      return {
        analysisId,
        word: strings[row[0]],
        parts: decode(row[1]),
        terminalParts: decode(row[2]),
        incomingKeys,
        outgoingKeys,
        startKeys: incomingKeys.filter(key => nodeInfo.get(key)?.noun),
        goalKeys: outgoingKeys.filter(key => nodeInfo.get(key)?.noun),
        frequency: row[8],
        tier: TIER_NAMES[row[12]] ?? 'hard',
        source: 'canonical' as const,
      }
    })
    wordEntriesMap = new Map()
    for (const entry of canonicalWords) {
      const entries = wordEntriesMap.get(entry.word) ?? []
      entries.push(entry)
      wordEntriesMap.set(entry.word, entries)
    }
  })()
  return loadPromise
}

export function toWordEntry(word: string, parts?: string[], source: WordEntry['source'] = 'runtime'): WordEntry | null {
  const normalizedWord = normalizeNo(word)
  const canonical = wordEntriesMap.get(normalizedWord)?.[0]
  if (canonical) return canonical
  const normalizedParts = [...new Set((parts ?? []).map(normalizeNo).filter(Boolean))]
  if (normalizedParts.length < 2 || normalizedParts.join('') !== normalizedWord) return null
  return {
    analysisId: -1,
    word: normalizedWord,
    parts: normalizedParts,
    terminalParts: normalizedParts,
    incomingKeys: [normalizedParts[0]],
    outgoingKeys: [normalizedParts.at(-1)!],
    startKeys: [],
    goalKeys: [],
    frequency: 0,
    tier: 'hard',
    source,
  }
}

export function createEnvironment(entries: WordEntry[]): WordEnvironment {
  const words = [...entries].sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word, 'nb'))
  const incomingIndex = new Map<string, WordEntry[]>()
  for (const entry of words) {
    for (const key of entry.incomingKeys) {
      const candidates = incomingIndex.get(key) ?? []
      candidates.push(entry)
      incomingIndex.set(key, candidates)
    }
  }
  return { words, incomingIndex }
}

export async function getEnvironment(difficulty: PuzzleDifficulty = 'hard'): Promise<WordEnvironment> {
  await ensureLoaded()
  const cached = environments.get(difficulty)
  if (cached) return cached
  const rank = TIER_RANK[difficulty]
  const environment = createEnvironment(canonicalWords.filter(entry => TIER_RANK[entry.tier] <= rank))
  environments.set(difficulty, environment)
  return environment
}

export function getEndpointKeys(keys: string[], difficulty: PuzzleDifficulty): string[] {
  const rank = TIER_RANK[difficulty]
  return keys.filter(key => {
    const node = nodeInfo.get(key)
    return node?.noun && node.tier <= rank
  })
}

export async function getWordEntriesForWord(word: string): Promise<WordEntry[]> {
  await ensureLoaded()
  return [...(wordEntriesMap.get(normalizeNo(word)) ?? [])]
}

export async function getWordEntry(word: string): Promise<WordEntry | null> {
  return (await getWordEntriesForWord(word))[0] ?? null
}

export async function hasDictionaryWord(word: string): Promise<boolean> {
  await ensureLoaded()
  return wordEntriesMap.has(normalizeNo(word))
}

export function findMatchingKey(outgoingKeys: string[], incomingKeys: string[]): string | null {
  const incoming = new Set(incomingKeys.map(normalizeNo))
  return outgoingKeys.map(normalizeNo).find(key => incoming.has(key)) ?? null
}
