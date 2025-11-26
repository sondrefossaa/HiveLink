'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ShareButtonProps {
  puzzleNumber: number
  wordsUsed: number
  layers: number
  path: string[]
  won: boolean
}

export default function ShareButton({
  puzzleNumber,
  wordsUsed,
  layers,
  path,
  won,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const generateShareText = useCallback(() => {
    const statusEmoji = won ? '🏆' : '❌'
    const honeycomb = '🍯'
    
    // Create a visual representation of the path
    const pathLength = path.length
    const maxEmojis = 10
    const emojiCount = Math.min(pathLength, maxEmojis)
    
    // Generate chain visualization
    let chainViz = ''
    for (let i = 0; i < emojiCount; i++) {
      if (i === 0) chainViz += '🦋' // Start (butterfly theme)
      else if (i === emojiCount - 1) chainViz += '🌙' // Goal (moon theme)
      else chainViz += '🔗'
    }
    if (pathLength > maxEmojis) {
      chainViz += '...'
    }

    const text = `${honeycomb} HiveLink #${puzzleNumber} ${statusEmoji}

${chainViz}

Words: ${wordsUsed} | Layers: ${layers}

Play at: hivelink.game`

    return text
  }, [puzzleNumber, wordsUsed, layers, path, won])

  const handleShare = useCallback(async () => {
    const text = generateShareText()

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          text,
        })
        return
      } catch (err) {
        // User cancelled or share failed, fall back to clipboard
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [generateShareText])

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
            Copied!
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
            Share
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

