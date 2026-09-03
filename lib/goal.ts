import { normalizeNo } from '@/lib/norwegian-dictionary'

/**
 * Win condition for reaching the goal.
 *
 * The goal is reached only when the explicitly typed word literally ends
 * with the goal word (suffix match), and is strictly longer than the goal.
 * Outgoing-key / dictionary-head equality is NOT sufficient — that caused
 * false wins like `sentralbord` (outgoing `bord`) auto-completing a
 * `besitter` goal by "inferring" `bordbesitter` the player never typed.
 */
export function reachesGoalWord(typedWord: string, goalWord: string): boolean {
  const typed = normalizeNo(typedWord)
  const goal = normalizeNo(goalWord)
  if (!typed || !goal) return false
  if (typed.length <= goal.length) return false
  return typed.endsWith(goal)
}
