'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  DailyPuzzle,
  PracticePuzzle,
  PuzzleDifficulty,
  PuzzleInstance,
  PuzzleMode,
} from '@/types'

interface SharedPuzzleParams {
  puzzleNumber?: number
  startWord?: string
  goalWord?: string
  difficulty?: PuzzleDifficulty
}

// Parse URL params to get shared puzzle info
function getSharedPuzzleParams(): SharedPuzzleParams | null {
  if (typeof window === 'undefined') return null
  
  const params = new URLSearchParams(window.location.search)
  const puzzleNumber = params.get('puzzle')
  const startWord = params.get('start')
  const goalWord = params.get('goal')
  const difficulty = params.get('difficulty') as PuzzleDifficulty | null
  
  // Daily puzzle shared
  if (puzzleNumber) {
    return { puzzleNumber: parseInt(puzzleNumber, 10) }
  }
  
  // Practice puzzle shared
  if (startWord && goalWord) {
    return {
      startWord: startWord.toLowerCase(),
      goalWord: goalWord.toLowerCase(),
      difficulty: difficulty || 'medium',
    }
  }
  
  return null
}

// Clear URL params after reading (to prevent re-loading on refresh)
function clearUrlParams() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.toString()) {
    url.search = ''
    window.history.replaceState({}, '', url.toString())
  }
}

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
  // Check for shared puzzle params on mount (before any state initialization)
  const sharedParams = useRef<SharedPuzzleParams | null>(null)
  const hasCheckedUrlParams = useRef(false)
  
  if (!hasCheckedUrlParams.current && typeof window !== 'undefined') {
    sharedParams.current = getSharedPuzzleParams()
    hasCheckedUrlParams.current = true
    if (sharedParams.current) {
      clearUrlParams()
    }
  }

  // Determine initial mode based on URL params
  const initialMode: PuzzleMode = sharedParams.current?.startWord ? 'practice' : 'daily'
  const initialDifficulty: PuzzleDifficulty = sharedParams.current?.difficulty || 'medium'

  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null)
  const [practicePuzzle, setPracticePuzzle] = useState<PracticePuzzle | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [practiceLoading, setPracticeLoading] = useState(!!sharedParams.current?.startWord)
  const [error, setError] = useState<string | null>(null)
  const [mode, setModeState] = useState<PuzzleMode>(initialMode)
  const [difficulty, setDifficultyState] = useState<PuzzleDifficulty>(initialDifficulty)
  const previousDifficultyRef = useRef<PuzzleDifficulty>(initialDifficulty)
  const sharedPuzzleLoadedRef = useRef(false)

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

  // Generate a practice puzzle with specific start/goal words (for shared puzzles)
  const generateSharedPracticePuzzle = useCallback(async (
    startWord: string,
    goalWord: string,
    sharedDifficulty: PuzzleDifficulty
  ) => {
    setPracticeLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/puzzle/generate?difficulty=${sharedDifficulty}&start=${encodeURIComponent(startWord)}&goal=${encodeURIComponent(goalWord)}`
      )
      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to generate practice puzzle')
      }

      setPracticePuzzle(data.data as PracticePuzzle)
      sharedPuzzleLoadedRef.current = true
    } catch (err) {
      console.error('Error generating shared practice puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate practice puzzle')
    } finally {
      setPracticeLoading(false)
    }
  }, [])

  // Handle URL params on initial load (shared puzzle links) - runs once on mount
  useEffect(() => {
    const params = sharedParams.current
    if (!params) return
    if (sharedPuzzleLoadedRef.current) return

    if (params.startWord && params.goalWord) {
      // Shared practice puzzle - mode/difficulty already set in initial state
      void generateSharedPracticePuzzle(
        params.startWord,
        params.goalWord,
        params.difficulty || 'medium'
      )
    }
    // For daily puzzles, we just load the current day's puzzle
    // (puzzle number in URL is informational - we always load today's puzzle)
  }, [generateSharedPracticePuzzle])

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

  // Auto-generate practice puzzle when switching to practice mode
  // BUT skip if we're loading a shared puzzle from URL params
  useEffect(() => {
    if (mode !== 'practice') return
    if (practicePuzzle || practiceLoading) return
    // Don't auto-generate if we have shared params - we're loading that instead
    if (sharedParams.current?.startWord && sharedParams.current?.goalWord) return
    void generatePracticePuzzle()
  }, [mode, practicePuzzle, practiceLoading, generatePracticePuzzle])

  useEffect(() => {
    if (mode !== 'practice') {
      previousDifficultyRef.current = difficulty
      return
    }

    // Don't regenerate if we just loaded a shared puzzle
    if (sharedPuzzleLoadedRef.current) {
      sharedPuzzleLoadedRef.current = false
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

