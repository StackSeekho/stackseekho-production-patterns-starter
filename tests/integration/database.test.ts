import knex, { Knex } from 'knex';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKnexConfig } from '../../src/database/connection';
import {
  DynamicMigrationSource,
  DynamicSeedSource,
} from '../../src/database/sources';

describe('Database Migrations & Seeds Integration', () => {
  let testDb: Knex;
  const migrationsDir = path.resolve(__dirname, '../../src/database/migrations');
  const seedsDir = path.resolve(__dirname, '../../src/database/seeds');
  const migrationSource = new DynamicMigrationSource(migrationsDir);
  const seedSource = new DynamicSeedSource(seedsDir);

  beforeAll(async () => {
    const config = createKnexConfig('test');
    testDb = knex(config);
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
  });

  it('should run all migrations, seeds, query seeded records, and rollback cleanly', async () => {
    // 1. Rollback all previous migrations to start fresh
    await testDb.migrate.rollback({ migrationSource }, true);

    expect(await testDb.schema.hasTable('users')).toBe(false);
    expect(await testDb.schema.hasTable('orders')).toBe(false);
    expect(await testDb.schema.hasTable('webhook_events')).toBe(false);

    // 2. Run all migrations latest
    const [batchNo, log] = await testDb.migrate.latest({ migrationSource });
    expect(batchNo).toBeGreaterThanOrEqual(1);
    expect(log.length).toBeGreaterThanOrEqual(2);

    expect(await testDb.schema.hasTable('users')).toBe(true);
    expect(await testDb.schema.hasTable('orders')).toBe(true);
    expect(await testDb.schema.hasTable('webhook_events')).toBe(true);

    // Verify orders columns
    expect(await testDb.schema.hasColumn('orders', 'amount_cents')).toBe(true);
    expect(await testDb.schema.hasColumn('orders', 'currency')).toBe(true);
    expect(await testDb.schema.hasColumn('orders', 'status')).toBe(true);

    // Verify webhook_events columns
    expect(await testDb.schema.hasColumn('webhook_events', 'event_id')).toBe(true);
    expect(await testDb.schema.hasColumn('webhook_events', 'event_type')).toBe(true);
    expect(await testDb.schema.hasColumn('webhook_events', 'payload')).toBe(true);

    // 3. Run seeds
    await testDb.seed.run({ seedSource });

    // 4. Query seeded records
    const users = await testDb('users').select('*').orderBy('email', 'asc');
    expect(users.length).toBe(3);

    const orders = await testDb('orders').select('*').orderBy('amount_cents', 'asc');
    expect(orders.length).toBe(4);

    const pendingOrder = orders.find((o) => o.status === 'PENDING');
    expect(pendingOrder).toBeDefined();

    // 5. Test rollback all
    await testDb.migrate.rollback({ migrationSource }, true);
    expect(await testDb.schema.hasTable('webhook_events')).toBe(false);
    expect(await testDb.schema.hasTable('orders')).toBe(false);
    expect(await testDb.schema.hasTable('users')).toBe(false);

    // 6. Restore migrations and seeds for subsequent tests
    await testDb.migrate.latest({ migrationSource });
    await testDb.seed.run({ seedSource });
  });
});
