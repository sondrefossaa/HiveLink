import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Public word list sources
const WORD_LIST_URLS = [
  // dwyl word list (comprehensive but we'll filter for quality)
  'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt',
]

interface WordEntry {
  word: string
  parts: string[]
}

/**
 * Download word list from URL
 */
async function downloadWordList(url: string): Promise<string[]> {
  try {
    console.log(`📥 Downloading word list from ${url}...`)
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const text = await response.text()
    // Include words for part validation
    // We'll use all words in the dictionary, but require parts to be at least 5 chars
    const words = text
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(word => word.length >= 2 && word.length <= 30 && /^[a-z]+$/.test(word))
    
    console.log(`✓ Downloaded ${words.length} words`)
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
 * Check if a short word (3-4 chars) is a valid compound part
 */
function isValidShortPart(word: string): boolean {
  return VALID_SHORT_PARTS.has(word.toLowerCase())
}

/**
 * Find all valid 2-part splits where both parts are dictionary words
 */
function findValidCompoundSplits(word: string, wordSet: Set<string>): string[] | null {
  const normalized = word.toLowerCase()
  
  // Try all possible split points
  // Minimum part length: 3 characters (but prefer longer)
  // Maximum part length: word.length - 3
  for (let i = 3; i <= normalized.length - 3; i++) {
    const part1 = normalized.substring(0, i)
    const part2 = normalized.substring(i)
    
    // Both parts must be in the dictionary
    if (!wordSet.has(part1) || !wordSet.has(part2)) {
      continue
    }
    
    // Validation rules:
    // - If a part is 3-4 chars, it must be in VALID_SHORT_PARTS
    // - At least one part must be 5+ chars (filters out "psia" type words)
    const part1Valid = part1.length >= 5 || isValidShortPart(part1)
    const part2Valid = part2.length >= 5 || isValidShortPart(part2)
    const atLeastOneLong = part1.length >= 5 || part2.length >= 5
    
    if (part1Valid && part2Valid && atLeastOneLong) {
      return [part1, part2]
    }
  }
  
  return null
}

/**
 * Check if a word is a valid compound word (all parts must be dictionary words)
 */
function isCompoundWord(word: string, wordSet: Set<string>): string[] | null {
  // Must be at least 6 characters (3+3 minimum for two parts)
  if (word.length < 6) {
    return null
  }
  
  // Try to find a valid 2-part split
  return findValidCompoundSplits(word, wordSet)
}

/**
 * Process words and extract compound words
 */
function extractCompoundWords(words: string[]): WordEntry[] {
  console.log(`🔍 Processing ${words.length} words to find compounds...`)
  console.log(`  Building word set for validation...`)
  
  // Create a Set for O(1) lookup
  const wordSet = new Set(words)
  console.log(`  ✓ Word set ready (${wordSet.size} words)\n`)
  
  const compoundWords = new Map<string, string[]>()
  let processed = 0
  
  for (const word of words) {
    processed++
    if (processed % 10000 === 0) {
      console.log(`  Processed ${processed}/${words.length} words, found ${compoundWords.size} compounds...`)
    }
    
    // Check if this word can be split into two valid dictionary words
    const parts = isCompoundWord(word, wordSet)
    
    if (parts) {
      compoundWords.set(word, parts)
    }
  }
  
  console.log(`✓ Found ${compoundWords.size} compound words (all parts validated as dictionary words)`)
  
  return Array.from(compoundWords.entries()).map(([word, parts]) => ({
    word,
    parts,
  }))
}

/**
 * Insert compound words into database in batches
 */
async function insertCompoundWords(entries: WordEntry[]): Promise<void> {
  console.log(`💾 Inserting ${entries.length} compound words into database...`)
  
  const BATCH_SIZE = 1000
  let inserted = 0
  let skipped = 0
  
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    
    try {
      const result = await prisma.compoundWord.createMany({
        data: batch.map(entry => ({
          word: entry.word,
          parts: entry.parts,
        })),
        skipDuplicates: true,
      })
      
      inserted += result.count
      skipped += batch.length - result.count
      
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${result.count}, skipped ${batch.length - result.count} duplicates`)
    } catch (error) {
      console.error(`  ✗ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error)
      // Continue with next batch
    }
  }
  
  console.log(`✓ Insertion complete: ${inserted} new, ${skipped} duplicates skipped`)
}

/**
 * Main import function
 */
async function main() {
  console.log('🐝 Starting compound words import...\n')
  
  // Check for --clear flag
  const shouldClear = process.argv.includes('--clear')
  
  if (shouldClear) {
    console.log('🗑️  Clearing existing compound words...')
    const deleted = await prisma.compoundWord.deleteMany({})
    console.log(`✓ Cleared ${deleted.count} existing compound words\n`)
  }
  
  try {
    // Try to download from first available source
    let allWords: string[] = []
    
    for (const url of WORD_LIST_URLS) {
      const words = await downloadWordList(url)
      if (words.length > 0) {
        allWords = words
        break
      }
    }
    
    if (allWords.length === 0) {
      throw new Error('Failed to download word list from any source')
    }
    
    // Remove duplicates
    const uniqueWords = Array.from(new Set(allWords))
    console.log(`✓ ${uniqueWords.length} unique words after deduplication\n`)
    
    // Extract compound words
    const compoundWords = extractCompoundWords(uniqueWords)
    console.log()
    
    // Insert into database
    await insertCompoundWords(compoundWords)
    
    // Get final count
    const totalCount = await prisma.compoundWord.count()
    console.log(`\n🍯 Import complete! Total compound words in database: ${totalCount}`)
    
  } catch (error) {
    console.error('✗ Import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

