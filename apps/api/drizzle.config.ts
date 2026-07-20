import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads DATABASE_URL directly for generate/push. Migrations are applied at
// runtime via src/db/migrate.ts (the deduped Lynkbot runner pattern), not by `push`.
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/recall',
  },
  strict: true,
  verbose: true,
});
