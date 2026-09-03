# HiveLink 🐝

A daily compound word puzzle game. Chain compound words from START to GOAL!

![HiveLink Screenshot](https://via.placeholder.com/800x400/0D0D0D/F4B400?text=HiveLink)

## 🎮 How to Play

1. You're given a **START** compound word and a **GOAL** compound word
2. Enter compound words that share exactly **one part** with existing words
3. Build a chain of words until you reach the goal
4. Fewer words = better score!

### Example Chain
```
butterfly → flytrap → trapdoor → doorbell
```
- butter**fly** → **fly**trap (shared: fly)
- fly**trap** → **trap**door (shared: trap)
- trap**door** → **door**bell (shared: door)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm

No database or remote services are required. The compact dictionary is loaded as a cached static artifact when the game needs it.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/hivelink.git
cd hivelink
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser!

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Graph Visualization**: react-force-graph-2d
- **Particles**: tsparticles
- **Data**: Bundled JSON files (no database)
- **PWA**: Installable, offline-capable via service worker

## 📁 Project Structure

```
hivelink/
├── app/
│   ├── layout.tsx          # Root layout + PWA metadata
│   ├── page.tsx            # Main game page
│   ├── manifest.ts         # PWA manifest
│   └── api/og/             # OG share image (only server route)
├── components/
│   ├── Game.tsx            # Main game orchestrator
│   ├── Graph.tsx           # Force-directed graph
│   ├── InputBar.tsx        # Word input
│   ├── HintButton.tsx      # Free client-side hints
│   ├── LeaderboardModal.tsx# Personal stats & history
│   ├── TopBar.tsx          # Stats and info
│   ├── VictoryModal.tsx    # Win screen
│   └── ParticleBackground.tsx
├── hooks/
│   ├── useGameState.ts     # Game state management
│   └── usePuzzle.ts        # Puzzle resolution (local)
├── lib/
│   ├── dictionary.ts       # Deferred compact dictionary access
│   ├── daily-puzzle.ts     # Daily puzzle resolution (bundled + deterministic fallback)
│   ├── puzzle-generator.ts # Seeded puzzle generation
│   ├── validation.ts       # Exact canonical word validation
│   ├── hints.ts            # Client-side hint generation
│   ├── compound-utils.ts   # Word parsing
│   └── player-id.ts        # Player identity, scores & stats (localStorage)
├── data/
│   ├── compound-graph-stats.json # Derived tier and connectivity report
│   └── daily-puzzles.json        # Pre-generated daily puzzles
├── public/dictionary/
│   └── compound-words.json # Compact ID-based runtime graph
├── scripts/
│   ├── build-norwegian-compounds.ts # Import rich lexical source data
│   ├── derive-compound-runtime.ts   # Derive tiers and compact runtime graph
│   ├── regenerate-daily.ts       # Pre-generate daily puzzles (writes data/daily-puzzles.json)
│   └── generate-icons.ts         # Regenerate PWA icons
└── types/
    └── index.ts            # TypeScript types
```

## 🗃 Data Model

All game data lives in the repo:

- **`public/dictionary/compound-words.json`** — the deferred, compact runtime graph used for exact validation, hints, and generation.
- **`data/compound-build.json`** — ignored rich build artifact with analyses, provenance, and independent NB, NoWaC lemma, and Eiesland counts.
- **`data/compound-graph-stats.json`** — derived frequency-policy thresholds, source coverage, tier sizes, and connectivity.
- **`data/daily-puzzles.json`** — pre-generated daily puzzles with tier-based par and optional full-graph optimum.
- **`localStorage`** — per-device player identity, saved game state, solved-puzzle history, streaks, and stats.

## 🧰 Data Scripts

```bash
npm run data:words            # Download public inputs and rebuild rich + runtime artifacts
npm run data:norwegian       # Build from Ordbank, NST, Eiesland, NB 1-gram, and the NoWaC lemma list
npm run data:norwegian:nowac # Alias for the same frequency-aware build
npm run data:derive          # Recompute tiers/runtime from retained rich data only
npm run data:verify          # Verify sources, analyses, tiers, and pinned paths
npm run data:puzzles          # Pre-generate daily puzzles (today → +370 days)
npm run data:puzzles -- --force     # Regenerate existing dates too
npm run data:puzzles -- --start 2026-09-01 --days 14
npm run icons                 # Regenerate PWA PNG icons
```

After changing the dictionary policy, run `npm run data:derive`, `npm run data:puzzles -- --force`, and `npm run data:verify`.

## 🚢 Deployment

The app deploys anywhere Next.js runs (e.g. Vercel). There are no environment variables to configure — the only server component is the `/api/og` share-image route. Everything else is static and runs in the browser, so the game works fully offline once installed.

## 🎨 Customization

### Colors
Edit `tailwind.config.ts` to change the hive theme:

```typescript
colors: {
  hive: {
    yellow: '#F4B400',  // Primary accent
    gold: '#FFB800',    // Hover state
    amber: '#E6A100',   // Active state
    dark: '#0D0D0D',    // Background
    charcoal: '#1A1A1A', // Cards
    graphite: '#2A2A2A', // Borders
  },
}
```

### Word Validation
The game validates words only against exact Ordbank/NST analyses in the full canonical graph. Generation and hints require both absolute compound familiarity and branching-normalized continuation salience. Intended paths are limited by their weakest edge; endpoint noun frequency is only a minimum quality gate. Every structurally validated compound remains playable regardless of generation tier.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with 🍯 by [Your Name]
