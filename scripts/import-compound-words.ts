// scripts/import-compound-words.ts
// Grows data/compound-words.json from public word list sources.
// Existing entries are kept (manual curation wins); new validated compounds are merged in.
//
// Splitting is handled by lib/word-splitting.ts: all candidate splits are
// scored (suffix-aware, doubled-consonant aware) and the best one wins, instead
// of taking the first left-to-right split where both halves are dictionary words.
//
// Usage:
//   npm run data:words                  # fetch, extract, merge into data/compound-words.json
//   npm run data:words -- --max 8000    # cap the number of NEW words added
//   npm run data:words -- --clear       # replace the file entirely with imported words
//   npm run data:words -- --resplit     # re-score existing entries, fix bad splits
//   npm run data:words -- --resplit --dry-run  # show the change report without writing

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  findBestSplit,
  scoreParts,
  countSplitsWithScore,
  MIN_SCORE_TO_REPLACE_UNSCOREABLE,
  type SplitContext,
} from '../lib/word-splitting'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data', 'compound-words.json')

// Public word list sources
const WORD_LIST_URLS = [
  // dwyl word list (comprehensive but we'll filter for quality)
  'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt',
]

// Frequency list used to prefer splits made of common words
const COMMON_WORD_URLS = [
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt',
]

interface WordEntry {
  word: string
  parts: string[]
}

interface ResplitChange {
  word: string
  from: string[]
  to: string[]
  fromScore: number | null
  toScore: number
  ambiguous: boolean
}

/**
 * Download a plain word list from URL
 */
async function downloadWordList(
  url: string,
  label: string,
  minLength = 2
): Promise<string[]> {
  try {
    console.log(`📥 Downloading ${label} from ${url}...`)
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const words = text
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(word => word.length >= minLength && word.length <= 30 && /^[a-z]+$/.test(word))

    console.log(`✓ Downloaded ${words.length} words (${label})`)
    return words
  } catch (error) {
    console.error(`✗ Failed to download from ${url}:`, error)
    return []
  }
}

// Common short words that are valid compound parts (3-4 chars)
const VALID_SHORT_PARTS = new Set([
  'fly', 'bug', 'fish', 'bird', 'ball', 'room', 'bow', 'fall', 'work', 'mine',
  'bell', 'knob', 'step', 'way', 'door', 'trap', 'side', 'top', 'hill', 'cake',
  'port', 'plane', 'boat', 'paper', 'print', 'apple', 'sauce', 'berry', 'bush',
  'chain', 'cloth', 'craft', 'field', 'guard', 'knob', 'less', 'like', 'maker',
  'mark', 'master', 'mate', 'piece', 'power', 'scape', 'smith', 'ware', 'wheel',
  'wise', 'wright', 'board', 'bridge', 'brook', 'case', 'child', 'class', 'club',
  'court', 'crew', 'cross', 'drive', 'driver', 'farm', 'father', 'force', 'front',
  'game', 'gate', 'girl', 'glass', 'hold', 'holder', 'iron', 'jack', 'king', 'lady',
  'lane', 'layer', 'lord', 'love', 'market', 'meal', 'mill', 'nail', 'neck', 'net',
  'news', 'note', 'pack', 'path', 'pen', 'point', 'pool', 'post', 'queen', 'safe',
  'school', 'shell', 'shore', 'sight', 'skin', 'spoon', 'spring', 'stand', 'stick',
  'store', 'stream', 'street', 'string', 'stroke', 'suit', 'tea', 'tower', 'trade',
  'train', 'vine', 'wave', 'well', 'wife', 'wing', 'winter', 'woman', 'works', 'wrist',
  'writer', 'year'
])

/**
 * Build the split context: dictionary membership, common-word ranking and the
 * short-part whitelist all feed into lib/word-splitting scoring.
 */
function buildSplitContext(wordSet: Set<string>, commonWords: Set<string>): SplitContext {
  return {
    isWord: (word) => wordSet.has(word),
    isCommon: (word) => commonWords.has(word),
    isAllowedShortPart: (word) => VALID_SHORT_PARTS.has(word),
  }
}

/**
 * Process words and extract compound words
 */
function extractCompoundWords(
  words: string[],
  ctx: SplitContext
): WordEntry[] {
  console.log(`🔍 Processing ${words.length} words to find compounds...`)

  const compoundWords = new Map<string, string[]>()
  let processed = 0

  for (const word of words) {
    processed++
    if (processed % 10000 === 0) {
      console.log(`  Processed ${processed}/${words.length}, found ${compoundWords.size} compounds...`)
    }

    // Score all candidate splits; the best one wins
    const best = findBestSplit(word, ctx)
    if (best) {
      compoundWords.set(word, best.parts)
    }
  }

  console.log(`✓ Found ${compoundWords.size} compound words (suffix-aware scoring)`)

  return Array.from(compoundWords.entries()).map(([word, parts]) => ({
    word,
    parts,
  }))
}

async function loadExistingEntries(): Promise<WordEntry[]> {
  try {
    const raw = await readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('data/compound-words.json is not an array')
    }
    const entries = (parsed as WordEntry[]).filter(
      entry => typeof entry?.word === 'string' && Array.isArray(entry?.parts)
    )
    console.log(`📖 Loaded ${entries.length} existing entries from data/compound-words.json`)
    return entries
  } catch {
    console.log('📖 No existing data/compound-words.json, starting fresh')
    return []
  }
}

/**
 * Re-score every existing entry with the shared scorer. An entry is only
 * replaced when the new split scores STRICTLY better than the stored one, so
 * already-correct entries never churn.
 */
function resplitEntries(
  entries: WordEntry[],
  ctx: SplitContext
): {
  changes: ResplitChange[]
  ambiguous: string[]
  flagged: Array<{ word: string; reason: string }>
  resolved: WordEntry[]
} {
  const changes: ResplitChange[] = []
  const ambiguous: string[] = []
  const flagged: Array<{ word: string; reason: string }> = []
  const resolved: WordEntry[] = []

  for (const entry of entries) {
    const normalized = entry.word.toLowerCase()

    if (entry.parts.join('') !== normalized) {
      flagged.push({ word: entry.word, reason: `parts do not concatenate to word (${entry.parts.join('+')})` })
      resolved.push(entry)
      continue
    }

    const oldScore = scoreParts(normalized, entry.parts, ctx)
    const best = findBestSplit(normalized, ctx)

    if (!best) {
      if (oldScore === null) {
        flagged.push({ word: entry.word, reason: `no admissible split found (kept ${entry.parts.join('+')})` })
      }
      resolved.push(entry)
      continue
    }

    if (oldScore !== null && best.score <= oldScore) {
      resolved.push(entry)
      continue
    }

    if (oldScore === null && best.score < MIN_SCORE_TO_REPLACE_UNSCOREABLE) {
      // Stored split could not be scored (manual/legacy entry); only a strong
      // word-stem or doubled-stem suffix split may replace it.
      resolved.push(entry)
      continue
    }

    const ambiguousCount = countSplitsWithScore(normalized, ctx, best.score)
    const isAmbiguous = ambiguousCount > 1
    if (isAmbiguous) {
      ambiguous.push(entry.word)
    }

    changes.push({
      word: entry.word,
      from: entry.parts,
      to: best.parts,
      fromScore: oldScore,
      toScore: best.score,
      ambiguous: isAmbiguous,
    })
    resolved.push({ word: entry.word, parts: best.parts })
  }

  return { changes, ambiguous, flagged, resolved }
}

function printResplitReport(
  changes: ResplitChange[],
  ambiguous: string[],
  flagged: Array<{ word: string; reason: string }>
): void {
  console.log(`\n📋 Resplit report`)
  console.log(`  Splits changed: ${changes.length}`)
  console.log(`  Ambiguous (equally-scored alternatives): ${ambiguous.length}`)
  console.log(`  Flagged for review: ${flagged.length}`)

  if (changes.length > 0) {
    console.log(`\n  Changes:`)
    for (const change of changes) {
      const from = `${change.from.join('+')} (${change.fromScore ?? 'n/a'})`
      const to = `${change.to.join('+')} (${change.toScore})`
      const marker = change.ambiguous ? ' [ambiguous]' : ''
      console.log(`    ${change.word}: ${from} -> ${to}${marker}`)
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n  Ambiguous words (best score shared by multiple splits):`)
    for (const word of ambiguous) {
      console.log(`    ${word}`)
    }
  }

  if (flagged.length > 0) {
    console.log(`\n  Flagged entries:`)
    for (const item of flagged) {
      console.log(`    ${item.word}: ${item.reason}`)
    }
  }
}

/**
 * Main import function
 */
async function main() {
  console.log('🐝 Starting compound words import...\n')

  const args = process.argv.slice(2)
  const shouldClear = args.includes('--clear')
  const shouldResplit = args.includes('--resplit')
  const shouldDryRun = args.includes('--dry-run')
  const maxIndex = args.indexOf('--max')
  const maxNew = maxIndex >= 0 ? Math.max(0, Number(args[maxIndex + 1]) || 0) : null

  try {
    // Download dictionary + frequency list
    let allWords: string[] = []
    for (const url of WORD_LIST_URLS) {
      const words = await downloadWordList(url, 'dictionary', 2)
      if (words.length > 0) {
        allWords = words
        break
      }
    }
    if (allWords.length === 0) {
      throw new Error('Failed to download word list from any source')
    }

    const commonWords = new Set<string>()
    for (const url of COMMON_WORD_URLS) {
      const common = await downloadWordList(url, 'frequency list', 1)
      if (common.length > 0) {
        for (const word of common) commonWords.add(word)
        break
      }
    }
    if (commonWords.size === 0) {
      console.log('⚠️  No frequency list available; common-word scoring disabled')
    }

    const wordSet = new Set(allWords)
    const ctx = buildSplitContext(wordSet, commonWords)

    const existingEntries = await loadExistingEntries()

    if (shouldResplit) {
      const { changes, ambiguous, flagged, resolved } = resplitEntries(existingEntries, ctx)
      printResplitReport(changes, ambiguous, flagged)

      if (shouldDryRun) {
        console.log(`\n🏃 Dry run: data/compound-words.json was NOT modified`)
        return
      }

      const merged = resolved.sort((a, b) => a.word.localeCompare(b.word))
      await writeFile(DATA_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')
      console.log(`\n🍯 Resplit complete! ${changes.length} entries updated, ${merged.length} total entries`)
      return
    }

    const existingByWord = new Map(existingEntries.map(entry => [entry.word, entry]))

    if (shouldClear) {
      console.log('🗑️  --clear set: existing entries will be replaced by imported words\n')
      existingByWord.clear()
    }

    // Remove duplicates
    const uniqueWords = Array.from(new Set(allWords))
    console.log(`✓ ${uniqueWords.length} unique words after deduplication\n`)

    // Extract compound words
    const importedWords = extractCompoundWords(uniqueWords, ctx)
    console.log()

    // Merge: existing entries win, imported entries fill the rest
    let added = 0
    let replacedByExisting = 0
    for (const entry of importedWords) {
      if (existingByWord.has(entry.word)) {
        replacedByExisting++
        continue
      }
      if (maxNew !== null && added >= maxNew) {
        break
      }
      existingByWord.set(entry.word, entry)
      added++
    }

    // Write sorted alphabetically for stable diffs
    const merged = Array.from(existingByWord.values()).sort((a, b) => a.word.localeCompare(b.word))
    await writeFile(DATA_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')

    console.log(`\n🍯 Import complete!`)
    console.log(`  Total compound words in data/compound-words.json: ${merged.length}`)
    console.log(`  New words added: ${added}`)
    console.log(`  Imported words kept as-is (already present): ${replacedByExisting}`)
  } catch (error) {
    console.error(`✗ Import failed:`, error)
    process.exit(1)
  }
}

main()
