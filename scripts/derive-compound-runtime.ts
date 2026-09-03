import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  FREQUENCY_POLICY_VERSION,
  GENERATION_THRESHOLDS,
  compoundFamiliarity,
  endpointFamiliarity,
  endpointTier,
  generationTier,
  normalizedContinuationRank,
} from '../lib/frequency-policy'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = join(ROOT, 'data', 'compound-build.json')
const OUTPUT = join(ROOT, 'public', 'dictionary', 'compound-words.json')
const STATS_OUTPUT = join(ROOT, 'data', 'compound-graph-stats.json')
const METADATA_OUTPUT = join(ROOT, 'data', 'compound-build-metadata.json')
const SOURCE_MASK: Record<string, number> = { ordbank: 1, nst: 2, eiesland: 4, manual: 8 }

interface Metric { count: number; rank: number | null; percentile: number }
interface FrequencyEvidence { nb?: number; nowacLemma?: number; eiesland?: number }
interface RichNode {
  word: string
  nounVerified: boolean
  nb: Metric
  frequency: FrequencyEvidence
  inDegree: number
  outDegree: number
}
interface RichAnalysis {
  parts: [string, string]
  terminalParts: string[]
  incomingKeys: string[]
  outgoingKeys: string[]
  linker: string
  deleted: string
  sources: string[]
}
interface RichCompound {
  word: string
  nb: Metric
  frequency: FrequencyEvidence
  eieslandCount: number
  analyses: RichAnalysis[]
}
interface RichBuild {
  version: number
  sourceIntegrity: Record<string, unknown>
  nodes: RichNode[]
  compounds: RichCompound[]
}

function percentiles<T>(items: T[], count: (item: T) => number): number[] {
  const positive = items.map(count).filter(value => value > 0).sort((a, b) => a - b)
  const lowerBound = (target: number): number => {
    let low = 0
    let high = positive.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (positive[middle] < target) low = middle + 1
      else high = middle
    }
    return low
  }
  return items.map(item => {
    const value = count(item)
    return value > 0 && positive.length > 1 ? lowerBound(value) / (positive.length - 1) : 0
  })
}

if (!existsSync(INPUT)) throw new Error(`Missing rich build artifact: ${INPUT}`)
const rich = JSON.parse(readFileSync(INPUT, 'utf8')) as RichBuild
if (rich.version !== 3) throw new Error(`Unsupported rich build version: ${rich.version}`)

const nodeNbPercentiles = percentiles(rich.nodes, node => node.frequency.nb ?? 0)
const nodeNowacPercentiles = percentiles(rich.nodes, node => node.frequency.nowacLemma ?? 0)
const nodeFamiliarities = rich.nodes.map((_, index) => endpointFamiliarity({
  nb: nodeNbPercentiles[index],
  nowacLemma: nodeNowacPercentiles[index],
}))
const nodeTiers = nodeFamiliarities.map(endpointTier)
const compoundNbPercentiles = percentiles(rich.compounds, compound => compound.frequency.nb ?? 0)
const compoundNowacPercentiles = percentiles(rich.compounds, compound => compound.frequency.nowacLemma ?? 0)
const compoundEieslandPercentiles = percentiles(rich.compounds, compound => compound.frequency.eiesland ?? 0)
const compoundFamiliarities = rich.compounds.map((_, index) => compoundFamiliarity({
  nb: compoundNbPercentiles[index],
  nowacLemma: compoundNowacPercentiles[index],
  eiesland: compoundEieslandPercentiles[index],
}))

const continuationWords = new Map<string, Set<number>>()
rich.compounds.forEach((compound, compoundIndex) => {
  for (const analysis of compound.analyses) {
    for (const key of analysis.incomingKeys) {
      const candidates = continuationWords.get(key) ?? new Set<number>()
      candidates.add(compoundIndex)
      continuationWords.set(key, candidates)
    }
  }
})

const salienceByTransition = new Map<string, number>()
for (const [key, candidates] of continuationWords) {
  const ranked = [...candidates].sort((left, right) =>
    compoundFamiliarities[right] - compoundFamiliarities[left] ||
    rich.compounds[left].word.localeCompare(rich.compounds[right].word, 'nb')
  )
  let rank = 1
  for (let index = 0; index < ranked.length; index++) {
    if (index > 0 && compoundFamiliarities[ranked[index]] < compoundFamiliarities[ranked[index - 1]]) rank = index + 1
    salienceByTransition.set(`${key}\0${ranked[index]}`, normalizedContinuationRank(rank, ranked.length))
  }
}

const compoundPolicies = rich.compounds.map((compound, compoundIndex) => compound.analyses.map(analysis => {
  const incomingSalience = analysis.incomingKeys.map(key => salienceByTransition.get(`${key}\0${compoundIndex}`) ?? 0)
  const incomingTiers = incomingSalience.map(salience => generationTier(compoundFamiliarities[compoundIndex], salience))
  return { incomingSalience, incomingTiers }
}))
const analysisPolicy = compoundPolicies.flat()

function connectivity(maxTier: number): { activeKeys: number; largestWeakComponent: number } {
  const parent = new Map<string, string>()
  const root = (key: string): string => {
    const current = parent.get(key)
    if (!current) {
      parent.set(key, key)
      return key
    }
    if (current === key) return key
    const resolved = root(current)
    parent.set(key, resolved)
    return resolved
  }
  const union = (left: string, right: string) => {
    const leftRoot = root(left)
    const rightRoot = root(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }
  let policyIndex = 0
  for (const compound of rich.compounds) {
    for (const analysis of compound.analyses) {
      const policy = analysisPolicy[policyIndex++]
      analysis.incomingKeys.forEach((incoming, incomingIndex) => {
        if (policy.incomingTiers[incomingIndex] < 0 || policy.incomingTiers[incomingIndex] > maxTier) return
        for (const outgoing of analysis.outgoingKeys) union(incoming, outgoing)
      })
    }
  }
  const sizes = new Map<string, number>()
  for (const key of parent.keys()) {
    const resolved = root(key)
    sizes.set(resolved, (sizes.get(resolved) ?? 0) + 1)
  }
  return { activeKeys: parent.size, largestWeakComponent: Math.max(0, ...sizes.values()) }
}

const strings = [...new Set([
  ...rich.nodes.map(node => node.word),
  ...rich.compounds.flatMap(compound => compound.analyses.flatMap(analysis =>
    [compound.word, ...analysis.parts, ...analysis.terminalParts, ...analysis.incomingKeys, ...analysis.outgoingKeys,
      analysis.linker, analysis.deleted].filter(Boolean)
  )),
])].sort((a, b) => a.localeCompare(b, 'nb'))
const stringId = new Map(strings.map((word, id) => [word, id]))
const runtime = {
  v: 3,
  s: strings,
  n: rich.nodes.map((node, index) => [stringId.get(node.word), node.nounVerified ? 1 : 0, node.frequency.nb ?? 0,
    Number(nodeNbPercentiles[index].toFixed(6)), node.frequency.nowacLemma ?? 0,
    Number(nodeNowacPercentiles[index].toFixed(6)), Number(nodeFamiliarities[index].toFixed(6)),
    node.inDegree, node.outDegree, nodeTiers[index]]),
  a: rich.compounds.flatMap((compound, compoundIndex) => compound.analyses.map((analysis, analysisIndex) => {
    const policy = compoundPolicies[compoundIndex][analysisIndex]
    return [
      stringId.get(compound.word),
      analysis.parts.map(part => stringId.get(part)),
      analysis.terminalParts.map(part => stringId.get(part)),
      analysis.incomingKeys.map(key => stringId.get(key)),
      analysis.outgoingKeys.map(key => stringId.get(key)),
      analysis.linker ? stringId.get(analysis.linker) : -1,
      analysis.deleted ? stringId.get(analysis.deleted) : -1,
      analysis.sources.reduce((mask, source) => mask | (SOURCE_MASK[source] ?? 0), 0),
      compound.frequency.nb ?? 0,
      compound.frequency.nowacLemma ?? 0,
      compound.frequency.eiesland ?? 0,
      Number(compoundNbPercentiles[compoundIndex].toFixed(6)),
      Number(compoundNowacPercentiles[compoundIndex].toFixed(6)),
      Number(compoundEieslandPercentiles[compoundIndex].toFixed(6)),
      Number(compoundFamiliarities[compoundIndex].toFixed(6)),
      policy.incomingSalience.map(value => Number(value.toFixed(6))),
      policy.incomingTiers,
    ]
  })),
}

const stats = {
  version: 2,
  frequencyPolicyVersion: FREQUENCY_POLICY_VERSION,
  thresholds: GENERATION_THRESHOLDS,
  sourceCoverage: {
    nodes: {
      nb: rich.nodes.filter(node => (node.frequency.nb ?? 0) > 0).length,
      nowacLemma: rich.nodes.filter(node => (node.frequency.nowacLemma ?? 0) > 0).length,
    },
    compounds: {
      nb: rich.compounds.filter(compound => (compound.frequency.nb ?? 0) > 0).length,
      nowacLemma: rich.compounds.filter(compound => (compound.frequency.nowacLemma ?? 0) > 0).length,
      eiesland: rich.compounds.filter(compound => (compound.frequency.eiesland ?? 0) > 0).length,
    },
  },
  tiers: [0, 1, 2].map(maxTier => {
    return {
      tier: ['easy', 'medium', 'hard'][maxTier],
      nodes: nodeTiers.filter(tier => tier >= 0 && tier <= maxTier).length,
      nounEndpoints: rich.nodes.filter((node, nodeIndex) => node.nounVerified && nodeTiers[nodeIndex] >= 0 && nodeTiers[nodeIndex] <= maxTier).length,
      compounds: compoundPolicies.filter(policies => policies.some(policy =>
        policy.incomingTiers.some(tier => tier >= 0 && tier <= maxTier)
      )).length,
      analyses: analysisPolicy.filter(policy => policy.incomingTiers.some(tier => tier >= 0 && tier <= maxTier)).length,
      ...connectivity(maxTier),
    }
  }),
}

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify(runtime)}\n`)
writeFileSync(STATS_OUTPUT, `${JSON.stringify(stats, null, 2)}\n`)
writeFileSync(METADATA_OUTPUT, `${JSON.stringify({
  version: rich.version,
  sourceIntegrity: rich.sourceIntegrity,
  frequencyPolicy: {
    version: FREQUENCY_POLICY_VERSION,
    compoundWeights: { nb: 0.3, nowacLemma: 0.6, eiesland: 0.1 },
    endpointWeights: { nb: 0.3, nowacLemma: 0.7 },
    thresholds: GENERATION_THRESHOLDS,
    pathAggregation: 'weakest-edge',
  },
  graphStatistics: stats.tiers,
}, null, 2)}\n`)
console.log(`Derived ${runtime.a.length} runtime analyses using independent NB, NoWaC lemma, and Eiesland evidence.`)
