import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  try {
    const adapter = new PrismaPg({ connectionString: url });
    return (
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      })
    );
  } catch (err) {
    console.warn('[Prisma] Database connection initialization failed, falling back to local storage:', err);
    return null;
  }
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma;
}

export const isCloudDbEnabled = Boolean(process.env.DATABASE_URL && prisma);
