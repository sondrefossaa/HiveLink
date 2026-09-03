import type { PuzzleDifficulty, ShareStatus } from '@/types'

interface ShareOptions {
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
}

const difficultyLabels: Record<PuzzleDifficulty, string> = {
  easy: 'Lett',
  medium: 'Middels',
  hard: 'Vanskelig',
}

export function buildShareUrl({
  puzzleNumber,
  startWord,
  goalWord,
  isDaily,
  difficulty,
}: Pick<ShareOptions, 'puzzleNumber' | 'startWord' | 'goalWord' | 'isDaily' | 'difficulty'>): string {
  const params = new URLSearchParams()

  if (isDaily && puzzleNumber) {
    params.set('puzzle', puzzleNumber.toString())
  } else {
    params.set('start', startWord.toLowerCase())
    params.set('goal', goalWord.toLowerCase())
    if (difficulty) params.set('difficulty', difficulty)
  }

  return `https://hivelink.buzz/?${params.toString()}`
}

export function buildOgImageUrl(options: ShareOptions): string {
  const params = new URLSearchParams({
    status: options.status,
    start: options.startWord,
    goal: options.goalWord,
    words: options.wordsUsed.toString(),
    layers: options.layers.toString(),
    paths: (options.pathsFound ?? 0).toString(),
  })

  options.bestPath?.forEach((word) => params.append('path', word))
  if (options.isDaily && options.puzzleNumber) {
    params.set('puzzle', options.puzzleNumber.toString())
  } else if (options.difficulty) {
    params.set('difficulty', options.difficulty)
  }

  return `/api/og?${params.toString()}`
}

export function buildShareText(options: ShareOptions): string {
  const statusConfig = {
    won: { emoji: '🏆', text: 'Løst!' },
    'gave-up': { emoji: '❌', text: 'Ga opp' },
    playing: { emoji: '⏳', text: 'Summer fortsatt...' },
  }
  const status = statusConfig[options.status]
  const header = options.isDaily
    ? `🍯 HiveLink #${options.puzzleNumber}`
    : `🍯 HiveLink Øvelse (${difficultyLabels[options.difficulty || 'medium']})`
  const pathLines = options.bestPath?.length
    ? `\n\n🔗 ${options.pathsFound ?? 1} ${(options.pathsFound ?? 1) === 1 ? 'sti funnet' : 'stier funnet'}\n${options.bestPath.join(' → ')}`
    : ''

  return `${header}

🐝 → ${status.emoji} ${status.text}

${options.startWord} → ${options.goalWord}

📝 ${options.wordsUsed} ord | 📊 ${options.layers} lag${pathLines}

Spill: ${buildShareUrl(options)}`
}
