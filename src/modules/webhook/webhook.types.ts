export interface WebhookPayload {
  eventId: string;
  eventType: string;
  orderId: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export type WebhookProcessingStatus = 'processed' | 'duplicate_ignored';

export interface WebhookSuccessResponse {
  status: WebhookProcessingStatus;
  message: string;
  eventId: string;
  orderId?: string;
}

export interface WebhookEventRecord {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: Date;
}

export interface OrderRecord {
  id: string;
  user_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  created_at: Date;
  updated_at: Date;
}
