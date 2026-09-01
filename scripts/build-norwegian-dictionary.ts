import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '..', 'data', 'raw')
const OUT_DIR = join(__dirname, '..', 'data')

interface NorwegianDictionary {
  compoundParts: string[]
  commonWords: string[]
  validWords: string[]
}

function build() {
  const leddPath = join(RAW_DIR, 'leddanalyse.txt')
  const fullformsPath = join(RAW_DIR, 'fullformsliste.txt')
  const freqPath = join(RAW_DIR, 'no_50k.txt')

  if (!existsSync(leddPath) || !existsSync(fullformsPath)) {
    console.error('✗ Required files not found in data/raw/. Run download-norwegian-data.ts first.')
    process.exit(1)
  }

  // 1. Extract compound parts (FORLEDD + ETTERLEDD)
  console.log('Extracting compound parts from leddanalyse.txt...')
  const leddLines = readFileSync(leddPath, 'utf-8').split('\n')
  const compoundParts = new Set<string>()

  for (let i = 1; i < leddLines.length; i++) {
    const line = leddLines[i].trim()
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 9) continue

    const forledd = cols[4]?.normalize('NFC').toLocaleLowerCase('nb-NO')
    const etterledd = cols[8]?.normalize('NFC').toLocaleLowerCase('nb-NO')

    if (forledd && forledd.length >= 2) compoundParts.add(forledd)
    if (etterledd && etterledd.length >= 2) compoundParts.add(etterledd)
  }
  console.log(`  ✓ ${compoundParts.size} unique compound parts`)

  // 2. Extract frequency words
  console.log('\nLoading frequency words...')
  const commonWords = new Set<string>()
  if (existsSync(freqPath)) {
    const freqLines = readFileSync(freqPath, 'utf-8').split('\n')
    for (const line of freqLines) {
      const parts = line.trim().split(' ')
      if (parts[0]) {
        commonWords.add(parts[0].normalize('NFC').toLocaleLowerCase('nb-NO'))
      }
    }
  }
  console.log(`  ✓ ${commonWords.size} common words`)

  // 3. Extract all valid word forms from fullformsliste
  console.log('\nLoading fullformsliste...')
  const fullformsLines = readFileSync(fullformsPath, 'utf-8').split('\n')
  const validWords = new Set<string>()

  for (let i = 1; i < fullformsLines.length; i++) {
    const line = fullformsLines[i].trim()
    if (!line) continue
    const cols = line.split('\t')
    const oppslag = cols[2]
    if (oppslag && oppslag.length >= 2) {
      validWords.add(oppslag.normalize('NFC').toLocaleLowerCase('nb-NO'))
    }
  }
  console.log(`  ✓ ${validWords.size} valid word forms`)

  // 4. Build output
  const dict: NorwegianDictionary = {
    compoundParts: Array.from(compoundParts).sort(),
    commonWords: Array.from(commonWords).sort(),
    validWords: Array.from(validWords).sort(),
  }

  const outPath = join(OUT_DIR, 'norwegian-words.json')
  writeFileSync(outPath, JSON.stringify(dict))
  console.log(`\n✓ Wrote norwegian-words.json`)
  console.log(`  compoundParts: ${dict.compoundParts.length}`)
  console.log(`  commonWords:   ${dict.commonWords.length}`)
  console.log(`  validWords:    ${dict.validWords.length}`)
}

build()
