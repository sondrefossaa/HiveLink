



export type PuzzleMode = "daily" | "practiceEasy" | "practiceMedium" | "practiceHard";

export interface GraphNode {
  word: string;
  parts: { left: string, right: string };
  currPos: { x: number, y: number };
  goalPos?: { x: number, y: number };
  connectedToGoal?: boolean;
  clicked?: boolean;
  isStart?: boolean;
  isGoal?: boolean;
  parent?: GraphNode;
}

export type graphNodesByLayer = Map<number, GraphNode[]>

export interface GraphLayoutResult {
  graphNodes: GraphNode[],

}
