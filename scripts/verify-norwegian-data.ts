import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { CompactCompoundDictionary } from '../types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LETTERS = /^[a-zæøå]+$/u
const compact = JSON.parse(readFileSync(join(ROOT, 'public', 'dictionary', 'compound-words.json'), 'utf8')) as CompactCompoundDictionary
const metadata = JSON.parse(readFileSync(join(ROOT, 'data', 'compound-build-metadata.json'), 'utf8')) as {
  version: number
  sourceIntegrity: {
    eieslandRows: number
    eieslandExpectedRows: number
    nowacApplied: boolean
    checksums: Record<string, string>
  }
  frequencyPolicy: { version: number; pathAggregation: string }
}
const graphStats = JSON.parse(readFileSync(join(ROOT, 'data', 'compound-graph-stats.json'), 'utf8')) as {
  version: number
  frequencyPolicyVersion: number
  tiers: Array<{ tier: string; nodes: number; compounds: number; analyses: number; largestWeakComponent: number }>
}
const daily = JSON.parse(readFileSync(join(ROOT, 'data', 'daily-puzzles.json'), 'utf8')) as Record<string, {
  dictionaryVersion: number
  tierPolicyVersion: number
  tier: 'medium'
  startWord: string
  goalWord: string
  parSteps: number
  absoluteOptimalSteps?: number
  solutionPath: string[]
  solutionAnalysisIds: number[]
}>

type DecodedAnalysis = {
  id: number
  word: string
  parts: string[]
  terminalParts: string[]
  incomingKeys: string[]
  outgoingKeys: string[]
  insert: string
  deleted: string
  nb: number
  nowacLemma: number
  eiesland: number
  familiarity: number
  incomingSalience: number[]
  incomingTiers: number[]
}

const fail = (message: string): never => { throw new Error(message) }
if (compact.v !== 3 || metadata.version !== 3) fail('Unsupported dictionary version')
if (metadata.frequencyPolicy.version !== 2 || metadata.frequencyPolicy.pathAggregation !== 'weakest-edge') {
  fail('Unsupported frequency policy')
}
if (!metadata.sourceIntegrity.nowacApplied) fail('NoWaC lemma frequencies were not applied')
if (metadata.sourceIntegrity.eieslandRows !== 60_865 || metadata.sourceIntegrity.eieslandExpectedRows !== 60_865) {
  fail('Eiesland source-row integrity failed')
}
if (Object.values(metadata.sourceIntegrity.checksums).some(value => !/^[a-f0-9]{64}$/.test(value))) fail('Invalid source checksum')
if (graphStats.version !== 2 || graphStats.frequencyPolicyVersion !== 2 || graphStats.tiers.length !== 3) {
  fail('Invalid graph statistics')
}

const strings = compact.s
const analyses: DecodedAnalysis[] = compact.a.map((raw, id) => {
  const row = raw as [number, number[], number[], number[], number[], number, number, number, number, number, number, number, number, number, number, number[], number[]]
  if (row[7] <= 0) fail(`Analysis ${id} has no provenance`)
  if (row[15].length !== row[3].length || row[16].length !== row[3].length) fail(`Analysis ${id} has invalid transition policy`)
  if (row[16].some(tier => ![-1, 0, 1, 2].includes(tier))) fail(`Analysis ${id} has an invalid generation tier`)
  if ([row[11], row[12], row[13], row[14], ...row[15]].some(value => value < 0 || value > 1)) {
    fail(`Analysis ${id} has an invalid frequency score`)
  }
  return {
    id,
    word: strings[row[0]],
    parts: row[1].map(value => strings[value]),
    terminalParts: row[2].map(value => strings[value]),
    incomingKeys: row[3].map(value => strings[value]),
    outgoingKeys: row[4].map(value => strings[value]),
    insert: row[5] >= 0 ? strings[row[5]] : '',
    deleted: row[6] >= 0 ? strings[row[6]] : '',
    nb: row[8],
    nowacLemma: row[9],
    eiesland: row[10],
    familiarity: row[14],
    incomingSalience: row[15],
    incomingTiers: row[16],
  }
})

const byWord = new Map<string, DecodedAnalysis[]>()
for (const analysis of analyses) {
  if (!LETTERS.test(analysis.word) || analysis.parts.length !== 2 || analysis.terminalParts.length < 2) {
    fail(`Invalid analysis: ${analysis.word}`)
  }
  let left = analysis.parts[0]
  if (analysis.deleted) {
    if (!left.endsWith(analysis.deleted)) fail(`Invalid deletion for ${analysis.word}`)
    left = left.slice(0, -analysis.deleted.length)
  }
  if (left + analysis.insert + analysis.parts[1] !== analysis.word) fail(`Analysis does not reconstruct ${analysis.word}`)
  if (!analysis.incomingKeys.includes(analysis.parts[0]) || !analysis.outgoingKeys.includes(analysis.parts[1])) {
    fail(`Immediate keys missing: ${analysis.word}`)
  }
  const options = byWord.get(analysis.word) ?? []
  options.push(analysis)
  byWord.set(analysis.word, options)
}

function shortestSteps(start: string, goal: string, maxTier?: number): number | null {
  const incoming = new Map<string, DecodedAnalysis[]>()
  for (const analysis of analyses) {
    analysis.incomingKeys.forEach((key, keyIndex) => {
      if (maxTier !== undefined && (analysis.incomingTiers[keyIndex] < 0 || analysis.incomingTiers[keyIndex] > maxTier)) return
      const candidates = incoming.get(key) ?? []
      candidates.push(analysis)
      incoming.set(key, candidates)
    })
  }
  const queue: Array<{ key: string; depth: number }> = [{ key: start, depth: 0 }]
  const seen = new Set([start])
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]
    for (const analysis of incoming.get(current.key) ?? []) {
      if (analysis.outgoingKeys.includes(goal)) return current.depth + 1
      for (const key of analysis.outgoingKeys) {
        if (seen.has(key)) continue
        seen.add(key)
        queue.push({ key, depth: current.depth + 1 })
      }
    }
  }
  return null
}

for (const [date, puzzle] of Object.entries(daily)) {
  if (puzzle.dictionaryVersion !== 3 || puzzle.tierPolicyVersion !== 2 || puzzle.tier !== 'medium') {
    fail(`${date}: unsupported dictionary policy`)
  }
  if (!LETTERS.test(puzzle.startWord) || !LETTERS.test(puzzle.goalWord)) fail(`${date}: invalid endpoint`)
  if (!Array.isArray(puzzle.solutionPath) || puzzle.solutionPath.length !== puzzle.parSteps) fail(`${date}: invalid solution length`)
  if (!Array.isArray(puzzle.solutionAnalysisIds) || puzzle.solutionAnalysisIds.length !== puzzle.solutionPath.length) {
    fail(`${date}: invalid solution analysis IDs`)
  }
  let outgoing = new Set([puzzle.startWord])
  for (let index = 0; index < puzzle.solutionPath.length; index++) {
    const word = puzzle.solutionPath[index]
    const analysis = analyses[puzzle.solutionAnalysisIds[index]]
    const eligibleTransition = analysis?.incomingKeys.some((key, keyIndex) =>
      outgoing.has(key) && analysis.incomingTiers[keyIndex] >= 0 && analysis.incomingTiers[keyIndex] <= 1
    )
    if (!analysis || analysis.word !== word || !eligibleTransition) fail(`${date}: solution does not chain at ${word}`)
    outgoing = new Set(analysis.outgoingKeys)
  }
  if (!outgoing.has(puzzle.goalWord)) fail(`${date}: solution does not reach ${puzzle.goalWord}`)
  const par = shortestSteps(puzzle.startWord, puzzle.goalWord, 1)
  if (par !== puzzle.parSteps) fail(`${date}: expected par ${puzzle.parSteps}, found ${par}`)
  const absolute = shortestSteps(puzzle.startWord, puzzle.goalWord)
  if (absolute !== null && absolute > puzzle.parSteps) fail(`${date}: full-graph optimum exceeds tier par`)
  if (puzzle.absoluteOptimalSteps !== undefined && absolute !== puzzle.absoluteOptimalSteps) {
    fail(`${date}: expected absolute optimum ${puzzle.absoluteOptimalSteps}, found ${absolute}`)
  }
}

for (let tier = 0; tier < 3; tier++) {
  const expected = graphStats.tiers[tier]
  const eligible = analyses.filter(analysis => analysis.incomingTiers.some(value => value >= 0 && value <= tier))
  const analysisCount = eligible.length
  const compoundCount = new Set(eligible.map(analysis => analysis.word)).size
  const nodeCount = compact.n.filter(row => row[9] >= 0 && row[9] <= tier).length
  if (expected.analyses !== analysisCount || expected.compounds !== compoundCount || expected.nodes !== nodeCount) {
    fail(`${expected.tier}: graph statistics do not match runtime artifact`)
  }
  if (expected.largestWeakComponent <= 0) fail(`${expected.tier}: graph has no connected component`)
}

const nestedExample = byWord.get('fotballspiller') ?? []
if (!nestedExample.some(entry => entry.incomingKeys.includes('fot') && entry.incomingKeys.includes('fotball'))) {
  fail('Dual immediate/terminal chaining is missing for fotballspiller')
}

console.log(`Verified ${byWord.size} compounds, ${analyses.length} analyses, and ${Object.keys(daily).length} frequency-gated daily puzzles.`)
