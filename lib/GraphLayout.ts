import { GraphNode, GraphLayoutResult } from "@/types"
import { GameState } from "./gameState";
import { he } from "date-fns/locale";

const nodeRadius: number = 80;
const edgePadding: number = 10;



function calculateNodePositions(nodesByLayer, width, height) {
  const layers = Array.from(nodesByLayer.keys()).sort()
  let maxLayerSize = 0;
  for (let layer of layers) {
    const currLayer = nodesByLayer.get(layer);
    if (layer === 0 || layer === -1) continue;
    if (currLayer.length > maxLayerSize) {
      maxLayerSize = currLayer.length;
    }
    currLayer.sort((a: GraphNode, b: GraphNode) => {
      return a.parent!.word!.localeCompare(b.parent!.word!);
    })
  }

  const horizontalSpacing = width / (layers.length - 2);
  const verticalSpacing = (height - edgePadding * 2) / maxLayerSize;

  for (let layer of layers) {
    if (layer === 0 || layer === -1) continue;
    const currLayer = nodesByLayer.get(layer);
    const layerSizeMid = Math.floor(currLayer.length / 2);
    currLayer.forEach((node, index) => {
      node.currPos = { x: horizontalSpacing * layer, y: (index - layerSizeMid) * verticalSpacing };
    })
  }
  nodesByLayer.get(0)[0].currPos = { x: edgePadding + nodeRadius, y: height / 2 };
  nodesByLayer.get(-1)[0].currPos = { x: width - edgePadding - nodeRadius, y: height / 2 };

  const result = [];
  for (let layer of layers) {
    result.push(...nodesByLayer.get(layer));
  }

  return result;
}
export function GetGraphLayout(width: number, height: number): GraphLayoutResult {
  const screenWidth: number = width;
  const screenHeight: number = height;

  try {
    // Get nodes organized by layer for current game mode
    const nodesByLayer = GameState.paths[GameState.gameMode];

    // Calculate positions
    const graphNodes = calculateNodePositions(nodesByLayer, screenWidth, screenHeight);

    // Log positioned nodes for debugging
    console.log("Positioned nodes:", graphNodes.map(node => ({
      word: node.word,
      pos: node.currPos,
      isGoal: node.isGoal,
      isStart: node.isStart
    })));

    return {
      graphNodes
    };

  } catch (error) {
    console.error("Error in GetGraphLayout:", error);
    return { graphNodes: [] };
  }
}
