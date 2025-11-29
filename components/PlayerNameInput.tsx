'use client'

import { useState, useEffect } from 'react'
import { getPlayerName, setPlayerName, getPlayerId } from '@/lib/player-id'

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
      setError('Name cannot be empty')
      return
    }
    
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or less')
      return
    }
    
    if (!/^[a-zA-Z0-9_\s-]+$/.test(trimmed)) {
      setError('Only letters, numbers, spaces, hyphens, and underscores allowed')
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
  
  const updateExistingScores = async (playerName: string) => {
    try {
      const playerId = getPlayerId()
      const response = await fetch('/api/player/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, playerName }),
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`Updated ${data.data?.updatedCount || 0} scores with your name`)
        onNameUpdated?.()
      }
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
          title="Click to change your name"
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
        title="Click to add your name"
      >
        add your name
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
          placeholder="your name"
          maxLength={20}
          autoFocus
          className="bg-hive-graphite/80 text-white px-3 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-hive-yellow/50 placeholder-gray-500"
        />
        <button
          onClick={handleSave}
          className="bg-hive-yellow text-hive-dark px-3 py-1 rounded text-sm font-medium hover:bg-hive-yellow/90 transition-colors"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          className="text-hive-yellow/60 hover:text-hive-yellow text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}
    </div>
  )
}
