import { GraphNode, GraphLayoutResult } from "@/types"
import { GameState } from "./gameState";

const nodeRadius: number = 80;
const edgePadding: number = 10;

/**
 * Calculate node positions for a layered graph stored in a Map
 * Special handling: layer -1 (goal) is always the rightmost column
 */
function calculateNodePositions(
  nodesByLayer: Map<number, GraphNode[]>,
  screenWidth: number,
  screenHeight: number
): GraphNode[] {
  // Get all layers
  const layers = Array.from(nodesByLayer.keys());

  // Separate regular layers (>= 0) from goal layer (-1)
  const regularLayers = layers.filter(layer => layer >= 0).sort((a, b) => a - b);
  const hasGoalLayer = layers.includes(-1);

  // Calculate number of columns: regular layers + goal (if exists)
  const numColumns = regularLayers.length + (hasGoalLayer ? 1 : 0);

  if (numColumns === 0) {
    return [];
  }

  // Calculate horizontal spacing
  const startX = edgePadding + nodeRadius;
  const endX = screenWidth - edgePadding - nodeRadius;
  const totalHorizontalSpace = endX - startX;
  const columnSpacing = totalHorizontalSpace / Math.max(numColumns - 1, 1);

  const positionedNodes: GraphNode[] = [];

  // Position regular layers (0, 1, 2, ...) from left to right
  regularLayers.forEach((layer, columnIndex) => {
    const layerNodes = nodesByLayer.get(layer) || [];
    const layerX = startX + (columnIndex * columnSpacing);

    positionNodesInColumn(layerNodes, layerX, positionedNodes, screenHeight);
  });

  // Position goal layer (-1) at the far right
  if (hasGoalLayer) {
    const goalNodes = nodesByLayer.get(-1) || [];
    const goalX = endX; // Goal is at the far right

    positionNodesInColumn(goalNodes, goalX, positionedNodes, screenHeight);
  }

  return positionedNodes;
}

/**
 * Helper function to position nodes in a vertical column
 */
function positionNodesInColumn(
  nodes: GraphNode[],
  columnX: number,
  outputArray: GraphNode[],
  screenHeight: number
): void {
  if (nodes.length === 0) return;

  const totalColumnHeight = screenHeight - (2 * edgePadding);

  nodes.forEach((node, nodeIndex) => {
    let nodeY;

    if (nodes.length === 1) {
      // Single node in column: center it
      nodeY = screenHeight / 2;
    } else {
      // Multiple nodes: distribute evenly
      const verticalSpacing = totalColumnHeight / (nodes.length - 1);
      nodeY = edgePadding + (nodeIndex * verticalSpacing);
    }

    outputArray.push({
      ...node,
      currPos: { x: columnX, y: nodeY }
    });
  });
}

/**
 * Get graph layout for current game mode
 */
export function GetGraphLayout(width: number, height: number): GraphLayoutResult {
  const screenWidth: number = width;
  const screenHeight: number = height;

  try {
    // Get nodes organized by layer for current game mode
    const nodesByLayer = GameState.paths[GameState.gameMode];

    // Debug log
    console.log("GetGraphLayout structure:", {
      gameMode: GameState.gameMode,
      layerCount: nodesByLayer?.size,
      layers: nodesByLayer ? Array.from(nodesByLayer.keys()).sort((a, b) => a - b) : [],
      hasGoal: nodesByLayer?.has(-1)
    });

    if (!nodesByLayer || nodesByLayer.size === 0) {
      console.warn("No nodes found for current game mode");
      return { graphNodes: [] };
    }

    // Validate we have a start node
    if (!nodesByLayer.has(0)) {
      console.error("Missing start layer (0)");
      return { graphNodes: [] };
    }

    // Log layer details for debugging
    console.log("Layer details:");
    nodesByLayer.forEach((nodes, layer) => {
      console.log(`  Layer ${layer}: ${nodes.length} nodes`);
      if (layer === -1) {
        console.log(`    Goal node: ${nodes[0]?.word}`);
      } else if (layer === 0) {
        console.log(`    Start node: ${nodes[0]?.word}`);
      }
    });

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

/**
 * Alternative layout: Goal in middle-right, start in middle-left
 */
export function GetGraphLayoutBalanced(width: number, height: number): GraphLayoutResult {
  const screenWidth: number = width;
  const screenHeight: number = height;

  try {
    const nodesByLayer = GameState.paths[GameState.gameMode];

    if (!nodesByLayer || nodesByLayer.size === 0) {
      return { graphNodes: [] };
    }

    // Get all layers
    const layers = Array.from(nodesByLayer.keys());
    const regularLayers = layers.filter(layer => layer >= 0).sort((a, b) => a - b);
    const hasGoalLayer = layers.includes(-1);

    const positionedNodes: GraphNode[] = [];
    const startX = edgePadding + nodeRadius;
    const endX = screenWidth - edgePadding - nodeRadius;

    // If we only have start and goal
    if (regularLayers.length === 1 && hasGoalLayer) {
      // Start on left, goal on right
      const startNodes = nodesByLayer.get(0) || [];
      const goalNodes = nodesByLayer.get(-1) || [];

      positionNodesInColumn(startNodes, startX, positionedNodes, screenHeight);
      positionNodesInColumn(goalNodes, endX, positionedNodes, screenHeight);

      return { graphNodes: positionedNodes };
    }

    // For more complex graphs, use the regular positioning
    return GetGraphLayout(width, height);

  } catch (error) {
    console.error("Error in GetGraphLayoutBalanced:", error);
    return { graphNodes: [] };
  }
}

/**
 * Debug function to visualize the layout
 */
export function visualizeLayout(width: number, height: number): void {
  const result = GetGraphLayout(width, height);

  console.group("Graph Layout Visualization");
  console.log(`Canvas: ${width}x${height}`);
  console.log(`Node radius: ${nodeRadius}`);
  console.log(`Edge padding: ${edgePadding}`);

  result.graphNodes.forEach(node => {
    const type = node.isGoal ? "GOAL" : node.isStart ? "START" : "MIDDLE";
    console.log(`${type} "${node.word}": (${node.currPos?.x?.toFixed(1)}, ${node.currPos?.y?.toFixed(1)})`);
  });

  console.groupEnd();
}
