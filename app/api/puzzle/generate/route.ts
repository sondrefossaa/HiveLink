import { NextRequest, NextResponse } from 'next/server'
import type { PuzzleDifficulty } from '@/types'
import { generatePracticePuzzle } from '@/lib/puzzle-generator'
import { getPrismaClient } from '@/lib/prisma-client'
import { registerCompoundParts } from '@/lib/compound-utils'

const ALLOWED_DIFFICULTIES: PuzzleDifficulty[] = ['easy', 'medium', 'hard']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const difficultyParam = (searchParams.get('difficulty') || 'medium').toLowerCase() as PuzzleDifficulty
    const difficulty = ALLOWED_DIFFICULTIES.includes(difficultyParam) ? difficultyParam : 'medium'
    
    // Check for shared puzzle params (start/goal words)
    const startWord = searchParams.get('start')?.toLowerCase()
    const goalWord = searchParams.get('goal')?.toLowerCase()
    const minStepsParam = searchParams.get('minSteps')
    const minSteps = minStepsParam ? Math.max(1, parseInt(minStepsParam, 10) || 1) : 1

    const puzzle = await generatePracticePuzzle(difficulty, startWord || undefined, goalWord || undefined, minSteps)

    if (puzzle.wordParts) {
      const entries = Object.entries(puzzle.wordParts).filter(([, parts]) => parts.length >= 2)

      if (entries.length > 0) {
        try {
          const prisma = await getPrismaClient()
          await Promise.all(
            entries.map(([word, parts]) =>
              prisma.compoundWord.upsert({
                where: { word },
                update: { parts },
                create: { word, parts },
              })
            )
          )

          for (const [word, parts] of entries) {
            registerCompoundParts(word, parts)
          }
        } catch (persistError) {
          console.error('Failed to persist practice puzzle words:', persistError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...puzzle,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error generating practice puzzle:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate practice puzzle',
      },
      { status: 500 }
    )
  }
}
