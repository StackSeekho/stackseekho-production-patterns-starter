# Phase 3: Orders, Idempotent Webhook Processing & Verification

## 1. Database-Backed Idempotency Guarantee & Scope

### Why Distributed Systems Cannot Guarantee Exactly-Once Delivery
In distributed computing (e.g., Stripe, Shopify, or payment gateway webhooks), **network delivery is inherently at-least-once**.
When a payment gateway dispatches a webhook:
1. If the network drops the connection before an ACK is received,
2. If the application server takes longer than the gateway's timeout to respond, or
3. If an intermediate proxy resets the connection,

the webhook producer cannot determine whether the payload was processed or lost. By design, compliant webhook producers **retry delivery** until they receive an HTTP 2xx acknowledgement or exhaust retry attempts. Consequently, duplicate deliveries are an inevitable operational reality.

### The Database-Backed Solution: At-Least-Once Delivery with Exactly-Once Processing
Rather than claiming an impossible network-level "exactly-once delivery", this system implements **database-backed idempotency**:
- **Atomic Event Registration (`webhook_events.event_id` UNIQUE):** Each webhook message carries an external `eventId`. Inserting this record inside an ACID transaction acts as a distributed lock and deduplication barrier.
- **PostgreSQL SQLSTATE 23505 (`unique_violation`):** If a duplicate event arrives (sequentially or concurrently), PostgreSQL rejects the insertion at the database engine level with SQLSTATE 23505.
- **Pessimistic Row Locking (`FOR UPDATE`):** When processing the order, `SELECT ... FOR UPDATE` acquires an exclusive row-level lock on the order, preventing concurrent transactions from conflicting or racing.
- **Single Transaction Boundary:** Event registration and order state transition (`PENDING` -> `PAID`) occur within the **same database transaction**. If anything fails (e.g. order missing or invalid status), the transaction rolls back completely—no orphaned event is recorded.

### Scope and Boundaries of this Guarantee
- **Covered Scope:** All database state transitions (order status, payment ledger, event logging) are strictly idempotent and protected against race conditions and duplicates.
- **Outside Scope (Side-Effects):** Non-transactional external side-effects (such as dispatching an email via SendGrid or making a third-party API call) should not occur inside this transaction block. For external side-effects, use the **Transactional Outbox Pattern** to decouple message persistence from asynchronous delivery.

---

## 2. Order State Transitions & Safe Failure Behaviors

| Scenario | Condition | Resulting HTTP Status | Transaction Outcome | Response Status |
|---|---|---|---|---|
| **First Delivery** | Valid order in `PENDING` state | `200 OK` | Committed | `processed` |
| **Duplicate Delivery** | `eventId` already in `webhook_events` (SQLSTATE `23505`) | `200 OK` | Caught & Handled | `duplicate_ignored` |
| **Nonexistent Order** | `orderId` not found in `orders` table | `404 Not Found` | Rolled Back | `error` (`NOT_FOUND`) |
| **Invalid State Transition** | Order in `CANCELLED` or already `PAID` with different event | `409 Conflict` | Rolled Back | `error` (`CONFLICT`) |
| **Malformed Payload** | Missing `eventId`, invalid UUID format | `400 Bad Request` | No Tx Started | `error` (`BAD_REQUEST`) |

---

## 3. SQL Verification Queries

Connect to the PostgreSQL database (`stackseekho_dev` or `stackseekho_test`) using `psql`:

```bash
psql -h localhost -U postgres -d stackseekho_dev
```

### A. Verify Seed Orders and Current States
```sql
SELECT 
    id, 
    user_id, 
    amount_cents, 
    currency, 
    status, 
    created_at, 
    updated_at 
FROM orders 
ORDER BY created_at ASC;
```

### B. Verify Processed Webhook Events
```sql
SELECT 
    id, 
    event_id, 
    event_type, 
    status, 
    created_at, 
    payload->>'orderId' AS order_id, 
    payload->>'amount' AS amount 
FROM webhook_events 
ORDER BY created_at DESC;
```

### C. Verify Deduplication (Confirm No Duplicate Event IDs Exist)
```sql
SELECT 
    event_id, 
    COUNT(*) AS occurrence_count 
FROM webhook_events 
GROUP BY event_id 
HAVING COUNT(*) > 1;
-- Expected output: 0 rows (guaranteed by unique constraint)
```

### D. Verify Transactional Atomicity (No Orphaned Events for Failed Transitions)
```sql
SELECT 
    we.event_id, 
    we.payload->>'orderId' AS payload_order_id, 
    o.id AS order_table_id, 
    o.status AS current_order_status
FROM webhook_events we
LEFT JOIN orders o ON o.id = (we.payload->>'orderId')::uuid;
-- All recorded events must correspond to successfully transitioned orders
```

### E. Inspect Unique Index and Table Schema
```sql
-- Check indexes and unique constraints on webhook_events
\d webhook_events

-- Check indexes and foreign keys on orders
\d orders
```
