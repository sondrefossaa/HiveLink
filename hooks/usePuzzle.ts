'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  DailyPuzzle,
  PracticePuzzle,
  PuzzleDifficulty,
  PuzzleInstance,
  PuzzleMode,
} from '@/types'

interface UsePuzzleResult {
  puzzle: PuzzleInstance | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  mode: PuzzleMode
  setMode: (mode: PuzzleMode) => void
  difficulty: PuzzleDifficulty
  setDifficulty: (difficulty: PuzzleDifficulty) => void
  generatePracticePuzzle: () => Promise<void>
  isGeneratingPractice: boolean
}

export function usePuzzle(): UsePuzzleResult {
  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null)
  const [practicePuzzle, setPracticePuzzle] = useState<PracticePuzzle | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setModeState] = useState<PuzzleMode>('daily')
  const [difficulty, setDifficultyState] = useState<PuzzleDifficulty>('medium')
  const previousDifficultyRef = useRef<PuzzleDifficulty>('medium')

  const fetchPuzzle = useCallback(async () => {
    setDailyLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/puzzle/today')
      const data = await response.json()

      if (data.success && data.data) {
        setDailyPuzzle(data.data as DailyPuzzle)
      } else {
        throw new Error(data.error || 'Failed to fetch puzzle')
      }
    } catch (err) {
      console.error('Error fetching puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch puzzle')
      
      // Set a fallback puzzle
      setDailyPuzzle({
        id: 0,
        puzzleNumber: 1,
        date: new Date().toISOString().split('T')[0],
        startWord: 'butterfly',
        goalWord: 'moonshine',
        optimalSteps: 6,
        isDaily: true,
        mode: 'daily',
      })
    } finally {
      setDailyLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPuzzle()
  }, [fetchPuzzle])

  // Check for midnight reset
  useEffect(() => {
    const checkForReset = () => {
      const now = new Date()
      const currentDate = now.toISOString().split('T')[0]
      
      if (dailyPuzzle && dailyPuzzle.date !== currentDate) {
        fetchPuzzle()
      }
    }

    // Check every minute
    const interval = setInterval(checkForReset, 60000)
    return () => clearInterval(interval)
  }, [dailyPuzzle, fetchPuzzle])

  const generatePracticePuzzle = useCallback(async () => {
    setPracticeLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/puzzle/generate?difficulty=${difficulty}`)
      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to generate practice puzzle')
      }

      setPracticePuzzle(data.data as PracticePuzzle)
    } catch (err) {
      console.error('Error generating practice puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate practice puzzle')
    } finally {
      setPracticeLoading(false)
    }
  }, [difficulty])

  const handleDifficultyChange = useCallback((value: PuzzleDifficulty) => {
    setDifficultyState(value)
    setPracticePuzzle(null)
  }, [])

  const setMode = useCallback((nextMode: PuzzleMode) => {
    setModeState(nextMode)
  }, [])

  useEffect(() => {
    if (mode !== 'practice') return
    if (practicePuzzle || practiceLoading) return
    void generatePracticePuzzle()
  }, [mode, practicePuzzle, practiceLoading, generatePracticePuzzle])

  useEffect(() => {
    if (mode !== 'practice') {
      previousDifficultyRef.current = difficulty
      return
    }

    if (previousDifficultyRef.current !== difficulty && !practiceLoading) {
      previousDifficultyRef.current = difficulty
      void generatePracticePuzzle()
    }
  }, [difficulty, mode, practiceLoading, generatePracticePuzzle])

  const activePuzzle: PuzzleInstance | null = mode === 'daily' ? dailyPuzzle : practicePuzzle
  const isLoading = mode === 'daily' ? dailyLoading : practiceLoading

  return {
    puzzle: activePuzzle,
    isLoading,
    error,
    refetch: fetchPuzzle,
    mode,
    setMode,
    difficulty,
    setDifficulty: handleDifficultyChange,
    generatePracticePuzzle,
    isGeneratingPractice: practiceLoading,
  }
}

