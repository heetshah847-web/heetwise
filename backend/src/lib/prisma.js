import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { PrismaClient } = pkg;
const { Pool } = pg;

// Reuse a single Pool + PrismaClient across hot reloads (dev) and across
// invocations that share a warm serverless container. Without this guard a new
// pool is created every time this module is re-evaluated, which can exhaust the
// database's connection limit under load.
const globalForPrisma = globalThis;

const pool =
  globalForPrisma.__heetwisePool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.__heetwisePrisma ?? new PrismaClient({ adapter });

if (!globalForPrisma.__heetwisePrisma) {
  globalForPrisma.__heetwisePool = pool;
  globalForPrisma.__heetwisePrisma = prisma;
}