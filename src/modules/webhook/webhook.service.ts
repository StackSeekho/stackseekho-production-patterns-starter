import type { Knex } from 'knex';
import { db } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { ValidatedWebhookPayload } from './webhook.validation';
import { OrderRecord, WebhookSuccessResponse } from './webhook.types';

export const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as Record<string, unknown>;
  return (
    anyErr.code === PG_UNIQUE_VIOLATION ||
    (typeof anyErr.message === 'string' &&
      anyErr.message.includes(PG_UNIQUE_VIOLATION))
  );
}

export class WebhookService {
  public async processWebhook(
    payload: ValidatedWebhookPayload,
    client: Knex = db
  ): Promise<WebhookSuccessResponse> {
    try {
      return await client.transaction(async (trx) => {
        // 1. Insert webhook event record.
        // A unique constraint on event_id ensures atomic deduplication.
        // If event_id already exists, PostgreSQL throws SQLSTATE 23505.
        await trx('webhook_events').insert({
          event_id: payload.eventId,
          event_type: payload.eventType,
          payload: JSON.stringify(payload),
          status: 'PROCESSED',
        });

        // 2. Fetch the target order with row-level lock (FOR UPDATE)
        // This serializes concurrent operations targeting the same order.
        const order = (await trx('orders')
          .where({ id: payload.orderId })
          .forUpdate()
          .first()) as OrderRecord | undefined;

        // 3. Safe behavior for nonexistent orders:
        // Abort and roll back the transaction so the event is not falsely committed.
        if (!order) {
          throw new NotFoundError(
            `Order with ID ${payload.orderId} does not exist`
          );
        }

        // 4. Safe behavior for invalid state transitions:
        // Only orders currently in PENDING state can transition to PAID.
        if (order.status !== 'PENDING') {
          throw new ConflictError(
            `Cannot process payment for order ${payload.orderId}: current state is '${order.status}' (expected 'PENDING')`
          );
        }

        // 5. Execute state transition within the same transaction
        await trx('orders')
          .where({ id: payload.orderId })
          .update({
            status: 'PAID',
            updated_at: trx.fn.now(),
          });

        logger.info(
          {
            eventId: payload.eventId,
            orderId: payload.orderId,
            previousStatus: order.status,
            newStatus: 'PAID',
          },
          'Webhook processed successfully and order marked PAID'
        );

        return {
          status: 'processed',
          message: 'Webhook processed successfully',
          eventId: payload.eventId,
          orderId: payload.orderId,
        };
      });
    } catch (err: unknown) {
      // Specifically handle PostgreSQL SQLSTATE 23505 (unique_violation)
      if (isUniqueViolationError(err)) {
        logger.info(
          {
            eventId: payload.eventId,
            orderId: payload.orderId,
            sqlState: PG_UNIQUE_VIOLATION,
          },
          'Duplicate webhook event detected via unique constraint (SQLSTATE 23505); returning duplicate_ignored'
        );

        return {
          status: 'duplicate_ignored',
          message: 'Event already processed',
          eventId: payload.eventId,
          orderId: payload.orderId,
        };
      }

      // Propagate all other errors (NotFoundError, ConflictError, connection drops)
      // to the centralized error handler
      throw err;
    }
  }
}

export const webhookService = new WebhookService();
