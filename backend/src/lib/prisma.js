import pkg from '@prisma/client';
const { PrismaClient } = pkg;

// Single shared Prisma client instance for the whole app.
export const prisma = new PrismaClient();