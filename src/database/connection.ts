import knex, { Knex } from 'knex';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface DatabaseHealthResult {
  ready: boolean;
  status: 'connected' | 'disconnected';
  latencyMs?: number;
  error?: string;
}

export function createKnexConfig(
  environment: string = env.NODE_ENV
): Knex.Config {
  const isTest = environment === 'test';

  return {
    client: 'pg',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: isTest
        ? process.env.DB_NAME || 'stackseekho_test'
        : env.DB_NAME,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: isTest ? 1 : env.DB_POOL_MIN,
      max: isTest ? 5 : env.DB_POOL_MAX,
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
    },
    migrations: {
      directory:
        env.NODE_ENV === 'production'
          ? './dist/database/migrations'
          : './src/database/migrations',
      extension: env.NODE_ENV === 'production' ? 'js' : 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory:
        env.NODE_ENV === 'production'
          ? './dist/database/seeds'
          : './src/database/seeds',
      extension: env.NODE_ENV === 'production' ? 'js' : 'ts',
    },
  };
}

export const db: Knex = knex(createKnexConfig());

export async function checkDatabaseReadiness(
  client: Knex = db,
  timeoutMs = 3000
): Promise<DatabaseHealthResult> {
  const startTime = Date.now();
  try {
    await client.raw('SELECT 1 AS ready').timeout(timeoutMs, { cancel: true });
    const latencyMs = Date.now() - startTime;

    return {
      ready: true,
      status: 'connected',
      latencyMs,
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown database connection error';

    logger.warn({ err }, `Database readiness check failed: ${errorMessage}`);

    return {
      ready: false,
      status: 'disconnected',
      error: 'Database connection failed or query timed out',
    };
  }
}

export async function closeDatabaseConnection(
  client: Knex = db
): Promise<void> {
  try {
    await client.destroy();
    logger.info('Database connection pool closed successfully');
  } catch (err: unknown) {
    logger.error({ err }, 'Error closing database connection pool');
  }
}
