'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PuzzleDifficulty, ShareStatus } from '@/types'

interface ShareButtonProps {
  puzzleNumber?: number
  wordsUsed: number
  layers: number
  status: ShareStatus
  startWord: string
  goalWord: string
  isDaily: boolean
  difficulty?: PuzzleDifficulty
  compact?: boolean
}

const difficultyLabels: Record<PuzzleDifficulty, string> = {
  easy: 'Lett',
  medium: 'Middels',
  hard: 'Vanskelig',
}

export default function ShareButton({
  puzzleNumber,
  wordsUsed,
  layers,
  status,
  startWord,
  goalWord,
  isDaily,
  difficulty,
  compact = false,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  // Generate share URL with puzzle info
  const generateShareUrl = useCallback(() => {
    const baseUrl = 'https://hivelink.buzz/'
    const params = new URLSearchParams()
    
    if (isDaily && puzzleNumber) {
      // For daily puzzles, just include puzzle number
      params.set('puzzle', puzzleNumber.toString())
    } else {
      // For practice puzzles, include start/goal words and difficulty
      params.set('start', startWord.toLowerCase())
      params.set('goal', goalWord.toLowerCase())
      if (difficulty) {
        params.set('difficulty', difficulty)
      }
    }
    
    return `${baseUrl}?${params.toString()}`
  }, [isDaily, puzzleNumber, startWord, goalWord, difficulty])

  // Generate OG image URL for social sharing
  const generateOgImageUrl = useCallback(() => {
    // Use relative URL so it works in both dev and production
    const baseUrl = '/api/og'
    const params = new URLSearchParams()
    
    params.set('status', status)
    params.set('start', startWord)
    params.set('goal', goalWord)
    params.set('words', wordsUsed.toString())
    params.set('layers', layers.toString())
    
    if (isDaily && puzzleNumber) {
      params.set('puzzle', puzzleNumber.toString())
    } else if (difficulty) {
      params.set('difficulty', difficulty)
    }
    
    return `${baseUrl}?${params.toString()}`
  }, [status, startWord, goalWord, wordsUsed, layers, isDaily, puzzleNumber, difficulty])

  const generateShareText = useCallback(() => {
    // Status emoji and text
    const statusConfig = {
      won: { emoji: '🏆', text: 'Løst!' },
      'gave-up': { emoji: '❌', text: 'Ga opp' },
      playing: { emoji: '⏳', text: 'Summer fortsatt...' },
    }
    const { emoji: statusEmoji, text: statusText } = statusConfig[status]
    
    // Simple emoji chain: 🐝 → result
    const chainViz = `🐝 → ${statusEmoji}`
    
    // Header: puzzle number for daily, difficulty for practice
    const header = isDaily
      ? `🍯 HiveLink #${puzzleNumber}`
      : `🍯 HiveLink Øvelse (${difficultyLabels[difficulty || 'medium']})`

    // Generate shareable URL
    const shareUrl = generateShareUrl()

    const text = `${header}

${chainViz} ${statusText}

${startWord} → ${goalWord}

📝 ${wordsUsed} ord | 📊 ${layers} lag

Spill: ${shareUrl}`

    return text
  }, [puzzleNumber, wordsUsed, layers, status, startWord, goalWord, isDaily, difficulty, generateShareUrl])

  const handleShare = useCallback(async () => {
    const text = generateShareText()
    const shareUrl = generateShareUrl()
    const imageUrl = generateOgImageUrl()

    // Try native share with image first (mobile)
    if (navigator.share) {
      try {
        // Try to fetch the OG image and share it as a file
        const canShareFiles = navigator.canShare && navigator.canShare({ files: [new File([], 'test.png', { type: 'image/png' })] })
        
        if (canShareFiles) {
          try {
            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const file = new File([blob], 'hivelink-result.png', { type: 'image/png' })
            
            await navigator.share({
              title: isDaily ? `HiveLink #${puzzleNumber}` : 'HiveLink Øvelse',
              text,
              url: shareUrl,
              files: [file],
            })
            return
          } catch (imgErr) {
            // Image fetch failed, fall back to text-only share
            console.log('Image share failed, falling back to text:', imgErr)
          }
        }
        
        // Fall back to text-only share
        await navigator.share({
          title: isDaily ? `HiveLink #${puzzleNumber}` : 'HiveLink Øvelse',
          text,
          url: shareUrl,
        })
        return
      } catch (err) {
        // User cancelled or share failed, fall back to clipboard
      }
    }

    // Fall back to clipboard - copy text with link (image doesn't include link)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [generateShareText, generateShareUrl, generateOgImageUrl, isDaily, puzzleNumber])

  // Compact mode for TopBar - just an icon button
  if (compact) {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleShare}
        className="w-9 h-9 rounded-lg bg-hive-graphite/50 hover:bg-hive-graphite/80
                   text-hive-yellow flex items-center justify-center transition-colors
                   border border-hive-slate/30"
        title={copied ? 'Kopiert!' : 'Del fremgang'}
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
        )}
      </motion.button>
    )
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleShare}
      className="flex-1 py-3 rounded-xl bg-hive-yellow hover:bg-hive-gold
                text-hive-dark font-medium transition-colors
                flex items-center justify-center gap-2"
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Kopiert!
          </motion.span>
        ) : (
          <motion.span
            key="share"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            Del
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

