import { v4 as uuidv4 } from 'uuid'
import type { Player } from '@/types'

const PLAYER_ID_KEY = 'hivelink_player_id'
const PLAYER_DATA_KEY = 'hivelink_player_data'

/**
 * Get or create an anonymous player ID
 * Stored in localStorage for persistence across sessions
 */
export function getPlayerId(): string {
  if (typeof window === 'undefined') {
    // Server-side, return a temporary ID
    return `temp-${uuidv4()}`
  }
  
  try {
    let playerId = localStorage.getItem(PLAYER_ID_KEY)
    
    if (!playerId) {
      playerId = uuidv4()
      localStorage.setItem(PLAYER_ID_KEY, playerId)
      
      // Also store creation timestamp
      const playerData: Player = {
        id: playerId,
        createdAt: new Date().toISOString(),
      }
      localStorage.setItem(PLAYER_DATA_KEY, JSON.stringify(playerData))
    }
    
    return playerId
  } catch (error) {
    // localStorage not available (private browsing, etc.)
    console.warn('localStorage not available:', error)
    return `session-${uuidv4()}`
  }
}

/**
 * Get player data including creation date
 */
export function getPlayerData(): Player | null {
  if (typeof window === 'undefined') {
    return null
  }
  
  try {
    const data = localStorage.getItem(PLAYER_DATA_KEY)
    if (data) {
      return JSON.parse(data)
    }
    
    // Fallback: create from existing ID
    const playerId = localStorage.getItem(PLAYER_ID_KEY)
    if (playerId) {
      return {
        id: playerId,
        createdAt: new Date().toISOString(),
      }
    }
    
    return null
  } catch (error) {
    console.warn('Error reading player data:', error)
    return null
  }
}

/**
 * Check if this is the player's first visit
 */
export function isFirstVisit(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  
  try {
    return !localStorage.getItem(PLAYER_ID_KEY)
  } catch {
    return true
  }
}

/**
 * Get the game state for a specific puzzle date
 */
export function getSavedGameState(puzzleDate: string): unknown | null {
  if (typeof window === 'undefined') {
    return null
  }
  
  try {
    const key = `hivelink_game_${puzzleDate}`
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.warn('Error reading saved game state:', error)
    return null
  }
}

/**
 * Save the game state for a specific puzzle date
 */
export function saveGameState(puzzleDate: string, state: unknown): void {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    const key = `hivelink_game_${puzzleDate}`
    localStorage.setItem(key, JSON.stringify(state))
  } catch (error) {
    console.warn('Error saving game state:', error)
  }
}

/**
 * Clear saved game state for a specific puzzle date
 */
export function clearGameState(puzzleDate: string): void {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    const key = `hivelink_game_${puzzleDate}`
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('Error clearing game state:', error)
  }
}

/**
 * Get completed puzzles history
 */
export function getCompletedPuzzles(): string[] {
  if (typeof window === 'undefined') {
    return []
  }
  
  try {
    const data = localStorage.getItem('hivelink_completed_puzzles')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * Mark a puzzle as completed
 */
export function markPuzzleCompleted(puzzleDate: string): void {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    const completed = getCompletedPuzzles()
    if (!completed.includes(puzzleDate)) {
      completed.push(puzzleDate)
      localStorage.setItem('hivelink_completed_puzzles', JSON.stringify(completed))
    }
  } catch (error) {
    console.warn('Error marking puzzle completed:', error)
  }
}

/**
 * Check if a puzzle has been completed
 */
export function isPuzzleCompleted(puzzleDate: string): boolean {
  return getCompletedPuzzles().includes(puzzleDate)
}

/**
 * Get player statistics
 */
export function getPlayerStats(): {
  gamesPlayed: number
  gamesWon: number
  currentStreak: number
  maxStreak: number
  averageWords: number
} {
  if (typeof window === 'undefined') {
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      averageWords: 0,
    }
  }
  
  try {
    const data = localStorage.getItem('hivelink_stats')
    if (data) {
      return JSON.parse(data)
    }
  } catch {
    // Ignore
  }
  
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    averageWords: 0,
  }
}

/**
 * Update player statistics after a game
 */
export function updatePlayerStats(
  wordsUsed: number,
  won: boolean,
  options?: { isDaily?: boolean }
): void {
  if (typeof window === 'undefined') {
    return
  }
  
  if (options?.isDaily === false) {
    return
  }

  try {
    const stats = getPlayerStats()
    
    stats.gamesPlayed++
    
    if (won) {
      stats.gamesWon++
      stats.currentStreak++
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
      
      // Update average
      const totalWords = stats.averageWords * (stats.gamesWon - 1) + wordsUsed
      stats.averageWords = Math.round(totalWords / stats.gamesWon)
    } else {
      stats.currentStreak = 0
    }
    
    localStorage.setItem('hivelink_stats', JSON.stringify(stats))
  } catch (error) {
    console.warn('Error updating player stats:', error)
  }
}

