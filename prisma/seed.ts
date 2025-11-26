import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

async function main() {
  console.log('🐝 Starting HiveLink database seed...')

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
    console.log(`✓ Created/updated puzzle for ${puzzle.date.toISOString().split('T')[0]}: ${puzzle.startWord} → ${puzzle.goalWord}`)
  }

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

