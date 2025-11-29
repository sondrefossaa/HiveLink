const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  
  try {
    // Delete puzzles from Nov 28, 2025 onwards so they regenerate with easy words
    const deleted = await p.dailyPuzzle.deleteMany({
      where: {
        date: { gte: new Date('2025-11-28') }
      }
    });
    
    console.log(`Deleted ${deleted.count} puzzles from Nov 28 onwards`);
    
    // Show remaining puzzles
    const remaining = await p.dailyPuzzle.findMany({
      orderBy: { date: 'desc' },
      take: 5,
    });
    
    console.log('\nRemaining puzzles:');
    for (const puzzle of remaining) {
      console.log(`  ${puzzle.date.toISOString().split('T')[0]}: ${puzzle.startWord} -> ${puzzle.goalWord}`);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch(console.error);
