'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getDailyPuzzle } from '@/lib/daily-puzzle'
import { generatePracticePuzzle as generatePracticePuzzleForDifficulty } from '@/lib/puzzle-generator'
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

function resolveClientTimeZone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || 'UTC'
  } catch (error) {
    console.warn('Unable to resolve client timezone, defaulting to UTC', error)
    return 'UTC'
  }
}

function formatLocalDate(timeZone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function usePuzzle(): UsePuzzleResult {
  // Read URL params on first render (but don't clear yet)
  // Using a ref to store the initial params so they persist across strict mode double-mounting
  const initialParamsRef = useRef<SharedPuzzleParams | null | undefined>(undefined)
  
  if (initialParamsRef.current === undefined) {
    initialParamsRef.current = getSharedPuzzleParams()
  }
  
  const sharedParams = initialParamsRef.current
  const sharedPuzzleLoadedRef = useRef(false)
  const urlClearedRef = useRef(false)

  const [timezone] = useState<string>(() => resolveClientTimeZone())
  const getLocalDate = useCallback(() => formatLocalDate(timezone), [timezone])

  // Determine initial mode based on URL params
  const initialMode: PuzzleMode = sharedParams?.startWord ? 'practice' : 'daily'
  const initialDifficulty: PuzzleDifficulty = sharedParams?.difficulty || 'medium'

  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null)
  const [practicePuzzle, setPracticePuzzle] = useState<PracticePuzzle | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [practiceLoading, setPracticeLoading] = useState(!!sharedParams?.startWord)
  const [error, setError] = useState<string | null>(null)
  const [mode, setModeState] = useState<PuzzleMode>(initialMode)
  const [difficulty, setDifficultyState] = useState<PuzzleDifficulty>(initialDifficulty)

  const fetchPuzzle = useCallback(async () => {
    setDailyLoading(true)
    setError(null)

    try {
      const dateKey = getLocalDate()
      const puzzle = await getDailyPuzzle(dateKey)
      setDailyPuzzle(puzzle)
    } catch (err) {
      console.error('Error resolving daily puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to load puzzle')

      // Set a fallback puzzle so the game stays playable
      setDailyPuzzle({
        id: 0,
        puzzleNumber: 1,
        date: getLocalDate(),
        startWord: 'butterfly',
        goalWord: 'moonshine',
        parSteps: 6,
        isDaily: true,
        mode: 'daily',
      })
    } finally {
      setDailyLoading(false)
    }
  }, [getLocalDate])

  // Generate a practice puzzle with specific start/goal words (for shared puzzles)
  const generateSharedPracticePuzzle = useCallback(async (
    startWord: string,
    goalWord: string,
    sharedDifficulty: PuzzleDifficulty
  ) => {
    setPracticeLoading(true)
    setError(null)

    try {
      const puzzle = await generatePracticePuzzleForDifficulty(
        sharedDifficulty,
        startWord,
        goalWord
      )

      setPracticePuzzle(puzzle)

      // Clear URL params after successful load
      if (!urlClearedRef.current) {
        clearUrlParams()
        urlClearedRef.current = true
      }
    } catch (err) {
      console.error('Error generating shared practice puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate practice puzzle')
    } finally {
      setPracticeLoading(false)
    }
  }, [])

  // Handle URL params on initial load (shared puzzle links) - runs once on mount
  useEffect(() => {
    // Skip if no shared params
    if (!sharedParams) return
    
    // Skip if already loaded
    if (sharedPuzzleLoadedRef.current) return

    if (sharedParams.startWord && sharedParams.goalWord) {
      // Mark as loading to prevent race with auto-generate
      sharedPuzzleLoadedRef.current = true
      
      // Shared practice puzzle - mode/difficulty already set in initial state
      void generateSharedPracticePuzzle(
        sharedParams.startWord,
        sharedParams.goalWord,
        sharedParams.difficulty || 'medium'
      )
    }
    // For daily puzzles, we just load the current day's puzzle
    // (puzzle number in URL is informational - we always load today's puzzle)
  }, [generateSharedPracticePuzzle, sharedParams])

  useEffect(() => {
    fetchPuzzle()
  }, [fetchPuzzle])

  // Check for midnight reset
  useEffect(() => {
    const checkForReset = () => {
      const currentDate = getLocalDate()

      if (dailyPuzzle && dailyPuzzle.date !== currentDate) {
        fetchPuzzle()
      }
    }

    // Check every minute
    const interval = setInterval(checkForReset, 60000)
    return () => clearInterval(interval)
  }, [dailyPuzzle, fetchPuzzle, getLocalDate])

  // Internal generate function that takes difficulty as a parameter
  const generatePracticePuzzleWithDifficulty = useCallback(async (diff: PuzzleDifficulty) => {
    setPracticeLoading(true)
    setError(null)

    try {
      const puzzle = await generatePracticePuzzleForDifficulty(diff)
      setPracticePuzzle(puzzle)
    } catch (err) {
      console.error('Error generating practice puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate practice puzzle')
    } finally {
      setPracticeLoading(false)
    }
  }, [])

  // Public generate function that uses current difficulty
  const generatePracticePuzzle = useCallback(async () => {
    return generatePracticePuzzleWithDifficulty(difficulty)
  }, [difficulty, generatePracticePuzzleWithDifficulty])

  const handleDifficultyChange = useCallback((value: PuzzleDifficulty) => {
    setDifficultyState(value)
    setPracticePuzzle(null)
    // Generate new puzzle immediately with the new difficulty
    void generatePracticePuzzleWithDifficulty(value)
  }, [generatePracticePuzzleWithDifficulty])

  const setMode = useCallback((nextMode: PuzzleMode) => {
    setModeState(nextMode)
  }, [])

  // Auto-generate practice puzzle when switching to practice mode
  // BUT skip if we're loading a shared puzzle from URL params
  useEffect(() => {
    if (mode !== 'practice') return
    if (practicePuzzle || practiceLoading) return
    // Don't auto-generate if we have shared params - we're loading that instead
    if (sharedParams?.startWord && sharedParams?.goalWord) return
    void generatePracticePuzzle()
  }, [mode, practicePuzzle, practiceLoading, generatePracticePuzzle, sharedParams])

  // Keep track of difficulty for shared puzzle handling
  useEffect(() => {
    if (sharedPuzzleLoadedRef.current) {
      sharedPuzzleLoadedRef.current = false
    }
  }, [difficulty])

  const activePuzzle: PuzzleInstance | null = mode === 'daily' ? dailyPuzzle : practicePuzzle
  // In practice mode, also show loading if we don't have a puzzle yet (before the effect triggers)
  const isLoading = mode === 'daily' 
    ? dailyLoading 
    : (practiceLoading || practicePuzzle === null)

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


