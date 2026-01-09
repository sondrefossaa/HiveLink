import { GraphNode } from "@/types"
import { GameState, insertNode } from "./gameState"
import { getCompoundMap } from "@/utils/data"
import { createGraphNode } from "./graphHelpers";

const compoundMap = getCompoundMap();
export function handleWordSubmit(word: string) {
  const currentWords = GameState.paths[GameState.gameMode];
  console.log(currentWords);
  if (!compoundMap.has(word)) {
    console.log("Word dosent exist")
    return;
  }
  const allNodes = Array.from(currentWords.values()).flat();

  if (allNodes.some(node => node.word === word)) {
    console.log("Word already used");
    return;
  }


  if (compoundMap.has(word)) {
    const { parts } = compoundMap.get(word)!;
    for (let key of currentWords.keys()) {
      const nodes = currentWords.get(key);
      if (!nodes) {
        console.log("no nodes")
      }
      nodes.forEach(node => {
        console.log(node.parts);
        console.log(parts)
        if (node.parts.right === parts.left) {
          console.log("yo letso")
          const newNode = createGraphNode(word, parts)
          insertNode("daily", key + 1, newNode)
        }
      })
    }
  }
}
