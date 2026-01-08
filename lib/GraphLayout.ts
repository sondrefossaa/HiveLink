import { GraphNode, GraphLayoutResult } from "@/types"
import { createGraphNode } from "./graphHelpers";
import { GameState } from "./gameState";

const nodeRadius: number = 80;
const edgePadding: number = 10;
//TODO: fix :)
function buildNodesByLayer(nodes: GraphNode[]): Map<number, GraphNode[]> {
  const nodesByLayer = new Map<number, GraphNode[]>();

  // Find start and goal nodes
  const startNode = nodes.find(node => node.isStart === true);
  const goalNode = nodes.find(node => node.isGoal === true);

  if (!startNode || !goalNode) {
    throw new Error("Start or goal node not found");
  }

  // Layer 0: Start node
  nodesByLayer.set(0, [startNode]);

  // Remove start and goal nodes from processing
  const middleNodes = nodes.filter(node => !node.isStart && !node.isGoal);

  // BFS to find layers
  const visited = new Set<string>([startNode.word]);
  let currentLayer = [startNode];
  let layerIndex = 1;

  while (currentLayer.length > 0) {
    const nextLayer: GraphNode[] = [];

    for (const currentNode of currentLayer) {
      // Find nodes where left part matches current node's right part
      const connectedNodes = middleNodes.filter(node =>
        !visited.has(node.word) && node.parts.left === currentNode.parts.right
      );

      for (const connectedNode of connectedNodes) {
        visited.add(connectedNode.word);
        nextLayer.push(connectedNode);
      }
    }

    if (nextLayer.length > 0) {
      nodesByLayer.set(layerIndex, nextLayer);
      currentLayer = nextLayer;
      layerIndex++;
    } else {
      break;
    }
  }

  // Add goal node as last layer
  nodesByLayer.set(layerIndex, [goalNode]);

  return nodesByLayer;
}

function calculateNodePositions(
  nodesByLayer: Map<number, GraphNode[]>,
  screenWidth: number,
  screenHeight: number
): GraphNode[] {
  const layers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);
  const totalLayers = layers.length;

  // Calculate horizontal spacing
  const startX = edgePadding + nodeRadius;
  const endX = screenWidth - edgePadding - nodeRadius;
  const totalHorizontalSpace = endX - startX;
  const layerSpacing = totalHorizontalSpace / (totalLayers - 1);

  const updatedNodes: GraphNode[] = [];

  layers.forEach((layerIndex, index) => {
    const layerNodes = nodesByLayer.get(layerIndex) || [];
    const layerX = startX + (index * layerSpacing);

    // Calculate vertical positions within layer
    const totalLayerHeight = screenHeight - (2 * edgePadding);
    const verticalSpacing = layerNodes.length > 1
      ? totalLayerHeight / (layerNodes.length - 1)
      : totalLayerHeight / 2;

    layerNodes.forEach((node, nodeIndex) => {
      let nodeY;

      if (layerNodes.length === 1) {
        // Single node in layer: center it
        nodeY = screenHeight / 2;
      } else {
        // Multiple nodes: distribute evenly
        nodeY = edgePadding + (nodeIndex * verticalSpacing);
      }

      // Create updated node with new position
      const updatedNode: GraphNode = {
        ...node,
        currPos: { x: layerX, y: nodeY }
      };

      updatedNodes.push(updatedNode);
    });
  });

  return updatedNodes;
}

export function GetGraphLayout(width: number, height: number): GraphLayoutResult {
  const screenWidth: number = width;
  const screenHeight: number = height;

  try {
    // Get nodes for current game mode
    const nodesArray = GameState.paths[GameState.gameMode];

    if (!nodesArray || nodesArray.length === 0) {
      return { graphNodes: [] };
    }

    // Build layers
    const nodesByLayer = buildNodesByLayer(nodesArray);

    // Calculate positions
    const positionedNodes = calculateNodePositions(nodesByLayer, screenWidth, screenHeight);

    return {
      graphNodes: positionedNodes
    };

  } catch (error) {
    console.error("Error in GetGraphLayout:", error);
    return { graphNodes: [] };
  }
}

