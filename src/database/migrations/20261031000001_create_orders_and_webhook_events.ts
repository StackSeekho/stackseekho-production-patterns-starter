import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create orders table
  await knex.schema.createTable('orders', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.integer('amount_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('status', 50).notNullable().defaultTo('PENDING');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['status'], 'idx_orders_status');
    table.index(['user_id'], 'idx_orders_user_id');
  });

  // Create webhook_events table with unique event identifier
  await knex.schema.createTable('webhook_events', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_id', 255).notNullable().unique();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 50).notNullable().defaultTo('PROCESSED');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['event_type'], 'idx_webhook_events_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('orders');
}
