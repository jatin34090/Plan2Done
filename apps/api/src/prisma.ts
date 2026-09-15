import { Prisma, PrismaClient } from "@prisma/client";

const base = new PrismaClient();

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function isTransient(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(error.code))
  );
}

/**
 * Neon serverless computes auto-suspend after inactivity, so a query can fail with
 * a connection error while the pooler wakes the compute. Retry transient failures a
 * couple of times before giving up, which makes cold starts invisible to the client.
 */
export const prisma = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await query(args);
        } catch (error) {
          if (!isTransient(error)) throw error;
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 800));
        }
      }
      throw lastError;
    }
  }
});

export async function warmDatabase(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await base.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      const wait = Math.min(attempt * 1000, 4000);
      console.warn(`Database not ready (attempt ${attempt}/${retries}), retrying in ${wait}ms…`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (attempt === retries) console.error("Database warm-up failed:", error);
    }
  }
}
