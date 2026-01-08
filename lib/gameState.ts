import { GraphNode } from "@/types"
import { PuzzleMode } from "@/types";
import { getDaily } from "./getDaily";

export let GraphNodePaths = {
  "daily": getDaily() as GraphNode[],
  "practiceEasy": [] as GraphNode[],
  "practiceMedium": [] as GraphNode[],
  "practiceHard": [] as GraphNode[],
};

export let GameState = {
  paths: GraphNodePaths,
  gameMode: "daily" as PuzzleMode,
}
