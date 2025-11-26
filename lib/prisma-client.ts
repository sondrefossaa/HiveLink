import prisma from './prisma'

let prismaConnectionPromise: Promise<void> | null = null

async function ensureConnection(): Promise<void> {
  if (!prismaConnectionPromise) {
    prismaConnectionPromise = prisma.$connect().catch(error => {
      prismaConnectionPromise = null
      throw error
    })
  }

  await prismaConnectionPromise
}

export async function getPrismaClient(): Promise<typeof prisma> {
  await ensureConnection()
  return prisma
}
