# Lynkbot PR — Part 2 (status relay + bot-outbound relay + takeover)

**Target repo:** `github.com/dna160/lynkbot` (separate repo). ~60 LOC + 1 small table/in-memory
map. Ships in Phase 5 (docs/01 §3.3). Builds on Part 1 (`docs/lynkbot-pr/phase-2-relay.md`).

## 1. Relay delivery-status callbacks

Meta delivery/read statuses for Recall-sent messages arrive at **Lynkbot's** webhook. In
`routes/webhooks/meta.ts`, when the payload is a status callback (`value.statuses`), relay it to
Recall's `/ingest/wa` using the **same timestamp-bound HMAC** as Part 1 (Recall records read
receipts / delivery ticks from these).

## 2. Relay the bot's own outbound sends

After the commerce bot sends a reply, fire the same relay job with the outbound message body,
marked `origin: 'lynkbot_bot'`. Recall renders these as **Assistant** messages so threads read
complete (docs/00 F8). Include it in the relayed JSON so Recall's extraction can persist a
`direction: 'outbound'` event with `raw.origin = 'lynkbot_bot'`.

## 3. Takeover endpoint (suppress bot for a waId)

Add an internal endpoint guarded by the internal API key:

```
POST   /internal/brain/takeover   { waId, untilISO }   → suppress bot replies for waId until expiry
DELETE /internal/brain/takeover   { waId }              → resume immediately
```

Back it with an in-memory map **and** a small table row (survives restart). In `handleInbound`,
if a waId is under takeover and not expired, skip the AI/bot flow (still relay to Recall).
Recall calls these via `LynkbotTakeoverClient` when the operator replies to a bot-active thread
(the ConfirmBar → `reply(..., confirmTakeover=true)` pauses the bot **before** sending).

## Recall side (already built)

- `services/lynkbot.client.ts` — POST/DELETE proxy with `x-internal-api-key`.
- `ConversationsService.reply` — on a bot-active thread returns `needsConfirm`; with confirm it
  calls `takeover.pause(...)` **before** `waSend.send(...)` (unit-tested ordering).
- `POST /v1/conversations/:waId/takeover` + `DELETE` proxy these; the Conversations thread UI
  shows the ConfirmBar and a Resume affordance.

## Tests to add (Lynkbot side)

- status callback → relayed to Recall;
- bot outbound → relayed with `origin:'lynkbot_bot'`;
- takeover POST suppresses bot for waId until expiry; DELETE resumes; expiry auto-resumes.
