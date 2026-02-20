/**
 * Cloudflare Queue consumer for webhook delivery.
 *
 * Processes `WebhookJob` messages from the `WEBHOOK_QUEUE` queue. For each
 * job it:
 *   1. Verifies the webhook exists and is enabled.
 *   2. Loads the stored payload from `board_webhook_payloads`.
 *   3. Resolves the delivery URL from KV (`webhook:<id>:url`).
 *   4. POSTs the payload to that URL, preserving the original content-type
 *      and headers captured at ingest time.
 *   5. Acks on success; retries with exponential backoff on failure.
 *
 * Delivery semantics:
 *   - HTTP 2xx → `msg.ack()`.
 *   - HTTP non-2xx or network error → `msg.retry({ delaySeconds })`.
 *   - Webhook disabled / payload missing → `msg.ack()` (discard silently).
 *   - Cloudflare sends messages to the dead-letter queue automatically once
 *     `max_retries` (wrangler.toml) is exhausted.
 *
 * No Node.js built-ins are used — this runs on the Cloudflare Workers runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Job payload enqueued when a webhook payload is ingested. */
interface WebhookJob {
  /** ID of the board_webhooks row. */
  webhookId: string;
  /** ID of the board_webhook_payloads row containing the raw payload. */
  payloadId: string;
  /** ID of the owning board (for logging / context). */
  boardId: string;
  /**
   * Application-level delivery attempt counter. Starts at 0 and is
   * incremented by this worker before each attempt so logs can distinguish
   * first delivery from retries.
   */
  attempts: number;
}

/** Cloudflare bindings declared in wrangler.toml. */
interface Env {
  DB: D1Database;
  KV: KVNamespace;
  WEBHOOK_QUEUE: Queue<WebhookJob>;
}

/** Minimal projection of the board_webhooks table. */
interface WebhookRow {
  id: string;
  board_id: string;
  /** SQLite boolean: 1 = enabled, 0 = disabled. */
  enabled: number;
  description: string;
}

/** Minimal projection of the board_webhook_payloads table. */
interface WebhookPayloadRow {
  id: string;
  webhook_id: string;
  /** JSON-encoded body received at ingest time. */
  payload: string | null;
  /** JSON-encoded Record<string, string> of original request headers. */
  headers: string | null;
  content_type: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base delay for exponential backoff (seconds). */
const BASE_BACKOFF_SECONDS = 5;
/** Hard ceiling on per-retry delay (5 minutes). */
const MAX_BACKOFF_SECONDS = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute per-retry delay with exponential backoff.
 * `attempt` is 1-indexed (first delivery attempt = 1).
 */
function backoffSeconds(attempt: number): number {
  return Math.min(
    BASE_BACKOFF_SECONDS * 2 ** (attempt - 1),
    MAX_BACKOFF_SECONDS
  );
}

/** Load a webhook row; returns null if missing or disabled. */
async function fetchWebhook(
  db: D1Database,
  webhookId: string
): Promise<WebhookRow | null> {
  const row = await db
    .prepare(
      `SELECT id, board_id, enabled, description
         FROM board_webhooks
        WHERE id = ?1
        LIMIT 1`
    )
    .bind(webhookId)
    .first<WebhookRow>();

  if (!row || !row.enabled) return null;
  return row;
}

/** Load a webhook payload row; returns null if missing. */
async function fetchPayload(
  db: D1Database,
  payloadId: string
): Promise<WebhookPayloadRow | null> {
  return db
    .prepare(
      `SELECT id, webhook_id, payload, headers, content_type
         FROM board_webhook_payloads
        WHERE id = ?1
        LIMIT 1`
    )
    .bind(payloadId)
    .first<WebhookPayloadRow>();
}

/**
 * Look up the HTTP delivery URL for a webhook from KV.
 * Stored under the key `webhook:<webhookId>:url`.
 */
async function fetchDeliveryUrl(
  kv: KVNamespace,
  webhookId: string
): Promise<string | null> {
  return kv.get(`webhook:${webhookId}:url`);
}

/**
 * HTTP POST the stored payload to `url`.
 *
 * Restores the original content-type and request headers captured at ingest.
 * Adds `X-Webhook-Id` and `X-Attempt` for idempotency and debugging.
 *
 * Throws on network errors or non-2xx responses.
 */
async function deliverPayload(
  url: string,
  payloadRow: WebhookPayloadRow,
  attempt: number
): Promise<void> {
  const originalHeaders: Record<string, string> = payloadRow.headers
    ? (JSON.parse(payloadRow.headers) as Record<string, string>)
    : {};

  const headers: Record<string, string> = {
    ...originalHeaders,
    "Content-Type": payloadRow.content_type ?? "application/json",
    "X-Webhook-Id": payloadRow.webhook_id,
    "X-Attempt": String(attempt),
  };

  const body = payloadRow.payload ?? "{}";

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} from ${url}`
    );
  }
}

// ---------------------------------------------------------------------------
// Queue consumer
// ---------------------------------------------------------------------------

export default {
  /**
   * Entry point called by the Cloudflare Workers runtime for each message batch.
   *
   * Messages are processed sequentially within a batch. Each message is
   * isolated: a failure on one does not affect others.
   */
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const job = msg.body as WebhookJob;
      const attempt = (job.attempts ?? 0) + 1;

      try {
        // 1. Load and validate the webhook configuration.
        const webhook = await fetchWebhook(env.DB, job.webhookId);
        if (!webhook) {
          // Webhook disabled or deleted — discard this delivery.
          console.log(
            `[queue-consumer] Discarding job: webhook not found or disabled` +
              ` webhookId=${job.webhookId}`
          );
          msg.ack();
          continue;
        }

        // 2. Load the payload.
        const payloadRow = await fetchPayload(env.DB, job.payloadId);
        if (!payloadRow) {
          // Payload row gone (e.g. purged) — discard safely.
          console.warn(
            `[queue-consumer] Discarding job: payload not found` +
              ` payloadId=${job.payloadId}`
          );
          msg.ack();
          continue;
        }

        // 3. Resolve delivery URL from KV.
        const url = await fetchDeliveryUrl(env.KV, job.webhookId);
        if (!url) {
          // No delivery URL configured — cannot deliver, discard.
          console.warn(
            `[queue-consumer] Discarding job: no delivery URL in KV` +
              ` webhookId=${job.webhookId}`
          );
          msg.ack();
          continue;
        }

        // 4. Deliver.
        await deliverPayload(url, payloadRow, attempt);

        console.log(
          `[queue-consumer] Delivered` +
            ` webhookId=${job.webhookId}` +
            ` payloadId=${job.payloadId}` +
            ` boardId=${job.boardId}` +
            ` attempt=${attempt}`
        );
        msg.ack();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const delay = backoffSeconds(attempt);
        console.error(
          `[queue-consumer] Delivery failed` +
            ` webhookId=${job.webhookId}` +
            ` payloadId=${job.payloadId}` +
            ` attempt=${attempt}` +
            ` retryIn=${delay}s : ${detail}`
        );
        msg.retry({ delaySeconds: delay });
      }
    }
  },
} satisfies ExportedHandler<Env>;
