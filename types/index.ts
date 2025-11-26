// Graph Types
export interface GraphNode {
  id: string;
  word: string;
  parts: string[];
  layer: number;
  isStart: boolean;
  isGoal: boolean;
  isCompleted: boolean;
  expandsForward?: boolean; // true = extends from END part (toward goal), false = extends from START part
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sharedPart: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

// Puzzle Types
export interface DailyPuzzle {
  id: number;
  puzzleNumber: number;
  date: string;
  startWord: string;
  goalWord: string;
  optimalSteps?: number;
}

// Score Types
export interface Score {
  id: number;
  puzzleDate: string;
  playerId: string;
  wordsUsed: number;
  layers: number;
  finishedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  wordsUsed: number;
  layers: number;
  finishedAt: string;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  playerRank?: number;
  playerPercentile?: number;
  totalPlayers: number;
}

// Validation Types
export interface ValidationResult {
  valid: boolean;
  parts: string[];
  error?: string;
  word?: string;
}

// Game State Types
export interface GameState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  wordsUsed: number;
  maxLayer: number;
  isComplete: boolean;
  isLoading: boolean;
  selectedNodeId: string | null;
  error: string | null;
}

export interface GameStats {
  wordsUsed: number;
  layersExplored: number;
  timeElapsed: number;
  optimalSteps?: number;
}

// Player Types
export interface Player {
  id: string;
  createdAt: string;
}

// Share Types
export interface ShareData {
  puzzleNumber: number;
  wordsUsed: number;
  layers: number;
  path: string[];
  won: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Component Props Types
export interface TopBarProps {
  puzzleNumber: number;
  date: string;
  wordsUsed: number;
  layersExplored: number;
  onGiveUp: () => void;
  isComplete: boolean;
}

export interface InputBarProps {
  onSubmit: (word: string) => Promise<void>;
  isLoading: boolean;
  isDisabled: boolean;
  error: string | null;
  selectedNode: GraphNode | null;
}

export interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  goalWord: string;
  isComplete: boolean;
  winningPath: string[];
}

export interface VictoryModalProps {
  isOpen: boolean;
  stats: GameStats;
  puzzleNumber: number;
  onClose: () => void;
  path: string[];
}

// Compound Word Types
export interface CompoundWord {
  word: string;
  parts: string[];
}

export interface ConnectionResult {
  canConnect: boolean;
  parentNode?: GraphNode;
  sharedPart?: string;
  newPart?: string;
}

export interface NodeConnection {
  node: GraphNode;
  sharedPart: string;
}

export interface MultiConnectionResult {
  canConnect: boolean;
  connections: NodeConnection[];
  minLayer: number;
}

