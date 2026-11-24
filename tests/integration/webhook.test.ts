import knex, { Knex } from 'knex';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { createKnexConfig } from '../../src/database/connection';
import {
  DynamicMigrationSource,
  DynamicSeedSource,
} from '../../src/database/sources';

describe('Webhook Processing Integration (POST /webhook)', () => {
  let testDb: Knex;

  beforeAll(async () => {
    testDb = knex(createKnexConfig('test'));
    const migrationsDir = path.resolve(__dirname, '../../src/database/migrations');
    const seedsDir = path.resolve(__dirname, '../../src/database/seeds');
    const migrationSource = new DynamicMigrationSource(migrationsDir);
    const seedSource = new DynamicSeedSource(seedsDir);

    // Ensure database schema and seed data are initialized
    await testDb.migrate.latest({ migrationSource });
    await testDb.seed.run({ seedSource });
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
  });

  beforeEach(async () => {
    // Reset seed data before each test for clean isolation
    const seedsDir = path.resolve(__dirname, '../../src/database/seeds');
    const seedSource = new DynamicSeedSource(seedsDir);
    await testDb.seed.run({ seedSource });
  });

  describe('First delivery and state transition', () => {
    it('should insert webhook event and transition order from PENDING to PAID', async () => {
      const orderId = 'b0000000-0000-0000-0000-000000000001';
      const eventId = 'evt_payment_success_001';

      // Verify initial state is PENDING
      const orderBefore = await testDb('orders').where({ id: orderId }).first();
      expect(orderBefore.status).toBe('PENDING');

      const response = await request(app)
        .post('/webhook')
        .send({
          eventId,
          eventType: 'payment.succeeded',
          orderId,
          amount: 4999,
          currency: 'USD',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'processed',
        message: 'Webhook processed successfully',
        eventId,
        orderId,
      });

      // Verify order transitioned to PAID in the database
      const orderAfter = await testDb('orders').where({ id: orderId }).first();
      expect(orderAfter.status).toBe('PAID');
      expect(new Date(orderAfter.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(orderBefore.updated_at).getTime()
      );

      // Verify event recorded in webhook_events
      const eventRecord = await testDb('webhook_events')
        .where({ event_id: eventId })
        .first();
      expect(eventRecord).toBeDefined();
      expect(eventRecord.event_type).toBe('payment.succeeded');
      expect(eventRecord.status).toBe('PROCESSED');
    });
  });

  describe('Duplicate delivery (Idempotency)', () => {
    it('should return processed on first delivery and duplicate_ignored on second delivery', async () => {
      const orderId = 'b0000000-0000-0000-0000-000000000002';
      const eventId = 'evt_duplicate_test_002';
      const payload = {
        eventId,
        eventType: 'payment.succeeded',
        orderId,
      };

      // First delivery
      const firstResponse = await request(app).post('/webhook').send(payload);
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toEqual({
        status: 'processed',
        message: 'Webhook processed successfully',
        eventId,
        orderId,
      });

      // Second delivery (duplicate event)
      const secondResponse = await request(app).post('/webhook').send(payload);
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body).toEqual({
        status: 'duplicate_ignored',
        message: 'Event already processed',
        eventId,
        orderId,
      });

      // Verify only ONE event record was stored
      const eventCount = await testDb('webhook_events')
        .where({ event_id: eventId })
        .count<{ count: string }>('id as count')
        .first();
      expect(Number(eventCount?.count)).toBe(1);

      // Verify order remains PAID
      const order = await testDb('orders').where({ id: orderId }).first();
      expect(order.status).toBe('PAID');
    });
  });

  describe('Transaction rollback', () => {
    it('should roll back completely if order does not exist, leaving no event record', async () => {
      const nonexistentOrderId = 'c0000000-0000-0000-0000-000000000099';
      const eventId = 'evt_nonexistent_order_rollback';

      const response = await request(app)
        .post('/webhook')
        .send({
          eventId,
          eventType: 'payment.succeeded',
          orderId: nonexistentOrderId,
        });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('does not exist');

      // Verify the event was ROLLED BACK and NOT stored in webhook_events
      const event = await testDb('webhook_events')
        .where({ event_id: eventId })
        .first();
      expect(event).toBeUndefined();
    });
  });

  describe('Invalid state transitions', () => {
    it('should reject payment and roll back if order is in CANCELLED status', async () => {
      const cancelledOrderId = 'b0000000-0000-0000-0000-000000000003';
      const eventId = 'evt_cancelled_order_transition';

      const response = await request(app)
        .post('/webhook')
        .send({
          eventId,
          eventType: 'payment.succeeded',
          orderId: cancelledOrderId,
        });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('CANCELLED');

      // Verify order remains CANCELLED
      const order = await testDb('orders').where({ id: cancelledOrderId }).first();
      expect(order.status).toBe('CANCELLED');

      // Verify transaction rolled back (no event recorded)
      const event = await testDb('webhook_events')
        .where({ event_id: eventId })
        .first();
      expect(event).toBeUndefined();
    });

    it('should reject payment and roll back if order is already PAID with a DIFFERENT eventId', async () => {
      const paidOrderId = 'b0000000-0000-0000-0000-000000000004';
      const newEventId = 'evt_different_event_for_already_paid';

      const response = await request(app)
        .post('/webhook')
        .send({
          eventId: newEventId,
          eventType: 'payment.succeeded',
          orderId: paidOrderId,
        });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('PAID');

      // Verify event was rolled back
      const event = await testDb('webhook_events')
        .where({ event_id: newEventId })
        .first();
      expect(event).toBeUndefined();
    });
  });

  describe('Concurrent duplicate requests', () => {
    it('should safely handle simultaneous concurrent requests: exactly one processed and others duplicate_ignored', async () => {
      const orderId = 'b0000000-0000-0000-0000-000000000001';
      const concurrentEventId = 'evt_concurrent_race_condition_test';
      const payload = {
        eventId: concurrentEventId,
        eventType: 'payment.succeeded',
        orderId,
      };

      // Dispatch 5 identical requests simultaneously
      const concurrencyCount = 5;
      const promises = Array.from({ length: concurrencyCount }, () =>
        request(app).post('/webhook').send(payload)
      );

      const responses = await Promise.all(promises);

      // All responses must be HTTP 200
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // Exactly ONE must be 'processed'
      const processedResponses = responses.filter(
        (r) => r.body.status === 'processed'
      );
      expect(processedResponses.length).toBe(1);

      // The remaining must be 'duplicate_ignored'
      const duplicateResponses = responses.filter(
        (r) => r.body.status === 'duplicate_ignored'
      );
      expect(duplicateResponses.length).toBe(concurrencyCount - 1);

      // Database integrity: exactly one event record exists
      const eventCount = await testDb('webhook_events')
        .where({ event_id: concurrentEventId })
        .count<{ count: string }>('id as count')
        .first();
      expect(Number(eventCount?.count)).toBe(1);

      // Order must be PAID
      const finalOrder = await testDb('orders').where({ id: orderId }).first();
      expect(finalOrder.status).toBe('PAID');
    });
  });

  describe('Payload validation', () => {
    it('should reject requests with missing eventId', async () => {
      const res = await request(app).post('/webhook').send({
        eventType: 'payment.succeeded',
        orderId: 'b0000000-0000-0000-0000-000000000001',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(res.body.error.details)).toContain('eventId');
    });

    it('should reject requests with invalid orderId format', async () => {
      const res = await request(app).post('/webhook').send({
        eventId: 'evt_invalid_order_id',
        eventType: 'payment.succeeded',
        orderId: 'not-a-uuid',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(res.body.error.details)).toContain('orderId');
    });
  });
});
