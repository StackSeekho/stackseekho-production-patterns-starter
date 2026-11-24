import type { Knex } from 'knex';
import { env } from '../../config/env';

export async function seed(knex: Knex): Promise<void> {
  // Safety guard: NEVER allow seeding in production
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: Seed script execution is blocked in production environment!'
    );
  }

  await knex.transaction(async (trx) => {
    // Clean existing records in correct dependency order if tables exist
    if (await trx.schema.hasTable('webhook_events')) {
      await trx('webhook_events').del();
    }
    if (await trx.schema.hasTable('orders')) {
      await trx('orders').del();
    }

    if (await trx.schema.hasTable('orders')) {
      // Insert deterministic test/development orders
      await trx('orders').insert([
        {
          id: 'b0000000-0000-0000-0000-000000000001',
          user_id: 'a0000000-0000-0000-0000-000000000002',
          amount_cents: 4999,
          currency: 'USD',
          status: 'PENDING',
        },
        {
          id: 'b0000000-0000-0000-0000-000000000002',
          user_id: 'a0000000-0000-0000-0000-000000000002',
          amount_cents: 9999,
          currency: 'USD',
          status: 'PENDING',
        },
        {
          id: 'b0000000-0000-0000-0000-000000000003',
          user_id: 'a0000000-0000-0000-0000-000000000002',
          amount_cents: 1999,
          currency: 'USD',
          status: 'CANCELLED',
        },
        {
          id: 'b0000000-0000-0000-0000-000000000004',
          user_id: 'a0000000-0000-0000-0000-000000000002',
          amount_cents: 2999,
          currency: 'USD',
          status: 'PAID',
        },
      ]);
    }
  });
}
