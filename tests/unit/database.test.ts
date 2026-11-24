import knex, { Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import {
  checkDatabaseReadiness,
  createKnexConfig,
} from '../../src/database/connection';
import { seed } from '../../src/database/seeds/01_development_users';

describe('Database Configuration & Connection (Unit)', () => {
  it('createKnexConfig should configure client and pool using environment variables', () => {
    const config = createKnexConfig('development');

    expect(config.client).toBe('pg');
    expect(config.connection).toBeDefined();
    expect(config.pool).toBeDefined();
    expect((config.pool as { min?: number }).min).toBeDefined();
    expect((config.pool as { max?: number }).max).toBeDefined();
    expect(config.migrations?.tableName).toBe('knex_migrations');
  });

  it('checkDatabaseReadiness should report connected and latency when database is reachable', async () => {
    const testConfig = createKnexConfig('test');
    const testDb = knex(testConfig);

    try {
      const result = await checkDatabaseReadiness(testDb);

      expect(result.ready).toBe(true);
      expect(result.status).toBe('connected');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    } finally {
      await testDb.destroy();
    }
  });

  it('checkDatabaseReadiness should handle unavailable database without throwing or leaking credentials', async () => {
    // Create an unreachable client pointing to an unused port with 500ms acquire timeout
    const brokenDb = knex({
      client: 'pg',
      connection: {
        host: '127.0.0.1',
        port: 59999,
        user: 'invalid_user',
        password: 'secret_password_must_not_leak',
        database: 'non_existent_db',
      },
      pool: {
        min: 0,
        max: 1,
        acquireTimeoutMillis: 500,
      },
    });

    try {
      const result = await checkDatabaseReadiness(brokenDb, 500);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('disconnected');
      expect(result.error).toBeDefined();
      // Ensure raw secret is NEVER present in error output
      expect(result.error).not.toContain('secret_password_must_not_leak');
    } finally {
      await brokenDb.destroy();
    }
  });

  it('seed script should throw when NODE_ENV is production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Mock knex client
    const mockKnex = {} as Knex;

    try {
      await expect(seed(mockKnex)).rejects.toThrowError(
        /CRITICAL: Seed script execution is blocked in production environment!/
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
