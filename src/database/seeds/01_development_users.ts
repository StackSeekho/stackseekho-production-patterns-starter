import type { Knex } from 'knex';
import { env } from '../../config/env';

export async function seed(knex: Knex): Promise<void> {
  // Safety guard: NEVER allow seeding in production
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: Seed script execution is blocked in production environment!'
    );
  }

  // Execute in transaction to ensure all-or-nothing execution
  await knex.transaction(async (trx) => {
    // Clean existing seed records
    await trx('users').del();

    // Insert deterministic test/development users
    await trx('users').insert([
      {
        id: 'a0000000-0000-0000-0000-000000000001',
        email: 'admin@stackseekho.local',
        name: 'StackSeekho Admin',
        role: 'admin',
        is_active: true,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000002',
        email: 'developer@stackseekho.local',
        name: 'Backend Engineer',
        role: 'user',
        is_active: true,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000003',
        email: 'inactive@stackseekho.local',
        name: 'Inactive Tester',
        role: 'user',
        is_active: false,
      },
    ]);
  });
}
