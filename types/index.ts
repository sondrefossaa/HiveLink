// Graph Types
export interface GraphNode {
  id: string;
  word: string;
  parts: string[];
  layer: number;
  isStart: boolean;
  isGoal: boolean;
  isCompleted: boolean;
  parentId?: string;
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

export interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  goalWord: string;
  isComplete: boolean;
  winningPath: string[];
  graphSpacing: number;
  layoutVersion?: number;
}

// Share Types
export type ShareStatus = 'playing' | 'won' | 'gave-up';

// Puzzle Types
export type PuzzleMode = 'daily' | 'practice';

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

export interface DailyPuzzle {
  id: number;
  puzzleNumber: number;
  date: string;
  startWord: string;
  goalWord: string;
  optimalSteps: number;
  isDaily: true;
  mode: 'daily';
  startParts?: string[];
  goalParts?: string[];
  wordParts?: Record<string, string[]>;
}

export interface PracticePuzzle {
  id: string;
  startWord: string;
  goalWord: string;
  optimalSteps: number;
  difficulty: PuzzleDifficulty;
  seed: string;
  isDaily: false;
  mode: 'practice';
  solutionPath?: string[];
  puzzleNumber?: number;
  date?: string;
  startParts?: string[];
  goalParts?: string[];
  wordParts?: Record<string, string[]>;
}

export type PuzzleInstance = DailyPuzzle | PracticePuzzle;

// Score Types
export interface LocalScoreInfo {
  puzzleDate: string
  wordsUsed: number
  layers: number
  pathsFound: number
  finishedAt: string
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
  optimalSteps?: number;
}

// Player Types
export interface Player {
  id: string;
  name?: string;
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

// Hint Types
export interface HintResult {
  suggestedWord: string;
  sharedPart: string;
  parentWord: string;
  confidence: 'high' | 'medium' | 'low';
}

