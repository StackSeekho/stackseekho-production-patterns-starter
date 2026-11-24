import { z } from 'zod';

export const webhookPayloadSchema = z.object({
  eventId: z
    .string({ required_error: 'eventId is required' })
    .trim()
    .min(1, 'eventId cannot be empty'),
  eventType: z
    .string({ required_error: 'eventType is required' })
    .trim()
    .min(1, 'eventType cannot be empty'),
  orderId: z
    .string({ required_error: 'orderId is required' })
    .uuid('orderId must be a valid UUID format'),
  amount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedWebhookPayload = z.infer<typeof webhookPayloadSchema>;
