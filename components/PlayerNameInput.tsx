'use client'

import { useState, useEffect } from 'react'
import { getPlayerName, setPlayerName, updateAllScoreNames } from '@/lib/player-id'

interface PlayerNameInputProps {
  onNameSet?: (name: string) => void
  onNameUpdated?: () => void
  className?: string
}

export default function PlayerNameInput({ onNameSet, onNameUpdated, className = '' }: PlayerNameInputProps) {
  const [name, setName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const savedName = getPlayerName()
    if (savedName) {
      setName(savedName)
    }
  }, [])

  const handleSave = () => {
    const trimmed = name.trim()
    
    if (!trimmed) {
      setError('Navnet kan ikke være tomt')
      return
    }
    
    if (trimmed.length > 20) {
      setError('Navnet må være 20 tegn eller færre')
      return
    }
    
    if (!/^[\p{L}0-9_\s-]+$/u.test(trimmed)) {
      setError('Bare bokstaver, tall, mellomrom, bindestreker og understreker er tillatt')
      return
    }
    
    setPlayerName(trimmed)
    setName(trimmed)
    setIsEditing(false)
    setError('')
    setSuccess(true)
    onNameSet?.(trimmed)
    
    // Update existing scores with the new name
    updateExistingScores(trimmed)
    
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(false), 3000)
  }
  
  const updateExistingScores = (playerName: string) => {
    try {
      const updatedCount = updateAllScoreNames(playerName)
      if (updatedCount > 0) {
        console.log(`Updated ${updatedCount} saved scores with your name`)
      }
      onNameUpdated?.()
    } catch (error) {
      console.error('Failed to update existing scores:', error)
    }
  }

  const handleCancel = () => {
    const savedName = getPlayerName()
    setName(savedName || '')
    setIsEditing(false)
    setError('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!isEditing && name) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsEditing(true)}
          className={`text-hive-yellow hover:text-white transition-colors font-medium ${className}`}
          title="Klikk for å endre navnet ditt"
        >
          {name}
        </button>
        {success && (
          <span className="text-green-400 text-xs">✓</span>
        )}
      </div>
    )
  }

  if (!isEditing && !name) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={`text-hive-yellow/80 hover:text-hive-yellow transition-colors text-sm ${className}`}
        title="Klikk for å legge til navnet ditt"
      >
        legg til navnet ditt
      </button>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="navnet ditt"
          maxLength={20}
          autoFocus
          className="bg-hive-graphite/80 text-white px-3 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-hive-yellow/50 placeholder-gray-500"
        />
        <button
          onClick={handleSave}
          className="bg-hive-yellow text-hive-dark px-3 py-1 rounded text-sm font-medium hover:bg-hive-yellow/90 transition-colors"
        >
          Lagre
        </button>
        <button
          onClick={handleCancel}
          className="text-hive-yellow/60 hover:text-hive-yellow text-sm transition-colors"
        >
          Avbryt
        </button>
      </div>
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}
    </div>
  )
}
