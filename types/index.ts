export type PuzzleMode = "daily" | "pracice"
export interface GraphNode {
  word: string;
  parts: { left: string, right: string };
  currPos: { x: number, y: number };
  goalPos: { x: number, y: number };
  connectedToGoal?: boolean;
  clicked?: boolean;
} 
