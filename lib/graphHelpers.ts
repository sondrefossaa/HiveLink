import { GraphNode } from "@/types";
import { hiveYellow } from "./colors";
export function createGraphNode(
  word: string,
  parts: { left: string; right: string },
  currPos: { x: number; y: number },
  goalPos?: { x: number; y: number },
  connectedToGoal: boolean = false
): GraphNode {
  return {
    word,
    parts,
    currPos,
    goalPos: goalPos ?? currPos, // Default to current position
    connectedToGoal,
  };
}
export function drawLink(
  ctx: CanvasRenderingContext2D,
  startPos: { x: number, y: number },
  endPos: { x: number, y: number }
): void {
  ctx.fillStyle = hiveYellow,
    ctx.moveTo(startPos.x, startPos.y);
  ctx.lineTo(endPos.x, endPos.y);
  ctx.stroke()
}
export function drawLinkBetweenNodes(
  ctx: CanvasRenderingContext2D,
  nodeA: GraphNode,
  nodeB: GraphNode,
  radius: number = 80
) {
  drawLink(ctx,
    { x: nodeA.currPos.x + radius, y: nodeA.currPos.y },
    { x: nodeB.currPos.x - radius, y: nodeB.currPos.y }
  );
}
