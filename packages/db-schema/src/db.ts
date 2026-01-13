import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Connection string
const connectionString =
  process.env.DATABASE_URL || 'postgresql://admin:123456@127.0.0.1:5432/insight_os';

// Create postgres client (singleton)
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export client for advanced use cases
export const pgClient = client;

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}
