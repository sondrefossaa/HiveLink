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

No database or remote services required — the app runs fully client-side with bundled JSON data and works offline as a PWA.

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
│   ├── dictionary.ts       # Bundled dictionary access
│   ├── daily-puzzle.ts     # Daily puzzle resolution (bundled + deterministic fallback)
│   ├── puzzle-generator.ts # Seeded puzzle generation
│   ├── validation.ts       # Word validation (bundled dictionary + Datamuse fallback)
│   ├── hints.ts            # Client-side hint generation
│   ├── compound-utils.ts   # Word parsing
│   └── player-id.ts        # Player identity, scores & stats (localStorage)
├── data/
│   ├── compound-words.json # Compound word dictionary
│   └── daily-puzzles.json  # Pre-generated daily puzzles
├── scripts/
│   ├── import-compound-words.ts  # Grow the dictionary (writes data/compound-words.json)
│   ├── regenerate-daily.ts       # Pre-generate daily puzzles (writes data/daily-puzzles.json)
│   └── generate-icons.ts         # Regenerate PWA icons
└── types/
    └── index.ts            # TypeScript types
```

## 🗃 Data Model

All game data lives in the repo:

- **`data/compound-words.json`** — the compound word dictionary. Bundled with the app and used for validation, hints, and puzzle generation.
- **`data/daily-puzzles.json`** — pre-generated daily puzzles (date → start/goal/optimal steps). Pins each day's puzzle; dates not present fall back to deterministic date-seeded generation in the browser.
- **`localStorage`** — per-device player identity, saved game state, solved-puzzle history, streaks, and stats.

## 🧰 Data Scripts

```bash
npm run data:words            # Fetch public word lists, extract compound words, merge into the dictionary
npm run data:words -- --max 5000    # Cap how many new words are added
npm run data:puzzles          # Pre-generate daily puzzles (today → +370 days)
npm run data:puzzles -- --force     # Regenerate existing dates too
npm run data:puzzles -- --start 2026-09-01 --days 14
npm run icons                 # Regenerate PWA PNG icons
```

After changing the dictionary, run `npm run data:puzzles -- --force` to refresh future puzzles, then commit the JSON files.

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
The game validates compound words using:
1. **Bundled dictionary** (instant, offline): words in `data/compound-words.json`
2. **Datamuse API** (fallback): external API for words not in the dictionary (requires network)

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
