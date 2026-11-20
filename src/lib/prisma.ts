import { PrismaClient } from '@prisma/client';
import { PrismaClient as PostgresClient } from '../../node_modules/.prisma/client-pg';
const globalDb = globalThis as typeof globalThis & { biCaptchaPrisma?: PrismaClient };
export const prisma = globalDb.biCaptchaPrisma ??= (/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? '') ? new PostgresClient() as unknown as PrismaClient : new PrismaClient());
