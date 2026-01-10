import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://admin:123456@127.0.0.1:5432/insight_os',
  },
  migrations: {
    table: 'migrations',
    schema: 'public',
  },
});
