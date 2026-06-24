import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance for the whole app.
// Prisma parameterizes every query, so there is no string concatenation.
export const prisma = new PrismaClient();
