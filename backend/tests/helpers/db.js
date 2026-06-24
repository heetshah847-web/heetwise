import { prisma } from '../../src/lib/prisma.js';

// Wipe all data between tests. Order is handled by CASCADE.
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "splits","expenses","group_members","groups","users" RESTART IDENTITY CASCADE'
  );
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
