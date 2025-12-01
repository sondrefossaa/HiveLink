import { PrismaClient } from '@prisma/client'
import { generateDailyPuzzle } from '../lib/puzzle-generator'

const prisma = new PrismaClient()

async function main() {
  try {
    // Get today's date in UTC
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const dateStr = today.toISOString().split('T')[0]
    
    console.log(`Regenerating daily puzzle for ${dateStr} with new suffix chaining logic...`)
    
    // Load word entries from database
    const dbWords = await prisma.compoundWord.findMany({
      select: { word: true, parts: true },
    })
    
    if (dbWords.length === 0) {
      throw new Error('Compound word table is empty; cannot generate daily puzzle')
    }
    
    const wordEntries = dbWords.map(({ word, parts }) => ({
      word,
      parts,
    }))
    
    console.log(`Loaded ${wordEntries.length} compound words from database`)
    
    // Generate new puzzle with suffix chaining logic
    // Start with lower minSteps to allow more flexibility
    const generated = await generateDailyPuzzle(today, {
      wordEntries,
      minSteps: 3, // Reduced to allow more chains (medium difficulty target is 6-7)
    })
    
    console.log(`Generated puzzle: ${generated.startWord} -> ${generated.goalWord} (${generated.optimalSteps} steps)`)
    console.log(`Solution path: ${generated.solutionPath.join(' -> ')}`)
    
    // Upsert the puzzle in the database
    const puzzle = await prisma.dailyPuzzle.upsert({
      where: { date: today },
      update: {
        startWord: generated.startWord,
        goalWord: generated.goalWord,
        optimalSteps: generated.optimalSteps,
      },
      create: {
        date: today,
        startWord: generated.startWord,
        goalWord: generated.goalWord,
        optimalSteps: generated.optimalSteps,
      },
    })
    
    console.log(`\n✓ Successfully regenerated daily puzzle for ${dateStr}`)
    console.log(`  Start: ${puzzle.startWord}`)
    console.log(`  Goal: ${puzzle.goalWord}`)
    console.log(`  Optimal steps: ${puzzle.optimalSteps}`)
  } catch (error) {
    console.error('Error regenerating daily puzzle:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

