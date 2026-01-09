import puzzlePaths from "@public/puzzle_paths.json"
import { differenceInDays } from 'date-fns';
import { GraphNode, graphNodesByLayer } from "@/types"
import { createGraphNode } from "./graphHelpers";
import simpleCompounds from "../data/simple_compound_words.json"
const baseDate = new Date(2026, 0, 8);

export function getDailyIndex() {
  // TODO: ensure that you cant just change device date
  const today = new Date();
  return differenceInDays(today, baseDate);
}

function wordsToNodesByLayer(puzzle): graphNodesByLayer {
  const startWord = puzzle.path[0];
  const goalWord = puzzle.path[puzzle.path.length - 1]
  const startNode = createGraphNode(startWord, { left: "", right: startWord }, true)
  const goalNode = createGraphNode(goalWord, { left: goalWord, right: "" }, false, true)

  const nodesByLayer: graphNodesByLayer = new Map();
  nodesByLayer.set(0, [startNode]);
  nodesByLayer.set(-1, [goalNode]);

  return nodesByLayer;
};


export function getDaily() {
  const simple = true;
  if (simple) {
    const index = 0;
    const startNode = createGraphNode(simpleCompounds[index].word, { left: simpleCompounds[index].parts[0], right: simpleCompounds[index].parts[1] }, true);
    const goalNode = createGraphNode(simpleCompounds[index + 1].word, { left: simpleCompounds[index + 1].parts[0], right: simpleCompounds[index + 1].parts[1] }, true)

    const nodesByLayer: graphNodesByLayer = new Map();
    nodesByLayer.set(0, [startNode]);
    nodesByLayer.set(-1, [goalNode]);

    return nodesByLayer;
  }
  const puzzle = puzzlePaths[getDailyIndex() % puzzlePaths.length]

  return wordsToNodesByLayer(puzzle);
}
