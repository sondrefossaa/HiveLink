'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PuzzleDifficulty, ShareStatus } from '@/types'
import { buildOgImageUrl, buildShareText, buildShareUrl } from '@/lib/share'

interface ShareButtonProps {
  puzzleNumber?: number
  wordsUsed: number
  layers: number
  status: ShareStatus
  startWord: string
  goalWord: string
  isDaily: boolean
  difficulty?: PuzzleDifficulty
  bestPath?: string[]
  pathsFound?: number
  compact?: boolean
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
  bestPath,
  pathsFound,
  compact = false,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const options = { puzzleNumber, wordsUsed, layers, status, startWord, goalWord, isDaily, difficulty, bestPath, pathsFound }
    const text = buildShareText(options)
    const shareUrl = buildShareUrl(options)
    const imageUrl = buildOgImageUrl(options)

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
  }, [puzzleNumber, wordsUsed, layers, status, startWord, goalWord, isDaily, difficulty, bestPath, pathsFound])

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

