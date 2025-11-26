import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type CompoundWordSeed = {
  word: string
  parts: string[]
}

// Sample puzzles for seeding the database
const puzzles = [
  {
    date: new Date('2024-01-01'),
    startWord: 'butterfly',
    goalWord: 'honeymoon',
    optimalSteps: 7,
  },
  {
    date: new Date('2024-01-02'),
    startWord: 'sunshine',
    goalWord: 'moonlight',
    optimalSteps: 5,
  },
  {
    date: new Date('2024-01-03'),
    startWord: 'football',
    goalWord: 'bedroom',
    optimalSteps: 6,
  },
  {
    date: new Date('2024-01-04'),
    startWord: 'rainbow',
    goalWord: 'snowfall',
    optimalSteps: 5,
  },
  {
    date: new Date('2024-01-05'),
    startWord: 'sunflower',
    goalWord: 'moonshine',
    optimalSteps: 4,
  },
  {
    date: new Date('2024-01-06'),
    startWord: 'waterfall',
    goalWord: 'firework',
    optimalSteps: 6,
  },
  {
    date: new Date('2024-01-07'),
    startWord: 'starfish',
    goalWord: 'goldmine',
    optimalSteps: 5,
  },
  // Add today's puzzle dynamically
  {
    date: new Date(new Date().toISOString().split('T')[0]),
    startWord: 'butterfly',
    goalWord: 'moonshine',
    optimalSteps: 6,
  },
]

async function seedPuzzles() {
  for (const puzzle of puzzles) {
    const result = await prisma.dailyPuzzle.upsert({
      where: { date: puzzle.date },
      update: {
        startWord: puzzle.startWord,
        goalWord: puzzle.goalWord,
        optimalSteps: puzzle.optimalSteps,
      },
      create: puzzle,
    })
    console.log(`✓ Puzzle ${puzzle.startWord} → ${puzzle.goalWord} on ${puzzle.date.toISOString().split('T')[0]}`)
  }
}

async function seedCompoundWords() {
  const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const dataPath = path.resolve(rootDir, 'data', 'compound-words.json')
  const raw = await readFile(dataPath, 'utf-8')
  const words = JSON.parse(raw) as CompoundWordSeed[]

  let created = 0
  for (const entry of words) {
    if (!entry.word || !Array.isArray(entry.parts) || entry.parts.length < 2) {
      console.warn(`⚠️  Skipping invalid compound entry: ${JSON.stringify(entry)}`)
      continue
    }

    await prisma.compoundWord.upsert({
      where: { word: entry.word.toLowerCase() },
      update: {
        parts: entry.parts.map(part => part.toLowerCase()),
      },
      create: {
        word: entry.word.toLowerCase(),
        parts: entry.parts.map(part => part.toLowerCase()),
      },
    })
    created++
  }

  console.log(`✓ Compound words seeded (${created} entries)`)
}

async function main() {
  console.log('🐝 Starting HiveLink database seed...')
  await seedPuzzles()
  await seedCompoundWords()
  console.log('🍯 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

