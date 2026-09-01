import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '..', 'data', 'raw')
const OUT_DIR = join(__dirname, '..', 'data')

interface CompoundWord {
  word: string
  parts: string[]
  fuge: string
  frequency: number
}

function loadFrequencyMap(): Map<string, number> {
  const path = join(RAW_DIR, 'no_50k.txt')
  if (!existsSync(path)) {
    console.warn('  ⚠ no_50k.txt not found, all frequencies will be 0')
    return new Map()
  }
  const lines = readFileSync(path, 'utf-8').split('\n')
  const freq = new Map<string, number>()
  for (const line of lines) {
    const parts = line.trim().split(' ')
    if (parts.length >= 2) {
      const word = parts[0].normalize('NFC').toLocaleLowerCase('nb-NO')
      const count = parseInt(parts[1], 10)
      if (word && !isNaN(count)) {
        freq.set(word, count)
      }
    }
  }
  return freq
}

function isProperNoun(gram: string): boolean {
  return /\bProp\b/.test(gram)
}

function build() {
  const leddPath = join(RAW_DIR, 'leddanalyse.txt')
  if (!existsSync(leddPath)) {
    console.error('✗ leddanalyse.txt not found. Run download-norwegian-data.ts first.')
    process.exit(1)
  }

  console.log('Loading frequency data...')
  const freqMap = loadFrequencyMap()
  console.log(`  ✓ ${freqMap.size} frequency entries loaded`)

  console.log('\nParsing leddanalyse.txt...')
  const lines = readFileSync(leddPath, 'utf-8').split('\n')

  let rowsParsed = 0
  let twoPartAnalyses = 0
  let skippedHyphen = 0
  let skippedProperNoun = 0
  let skippedMalformed = 0

  const fugeStats = new Map<string, number>()
  const seen = new Map<string, CompoundWord>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    rowsParsed++

    const cols = line.split('\t')
    if (cols.length < 14) {
      skippedMalformed++
      continue
    }

    const oppslag = cols[2]
    const leddanalyse = cols[3]
    const forledd = cols[4]
    const forleddGram = cols[5]
    const fugeCol = cols[6]
    const etterledd = cols[7]
    const etterleddGram = cols[8]
    const negFuge = cols[10]

    // Must have both parts
    if (!forledd || !etterledd) continue
    twoPartAnalyses++

    // Skip hyphenated compounds
    if (leddanalyse.includes('Hyphen')) {
      skippedHyphen++
      continue
    }

    // Skip proper nouns
    if (isProperNoun(forleddGram) || isProperNoun(etterleddGram)) {
      skippedProperNoun++
      continue
    }

    // Determine fuge: prefer column 6, fall back to column 10
    let fuge = fugeCol || negFuge || ''

    // Normalize the word
    const word = oppslag.normalize('NFC').toLocaleLowerCase('nb-NO')

    // Skip if we already have this word with equal or better frequency
    const existing = seen.get(word)
    const freqCount = freqMap.get(word) || 0
    const frequency = Math.log1p(freqCount)

    if (existing && existing.frequency >= frequency) continue

    fugeStats.set(fuge, (fugeStats.get(fuge) || 0) + 1)

    seen.set(word, {
      word,
      parts: [forledd.normalize('NFC').toLocaleLowerCase('nb-NO'), etterledd.normalize('NFC').toLocaleLowerCase('nb-NO')],
      fuge,
      frequency,
    })
  }

  const compounds = Array.from(seen.values())
    .sort((a, b) => b.frequency - a.frequency)

  const withFreq = compounds.filter(c => c.frequency > 0).length
  const withoutFreq = compounds.filter(c => c.frequency === 0).length

  // Write output
  const outPath = join(OUT_DIR, 'compound-words.json')
  writeFileSync(outPath, JSON.stringify(compounds, null, 2))
  console.log(`\n✓ Wrote ${compounds.length} compounds to compound-words.json`)

  // Print report
  console.log('\n--- Import Report ---')
  console.log(`Rows parsed:              ${rowsParsed}`)
  console.log(`Two-part analyses:        ${twoPartAnalyses}`)
  console.log(`Skipped hyphenated:       ${skippedHyphen}`)
  console.log(`Skipped proper nouns:     ${skippedProperNoun}`)
  console.log(`Skipped malformed:        ${skippedMalformed}`)
  console.log(`Unique compounds:         ${compounds.length}`)
  console.log(`With frequency match:     ${withFreq}`)
  console.log(`Without frequency match:  ${withoutFreq}`)

  console.log('\nFuge distribution:')
  const sortedFuge = Array.from(fugeStats.entries()).sort((a, b) => b[1] - a[1])
  for (const [fuge, count] of sortedFuge) {
    const label = fuge || '(none)'
    console.log(`  ${label.padEnd(8)} ${count}`)
  }

  // Top 10 most frequent
  console.log('\nTop 10 most frequent compounds:')
  for (const c of compounds.slice(0, 10)) {
    console.log(`  ${c.word} (${c.parts.join(' + ')}) freq=${c.frequency.toFixed(2)}`)
  }
}

build()
