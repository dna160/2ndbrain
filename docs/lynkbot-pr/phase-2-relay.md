# Lynkbot PR — Part 1 (relay + personal contacts)

**Target repo:** `github.com/dna160/lynkbot` (separate repo — apply there, not in Recall).
**Size:** ~90 LOC + 0 migrations. Ships in Phase 2 (docs/01 §3.3). Part 2 (status relay +
bot-outbound relay + takeover) ships in Phase 5.

This is a spec, not applied code — Recall cannot push to the Lynkbot repo. Implement it there
to make the ingestion path live. The Recall side (`POST /ingest/wa`) is already built and
verifies exactly the signature described here.

## 1. Relay every inbound message to Recall (no filtering)

In `apps/api/src/routes/webhooks/meta.ts`, **immediately after** the idempotency insert into
`webhookIngestLog` succeeds (the `if (!log) return duplicate` guard has passed), fire-and-forget
a relay job. The blacklist lives ONLY in Recall — Lynkbot forwards unconditionally.

```ts
// after: const [log] = await db.insert(webhookIngestLog)... ; if (!log) return dup;
void relayToRecall(body).catch((err) =>
  request.log.warn({ err }, 'recall relay enqueue failed (non-fatal)'),
);
```

`relayToRecall` enqueues a durable BullMQ job (new queue `lynkbot-brain-relay`, attempts 5,
exponential backoff) whose processor POSTs the **raw** webhook body to Recall:

```ts
const raw = JSON.stringify(body);
const timestamp = Date.now().toString();
const signature = createHmac('sha256', config.LYNKBOT_RELAY_SECRET)
  .update(`${timestamp}.${raw}`)      // MUST match Recall verifyRelaySignature()
  .digest('hex');

await fetch(`${config.RECALL_INGEST_URL}/ingest/wa`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-relay-timestamp': timestamp,
    'x-relay-signature': signature,
  },
  body: raw,
});
```

> **Contract note:** Recall's `verifyRelaySignature` computes the HMAC over
> `` `${timestamp}.${rawBody}` `` and rejects a timestamp older than 5 min (anti-replay). The
> POSTed bytes must be byte-identical to what was signed — sign the same `raw` string you send.
> Recall is idempotent on `events.externalId = message.id`, so relay retries are safe.

New env on Lynkbot: `LYNKBOT_RELAY_SECRET` (shared with Recall), `RECALL_INGEST_URL`.

## 2. Personal contacts → `skipAI: true`

Keep a small personal-contacts list (env CSV `PERSONAL_CONTACTS` or a table): operator +
partners. In `handleInbound`, if the sender is a personal contact, set `skipAI: true` so the
commerce bot never replies to them. **Decoupled from relay scope** — personal contacts are
still relayed to Recall like everyone else.

## Tests to add (Lynkbot side)

- every inbound message → a relay job enqueued (text, voice, image, document);
- personal contact → `skipAI` set, no AI reply, **still relayed**;
- commerce buyer → existing bot flow unchanged, **still relayed**;
- relay processor signs `${timestamp}.${raw}` and POSTs the identical body.

## Deferred to Part 2 (Phase 5)

Status-callback relay; bot-outbound relay (`origin:'lynkbot_bot'`); `POST/DELETE
/internal/brain/takeover` (suppress bot for a waId until expiry).
