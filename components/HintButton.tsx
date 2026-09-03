'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { generateHint } from '@/lib/hints'
import type { GraphNode, PuzzleDifficulty } from '@/types'

interface HintButtonProps {
  onHintReceived: (hint: { suggestedWord: string; sharedPart: string; parentWord: string; confidence: 'high' | 'medium' | 'low' }) => void
  disabled?: boolean
  className?: string
  nodes?: GraphNode[]
  goalWord?: string
  selectedNodeId?: string | null
  difficulty?: PuzzleDifficulty
}

export default function HintButton({ onHintReceived, disabled, className, nodes, goalWord, selectedNodeId, difficulty }: HintButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleGetHint = async () => {
    if (!nodes || nodes.length === 0 || !goalWord) {
      return
    }

    setLoading(true)
    try {
      const hint = await generateHint({ nodes, goalWord, selectedNodeId: selectedNodeId ?? null, difficulty })
      if (hint) {
        onHintReceived(hint)
      } else {
        console.warn('No valid hints found for the current board')
      }
    } catch (error) {
      console.error('Error generating hint:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.button
      type="button"
      onClick={handleGetHint}
      disabled={disabled || loading}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onKeyDown={(e) => {
        // Prevent Enter key from triggering the button
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className={`px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 bg-hive-yellow hover:bg-hive-gold text-hive-dark disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title="Få et hint"
    >
      {loading ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
        />
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="text-sm">Hint</span>
        </>
      )}
    </motion.button>
  )
}
