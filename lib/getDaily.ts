import puzzlePaths from "@public/puzzle_paths.json"
import { differenceInDays } from 'date-fns';
import { GraphNode } from "@/types"
import { createGraphNode } from "./graphHelpers";
const baseDate = new Date(2026, 0, 8);

export function getDailyIndex() {
  // TODO: ensure that you cant just change device date
  const today = new Date();
  return differenceInDays(today, baseDate);
}

function wordsToNodeContext(puzzle): GraphNode[] {
  const startWord = puzzle.path[0];
  const goalWord = puzzle.path[puzzle.path.length - 1]
  const startNode = createGraphNode(startWord, { left: "", right: startWord }, true)
  const goalNode = createGraphNode(goalWord, { left: goalWord, right: "" }, false, true)

  return [startNode, goalNode];
};


export function getDaily() {
  const puzzle = puzzlePaths[getDailyIndex() % puzzlePaths.length]

  return wordsToNodeContext(puzzle);
}
