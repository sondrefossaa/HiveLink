import assert from 'node:assert/strict'
import test from 'node:test'
import type { PuzzleDifficulty } from '../types'
import { GENERATION_THRESHOLDS } from './frequency-policy'
import { getEnvironment, getWordEntriesForWord, hasDictionaryWord } from './dictionary'
import { generateDailyPuzzle, generatePracticePuzzle } from './puzzle-generator'

const ranks: Record<PuzzleDifficulty, number> = { easy: 0, medium: 1, hard: 2 }
const lengths: Record<PuzzleDifficulty, [number, number]> = {
  easy: [2, 3],
  medium: [3, 4],
  hard: [4, 5],
}

async function assertFrequencyGatedPath(
  difficulty: PuzzleDifficulty,
  startWord: string,
  solutionPath: string[],
  solutionAnalysisIds: number[]
): Promise<void> {
  const rank = ranks[difficulty]
  let outgoing = new Set([startWord])
  for (let index = 0; index < solutionPath.length; index++) {
    const entries = await getWordEntriesForWord(solutionPath[index])
    const entry = entries.find(candidate => candidate.analysisId === solutionAnalysisIds[index])
    assert.ok(entry, `missing intended analysis for ${solutionPath[index]}`)
    const transitionIndex = entry.incomingKeys.findIndex((key, keyIndex) =>
      outgoing.has(key) && entry.incomingTiers[keyIndex] >= 0 && entry.incomingTiers[keyIndex] <= rank
    )
    assert.ok(transitionIndex >= 0, `${entry.word} is not eligible for ${difficulty}`)
    assert.ok(entry.frequency >= GENERATION_THRESHOLDS[rank].absoluteFamiliarity)
    assert.ok(entry.incomingSalience[transitionIndex] >= GENERATION_THRESHOLDS[rank].normalizedSalience)
    outgoing = new Set(entry.outgoingKeys)
  }
}

for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  test(`generates ${difficulty} paths whose weakest edge meets both frequency gates`, async () => {
    const puzzle = await generatePracticePuzzle(difficulty)
    assert.ok(puzzle.parSteps >= lengths[difficulty][0] && puzzle.parSteps <= lengths[difficulty][1])
    await assertFrequencyGatedPath(difficulty, puzzle.startWord, puzzle.solutionPath, puzzle.solutionAnalysisIds)
  })
}

test('daily intended paths use the easy frequency policy', async () => {
  const puzzle = await generateDailyPuzzle(new Date('2026-09-03T00:00:00Z'))
  assert.ok(puzzle.parSteps >= 2 && puzzle.parSteps <= 3)
  await assertFrequencyGatedPath('easy', puzzle.startWord, puzzle.solutionPath, puzzle.solutionAnalysisIds)
})

test('rare structural compounds remain playable but are excluded from generated hard paths', async () => {
  assert.equal(await hasDictionaryWord('maltsirup'), true)
  const entries = await getWordEntriesForWord('maltsirup')
  assert.ok(entries.length > 0)
  assert.ok(entries.every(entry => entry.incomingTiers.every(tier => tier < 0)))
  const hard = await getEnvironment('hard')
  assert.equal(hard.words.some(entry => entry.word === 'maltsirup'), false)
})

test('the previously difficult tvangsarbeid transition is not easy eligible', async () => {
  const entries = await getWordEntriesForWord('tvangsarbeid')
  assert.ok(entries.length > 0)
  assert.ok(entries.every(entry => entry.incomingTiers.every(tier => tier !== 0)))
})
