import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = join(ROOT, 'data', 'compound-build.json')
const OUTPUT = join(ROOT, 'public', 'dictionary', 'compound-words.json')
const STATS_OUTPUT = join(ROOT, 'data', 'compound-graph-stats.json')
const SOURCE_MASK: Record<string, number> = { ordbank: 1, nst: 2, eiesland: 4, manual: 8 }

type Tier = 0 | 1 | 2
interface Metric { count: number; rank: number | null; percentile: number }
interface RichNode {
  word: string
  nounVerified: boolean
  nb: Metric
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
  eieslandCount: number
  analyses: RichAnalysis[]
}
interface RichBuild { version: number; nodes: RichNode[]; compounds: RichCompound[] }

function tier(percentile: number, attested: boolean, degree = 1): Tier {
  if (percentile >= 2 / 3 && degree > 0) return 0
  if (attested || percentile >= 1 / 3) return 1
  return 2
}

if (!existsSync(INPUT)) throw new Error(`Missing rich build artifact: ${INPUT}`)
const rich = JSON.parse(readFileSync(INPUT, 'utf8')) as RichBuild
if (rich.version !== 2) throw new Error(`Unsupported rich build version: ${rich.version}`)

const nodeTiers = new Map<string, Tier>()
for (const node of rich.nodes) {
  nodeTiers.set(node.word, tier(node.nb.percentile, node.nb.count > 0, node.inDegree + node.outDegree))
}
const edgeTiers = rich.compounds.map(compound => {
  const endpointTier = Math.max(...compound.analyses.flatMap(analysis =>
    [...analysis.incomingKeys, ...analysis.outgoingKeys].map(key => nodeTiers.get(key) ?? 2)
  )) as Tier
  return Math.max(tier(compound.nb.percentile, compound.nb.count > 0 || compound.eieslandCount > 0), endpointTier) as Tier
})

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
  rich.compounds.forEach((compound, index) => {
    if (edgeTiers[index] > maxTier) return
    for (const analysis of compound.analyses) {
      for (const incoming of analysis.incomingKeys) {
        for (const outgoing of analysis.outgoingKeys) union(incoming, outgoing)
      }
    }
  })
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
  v: 2,
  s: strings,
  n: rich.nodes.map(node => [stringId.get(node.word), node.nounVerified ? 1 : 0, node.nb.count, node.nb.rank ?? 0,
    Number(node.nb.percentile.toFixed(6)), node.inDegree, node.outDegree, nodeTiers.get(node.word)]),
  a: rich.compounds.flatMap((compound, edgeIndex) => compound.analyses.map(analysis => [
    stringId.get(compound.word),
    analysis.parts.map(part => stringId.get(part)),
    analysis.terminalParts.map(part => stringId.get(part)),
    analysis.incomingKeys.map(key => stringId.get(key)),
    analysis.outgoingKeys.map(key => stringId.get(key)),
    analysis.linker ? stringId.get(analysis.linker) : -1,
    analysis.deleted ? stringId.get(analysis.deleted) : -1,
    analysis.sources.reduce((mask, source) => mask | (SOURCE_MASK[source] ?? 0), 0),
    compound.nb.count, compound.nb.rank ?? 0, Number(compound.nb.percentile.toFixed(6)), compound.eieslandCount,
    edgeTiers[edgeIndex],
  ])),
}

const stats = {
  version: 1,
  thresholds: { easyPercentile: 2 / 3, mediumPercentile: 1 / 3 },
  tiers: [0, 1, 2].map(maxTier => ({
    tier: ['easy', 'medium', 'hard'][maxTier],
    nodes: rich.nodes.filter(node => (nodeTiers.get(node.word) ?? 2) <= maxTier).length,
    nounEndpoints: rich.nodes.filter(node => node.nounVerified && (nodeTiers.get(node.word) ?? 2) <= maxTier).length,
    compounds: edgeTiers.filter(value => value <= maxTier).length,
    analyses: rich.compounds.reduce((sum, compound, index) => sum + (edgeTiers[index] <= maxTier ? compound.analyses.length : 0), 0),
    ...connectivity(maxTier),
  })),
}

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify(runtime)}\n`)
writeFileSync(STATS_OUTPUT, `${JSON.stringify(stats, null, 2)}\n`)
console.log(`Derived ${runtime.a.length} runtime analyses from retained build data.`)
