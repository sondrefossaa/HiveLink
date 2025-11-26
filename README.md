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
- npm or yarn
- A Neon Postgres database (free tier works great!)

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

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your Neon database credentials:
```env
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
DIRECT_URL="postgresql://user:password@host/database?sslmode=require"
```

5. Initialize the database:
```bash
npx prisma db push
npm run db:seed
```

6. (Optional) Import compound words dataset:
```bash
npm run import:words
```
This downloads a public word list, identifies compound words, and imports them into your database for faster validation. The dataset is not committed to Git.

7. Run the development server:
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000) in your browser!

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Graph Visualization**: react-force-graph-2d
- **Particles**: tsparticles
- **Database**: Neon Postgres + Prisma ORM
- **Deployment**: Vercel

## 📁 Project Structure

```
hivelink/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx             # Main game page
│   ├── globals.css          # Global styles
│   └── api/                 # API routes
│       ├── puzzle/today/    # Get today's puzzle
│       ├── validate/        # Validate compound words
│       ├── score/           # Submit scores
│       └── leaderboard/     # Get leaderboard
├── components/
│   ├── Game.tsx             # Main game orchestrator
│   ├── Graph.tsx            # Force-directed graph
│   ├── InputBar.tsx         # Word input
│   ├── TopBar.tsx           # Stats and info
│   ├── VictoryModal.tsx     # Win screen
│   └── ParticleBackground.tsx
├── hooks/
│   ├── useGameState.ts      # Game state management
│   └── usePuzzle.ts         # Puzzle fetching
├── lib/
│   ├── prisma.ts            # Database client
│   ├── validation.ts        # Word validation
│   ├── compound-utils.ts    # Word parsing
│   └── player-id.ts         # Player management
├── scripts/
│   └── import-compound-words.ts  # Import compound words dataset
├── types/
│   └── index.ts             # TypeScript types
└── prisma/
    ├── schema.prisma        # Database schema
    └── seed.ts              # Seed data
```

## 🚢 Deployment on Vercel

### 1. Connect Your Repository

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com) and import your repository
3. Vercel will auto-detect Next.js

### 2. Set Up Neon Database

1. Create a free database at [Neon](https://neon.tech)
2. Copy the connection string

### 3. Configure Environment Variables

In your Vercel project settings, add:

```
DATABASE_URL=your_neon_connection_string
DIRECT_URL=your_neon_direct_connection_string
```

### 4. Deploy

Vercel will automatically:
- Run `prisma generate` during build
- Deploy your app
- Set up serverless functions for API routes

### 5. Initialize Database

Run the seed script after first deploy:
```bash
npx prisma db push
npm run db:seed
```

## 📝 Adding New Puzzles

Add puzzles to the `prisma/seed.ts` file:

```typescript
const puzzles = [
  {
    date: new Date('2024-01-15'),
    startWord: 'butterfly',
    goalWord: 'moonshine',
    optimalSteps: 6,
  },
  // Add more puzzles...
]
```

Then run: `npm run db:seed`

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
1. **Local database** (fast): Compound words stored in Postgres via `npm run import:words`
2. **Datamuse API** (fallback): External API for words not in the database

To import a comprehensive compound words dataset, run `npm run import:words`. This downloads a public word list, identifies compound words, and bulk-imports them into your Neon database.

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

