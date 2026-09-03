import { execFileSync } from 'child_process'
import { createInterface } from 'readline'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createGunzip } from 'zlib'
import { createHash } from 'crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES_DIR = join(ROOT, 'sources')
const NEW_SOURCES_DIR = join(ROOT, 'newsrc')
const RAW_DIR = join(ROOT, 'data', 'raw')
const ORDBANK_ARCHIVE = join(SOURCES_DIR, '20220201_norsk_ordbank_nob_2005.tar.gz')
const NST_ARCHIVE = join(SOURCES_DIR, 'no.leksikon.tar.gz')
const EIESELAND_PATH = join(SOURCES_DIR, 'eiseland.txt')
const NB_ARCHIVE = join(RAW_DIR, 'nb-1gram', '1gram_nob_f1_abc.zip')
const NOWAC_LEMMA_FREQUENCY = join(NEW_SOURCES_DIR, 'nowac-1.1.lemmas.freq.gz')
const RICH_OUTPUT = join(ROOT, 'data', 'compound-build.json')
const METADATA_OUTPUT = join(ROOT, 'data', 'compound-build-metadata.json')
const EXCEPTIONS_PATH = join(ROOT, 'data', 'dictionary-exceptions.json')
const LETTERS = /^[a-zæøå]+$/u
const EXPECTED_EIESELAND_ROWS = 60_865
const SOURCE_MASK = { ordbank: 1, nst: 2, eiesland: 4, manual: 8 } as const

type Source = keyof typeof SOURCE_MASK

interface Analysis {
  word: string
  parts: [string, string]
  terminalParts: string[]
  incomingKeys: string[]
  outgoingKeys: string[]
  linker: string
  deleted: string
  sources: Set<Source>
  sourceIds: string[]
}

interface FrequencyMetric {
  count: number
  rank: number | null
  percentile: number
}

interface NoWacMetric {
  lemmaCount: number
}
interface FrequencyEvidence {
  nb?: number
  nowacLemma?: number
  eiesland?: number
}

interface NodeRecord {
  id: number
  word: string
  nounVerified: boolean
  nb: FrequencyMetric
  nowac?: NoWacMetric
  frequency: FrequencyEvidence
  inDegree: number
  outDegree: number
}

interface EdgeRecord {
  id: number
  word: string
  nb: FrequencyMetric
  nowac?: NoWacMetric
  eieslandCount: number
  frequency: FrequencyEvidence
  analyses: Analysis[]
}

interface DictionaryExceptions {
  allow: Array<{ word: string; parts: [string, string]; reason: string }>
  deny: Array<{ word: string; reason: string }>
  preferredAnalyses: Array<{ word: string; parts: [string, string]; reason: string }>
}

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('nb-NO').trim()
}

function lexicalPart(value: string): string {
  return normalize(value.replace(/^!|^-+|-+$/g, ''))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function archiveText(archive: string, member: string, encoding: BufferEncoding): string {
  const buffer = execFileSync('tar', ['-xOf', archive, member], { maxBuffer: 512 * 1024 * 1024 })
  return buffer.toString(encoding)
}

function rowsFrom(text: string): { columns: Map<string, number>; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines.shift()?.split('\t').map(value => value.trim()) ?? []
  return {
    columns: new Map(header.map((name, index) => [name, index])),
    rows: lines.map(line => line.split('\t')),
  }
}

function addAnalysis(store: Map<string, Analysis[]>, analysis: Analysis): void {
  const signature = [analysis.parts.join('+'), analysis.terminalParts.join('+'), analysis.linker, analysis.deleted].join('|')
  const analyses = store.get(analysis.word) ?? []
  const existing = analyses.find(candidate =>
    [candidate.parts.join('+'), candidate.terminalParts.join('+'), candidate.linker, candidate.deleted].join('|') === signature
  )
  if (existing) {
    for (const source of analysis.sources) existing.sources.add(source)
    existing.sourceIds.push(...analysis.sourceIds)
  } else {
    analyses.push(analysis)
    store.set(analysis.word, analyses)
  }
}

function reconstructs(analysis: Analysis): boolean {
  let left = analysis.parts[0]
  if (analysis.deleted) {
    if (!left.endsWith(analysis.deleted)) return false
    left = left.slice(0, -analysis.deleted.length)
  }
  return left + analysis.linker + analysis.parts[1] === analysis.word
}

function loadOrdbank(): { analyses: Map<string, Analysis[]>; nounLemmas: Set<string>; rows: number } {
  const leddanalyse = rowsFrom(archiveText(ORDBANK_ARCHIVE, 'leddanalyse.txt', 'latin1'))
  const fullforms = rowsFrom(archiveText(ORDBANK_ARCHIVE, 'fullformsliste.txt', 'latin1'))
  const analyses = new Map<string, Analysis[]>()
  const nounLemmas = new Set<string>()
  const value = (row: string[], columns: Map<string, number>, name: string) => row[columns.get(name) ?? -1]?.trim() ?? ''

  for (const row of fullforms.rows) {
    const word = normalize(value(row, fullforms.columns, 'OPPSLAG'))
    const tag = value(row, fullforms.columns, 'TAG')
    if (/^subst\b/.test(tag) && /\bent ub\b/.test(tag) && LETTERS.test(word)) nounLemmas.add(word)
  }

  const accepted = new Map<string, Analysis[]>()
  for (const row of leddanalyse.rows) {
    const word = normalize(value(row, leddanalyse.columns, 'OPPSLAG'))
    const left = lexicalPart(value(row, leddanalyse.columns, 'FORLEDD'))
    const right = lexicalPart(value(row, leddanalyse.columns, 'ETTERLEDD'))
    const firstClass = value(row, leddanalyse.columns, 'FORLEDD_GRAM').split('+')[0]
    const headClass = value(row, leddanalyse.columns, 'ETTERLEDD_GRAM').split('+')[0]
    const analysis: Analysis = {
      word,
      parts: [left, right],
      terminalParts: [left, right],
      incomingKeys: [left],
      outgoingKeys: [right],
      linker: normalize(value(row, leddanalyse.columns, 'FUGE')),
      deleted: normalize(value(row, leddanalyse.columns, 'NEG_FUGE')),
      sources: new Set(['manual']),
      sourceIds: [value(row, leddanalyse.columns, 'LEMMA_ID')],
    }
    if (
      value(row, leddanalyse.columns, 'LEDDMARKERT_BOB') === 'ok' &&
      headClass === 'Noun' &&
      ['Noun', 'Adj', 'Verb', 'V', 'Føreledd_V'].includes(firstClass) &&
      LETTERS.test(word) && LETTERS.test(left) && LETTERS.test(right) && reconstructs(analysis)
    ) {
      addAnalysis(accepted, analysis)
    }
  }

  const preferred = new Map([...accepted].map(([word, options]) => [word, options[0]]))
  const terminalCache = new Map<string, string[]>()
  const terminals = (word: string, visiting = new Set<string>()): string[] => {
    const cached = terminalCache.get(word)
    if (cached) return cached
    const analysis = preferred.get(word)
    if (!analysis || visiting.has(word)) return [word]
    const next = new Set(visiting).add(word)
    const result = analysis.parts.flatMap(part => terminals(part, next))
    terminalCache.set(word, result)
    return result
  }
  for (const options of accepted.values()) {
    for (const analysis of options) {
      analysis.terminalParts = analysis.parts.flatMap(part => terminals(part))
      analysis.incomingKeys = unique([analysis.parts[0], analysis.terminalParts[0]])
      analysis.outgoingKeys = unique([analysis.parts[1], analysis.terminalParts.at(-1)!])
      addAnalysis(analyses, analysis)
    }
  }
  return { analyses, nounLemmas, rows: leddanalyse.rows.length }
}

function loadNst(store: Map<string, Analysis[]>, nounLemmas: Set<string>): number {
  const member = 'NSTs norske leksikon/nor030224NST.pron/nor030224NST.pron'
  const lines = archiveText(NST_ARCHIVE, member, 'latin1').split(/\r?\n/)
  let added = 0
  for (let index = 0; index < lines.length; index++) {
    const fields = lines[index].split(';')
    const word = normalize(fields[0] ?? '')
    const decomposition = normalize(fields[3] ?? '')
    if (fields[1] !== 'NN' || !(fields[5] ?? '').includes('LEX') || !decomposition.includes('+') || !LETTERS.test(word)) continue
    if ((fields[2] ?? '').startsWith('SIN|IND|')) nounLemmas.add(word)
    if (store.has(word)) continue

    const rawParts = decomposition.split('+').map(lexicalPart).filter(Boolean)
    if (rawParts.length < 2 || rawParts.join('') !== word || rawParts.some(part => !LETTERS.test(part))) continue
    const right = rawParts.at(-1)!
    const left = rawParts.slice(0, -1).join('')
    const analysis: Analysis = {
      word,
      parts: [left, right],
      terminalParts: rawParts,
      incomingKeys: unique([left, rawParts[0]]),
      outgoingKeys: [right],
      linker: '',
      deleted: '',
      sources: new Set(['nst']),
      sourceIds: [String(index + 1)],
    }
    addAnalysis(store, analysis)
    added++
  }
  return added
}

function loadEiesland(store: Map<string, Analysis[]>): { rows: number; counts: Map<string, number>; matched: number } {
  const lines = readFileSync(EIESELAND_PATH, 'utf8').split(/\r?\n/).filter(Boolean)
  if (lines.length !== EXPECTED_EIESELAND_ROWS) {
    throw new Error(`Eiesland source integrity failed: expected ${EXPECTED_EIESELAND_ROWS} rows, found ${lines.length}`)
  }
  const counts = new Map<string, number>()
  let matched = 0
  for (const line of lines) {
    const [spellings, rawCount] = line.split('\t')
    const count = Number(rawCount)
    for (const spelling of (spellings ?? '').split('/')) {
      const word = normalize(spelling)
      if (!LETTERS.test(word) || !Number.isFinite(count)) continue
      counts.set(word, (counts.get(word) ?? 0) + count)
      const analyses = store.get(word)
      if (!analyses) continue
      matched++
      for (const analysis of analyses) analysis.sources.add('eiesland')
    }
  }
  return { rows: lines.length, counts, matched }
}

function loadNbFrequency(candidates: Set<string>): Map<string, FrequencyMetric> {
  const member = '1gram_nob_f1_abc.srt'
  const text = execFileSync('unzip', ['-p', NB_ARCHIVE, member], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  const counts = new Map<string, number>()
  const histogram = new Map<number, number>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/)
    if (!match) continue
    const count = Number(match[1])
    const word = normalize(match[2])
    histogram.set(count, (histogram.get(count) ?? 0) + 1)
    if (candidates.has(word)) counts.set(word, (counts.get(word) ?? 0) + count)
  }
  const greaterByCount = new Map<number, number>()
  let greater = 0
  for (const [count, amount] of [...histogram].sort((a, b) => b[0] - a[0])) {
    greaterByCount.set(count, greater)
    greater += amount
  }
  const positiveCandidateCounts = [...counts.values()].filter(Boolean).sort((a, b) => a - b)
  const metrics = new Map<string, FrequencyMetric>()
  for (const word of candidates) {
    const count = counts.get(word) ?? 0
    const firstAtLeast = count > 0 ? lowerBound(positiveCandidateCounts, count) : 0
    metrics.set(word, {
      count,
      rank: count > 0 ? (greaterByCount.get(count) ?? 0) + 1 : null,
      percentile: count > 0 && positiveCandidateCounts.length > 1
        ? firstAtLeast / (positiveCandidateCounts.length - 1)
        : 0,
    })
  }
  return metrics
}

function lowerBound(values: number[], target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (values[middle] < target) low = middle + 1
    else high = middle
  }
  return low
}

async function loadNowacLemmaFrequency(candidates: Set<string>): Promise<Map<string, NoWacMetric>> {
  if (!existsSync(NOWAC_LEMMA_FREQUENCY)) {
    throw new Error(`Missing NoWaC lemma frequency list: ${NOWAC_LEMMA_FREQUENCY}`)
  }
  const lines = createInterface({
    input: createReadStream(NOWAC_LEMMA_FREQUENCY).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  const counts = new Map<string, NoWacMetric>()
  for await (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\t([^\t]+)$/)
    if (!match || !match[3].startsWith('subst_')) continue
    const lemma = normalize(match[2])
    if (!LETTERS.test(lemma) || !candidates.has(lemma)) continue
    const metric = counts.get(lemma) ?? { lemmaCount: 0 }
    metric.lemmaCount += Number(match[1])
    counts.set(lemma, metric)
  }
  return counts
}

async function build(): Promise<void> {
  for (const path of [ORDBANK_ARCHIVE, NST_ARCHIVE, EIESELAND_PATH, NB_ARCHIVE, NOWAC_LEMMA_FREQUENCY]) {
    if (!existsSync(path)) throw new Error(`Missing required source: ${path}`)
  }
  const ordbank = loadOrdbank()
  const nstAdded = loadNst(ordbank.analyses, ordbank.nounLemmas)
  const eiesland = loadEiesland(ordbank.analyses)
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8')) as DictionaryExceptions
  for (const denied of exceptions.deny) ordbank.analyses.delete(normalize(denied.word))
  for (const allowed of exceptions.allow) {
    const word = normalize(allowed.word)
    const parts = allowed.parts.map(lexicalPart) as [string, string]
    const analysis: Analysis = {
      word,
      parts,
      terminalParts: parts,
      incomingKeys: [parts[0]],
      outgoingKeys: [parts[1]],
      linker: '',
      deleted: '',
      sources: new Set(['ordbank']),
      sourceIds: [`manual:${allowed.reason}`],
    }
    if (!reconstructs(analysis)) throw new Error(`Manual analysis does not reconstruct ${word}`)
    addAnalysis(ordbank.analyses, analysis)
  }
  for (const preferred of exceptions.preferredAnalyses) {
    const options = ordbank.analyses.get(normalize(preferred.word))
    if (!options) continue
    const key = preferred.parts.map(lexicalPart).join('+')
    options.sort((a, b) => Number(b.parts.join('+') === key) - Number(a.parts.join('+') === key))
  }
  const candidates = new Set<string>(ordbank.nounLemmas)
  for (const [word, analyses] of ordbank.analyses) {
    candidates.add(word)
    for (const analysis of analyses) {
      for (const key of [...analysis.incomingKeys, ...analysis.outgoingKeys, ...analysis.terminalParts]) candidates.add(key)
    }
  }
  const nb = loadNbFrequency(candidates)
  const nowac = await loadNowacLemmaFrequency(candidates)

  const inDegree = new Map<string, number>()
  const outDegree = new Map<string, number>()
  for (const analyses of ordbank.analyses.values()) {
    for (const analysis of analyses) {
      for (const key of analysis.incomingKeys) outDegree.set(key, (outDegree.get(key) ?? 0) + 1)
      for (const key of analysis.outgoingKeys) inDegree.set(key, (inDegree.get(key) ?? 0) + 1)
    }
  }

  const nodeWords = unique([...ordbank.analyses.values()].flatMap(options =>
    options.flatMap(analysis => [...analysis.incomingKeys, ...analysis.outgoingKeys])
  )).sort((a, b) => a.localeCompare(b, 'nb'))
  const nodes: NodeRecord[] = nodeWords.map((word, id) => {
    const metric = nb.get(word) ?? { count: 0, rank: null, percentile: 0 }
    return {
      id,
      word,
      nounVerified: ordbank.nounLemmas.has(word),
      nb: metric,
      ...(nowac.has(word) ? { nowac: nowac.get(word) } : {}),
      frequency: {
        ...(metric.count > 0 ? { nb: metric.count } : {}),
        ...(nowac.has(word) ? { nowacLemma: nowac.get(word)!.lemmaCount } : {}),
      },
      inDegree: inDegree.get(word) ?? 0,
      outDegree: outDegree.get(word) ?? 0,
    }
  })
  const edges: EdgeRecord[] = [...ordbank.analyses]
    .sort(([a], [b]) => a.localeCompare(b, 'nb'))
    .map(([word, analyses], id) => {
      const metric = nb.get(word) ?? { count: 0, rank: null, percentile: 0 }
      const eieslandCount = eiesland.counts.get(word) ?? 0
      return {
        id,
        word,
        nb: metric,
        ...(nowac.has(word) ? { nowac: nowac.get(word) } : {}),
        eieslandCount,
        frequency: {
          ...(metric.count > 0 ? { nb: metric.count } : {}),
          ...(nowac.has(word) ? { nowacLemma: nowac.get(word)!.lemmaCount } : {}),
          ...(eieslandCount > 0 ? { eiesland: eieslandCount } : {}),
        },
        analyses,
      }
    })

  const rich = {
    version: 3,
    sourceIntegrity: {
      ordbankRows: ordbank.rows,
      eieslandRows: eiesland.rows,
      eieslandExpectedRows: EXPECTED_EIESELAND_ROWS,
      eieslandMatchedRows: eiesland.matched,
      nstAddedCompounds: nstAdded,
      nowacApplied: true,
      checksums: {
        ordbank: checksum(ORDBANK_ARCHIVE),
        nst: checksum(NST_ARCHIVE),
        eiesland: checksum(EIESELAND_PATH),
        nb1gram: checksum(NB_ARCHIVE),
        nowacLemmaFrequency: checksum(NOWAC_LEMMA_FREQUENCY),
      },
    },
    nodes,
    compounds: edges.map(edge => ({
      ...edge,
      analyses: edge.analyses.map(analysis => ({
        ...analysis,
        sources: [...analysis.sources].sort(),
        sourceIds: unique(analysis.sourceIds).sort(),
      })),
    })),
  }
  writeFileSync(RICH_OUTPUT, `${JSON.stringify(rich)}\n`)
  writeFileSync(METADATA_OUTPUT, `${JSON.stringify({
    version: rich.version,
    sourceIntegrity: rich.sourceIntegrity,
    note: 'Run data:derive to calculate frequency policy and graph statistics.',
  }, null, 2)}\n`)

  console.log(`Ordbank: ${ordbank.rows} rows; ${ordbank.analyses.size} canonical spellings.`)
  console.log(`NST: ${nstAdded} additional compounds. Eiesland: ${eiesland.rows} rows, ${eiesland.matched} matched rows.`)
  console.log(`NoWaC: ${nowac.size} validated noun lemmas matched from the precomputed frequency list.`)
  console.log(`Graph: ${nodes.length} nodes and ${edges.length} compound spellings (${edges.reduce((sum, edge) => sum + edge.analyses.length, 0)} analyses).`)
  console.log(`Rich build artifact: ${readFileSync(RICH_OUTPUT).byteLength} bytes.`)
}

build().catch(error => {
  console.error(error)
  process.exit(1)
})
