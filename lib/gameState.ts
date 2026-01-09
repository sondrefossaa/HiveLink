import { GraphNode, graphNodesByLayer } from "@/types"
import { PuzzleMode } from "@/types";
import { getDaily } from "./getDaily";


interface GamePaths {
  daily: graphNodesByLayer;
  practiceEasy: graphNodesByLayer;
  practiceMedium: graphNodesByLayer;
  practiceHard: graphNodesByLayer;
}

export const GraphNodePaths: GamePaths = {
  daily: getDaily(),
  practiceEasy: new Map(),
  practiceMedium: new Map(),
  practiceHard: new Map(),
};

export const GameState = {
  paths: GraphNodePaths,
  gameMode: "daily" as PuzzleMode,
};


// godot Signal like gamestate
type GameEvent = 'graph-updated' | 'game-mode-changed';
const gameEventListeners: Map<GameEvent, Array<() => void>> = new Map();

export function onGameEvent(event: GameEvent, callback: () => void) {
  if (!gameEventListeners.has(event)) {
    gameEventListeners.set(event, []);
  }
  gameEventListeners.get(event)!.push(callback);
}

export function offGameEvent(event: GameEvent, callback: () => void) {
  const callbacks = gameEventListeners.get(event);
  if (callbacks) {
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }
}

function emitGameEvent(event: GameEvent) {
  const callbacks = gameEventListeners.get(event);
  if (callbacks) {
    callbacks.forEach(callback => callback());
  }
}

export function insertNode(gamemode: PuzzleMode, layer: number, node: GraphNode) {
  const nodes = GraphNodePaths[gamemode];
  if (nodes.has(layer)) {
    const existingNodes = nodes.get(layer)!;
    nodes.set(layer, [...existingNodes, node]);
  } else {
    nodes.set(layer, [node]);
  }

  emitGameEvent('graph-updated');
}
