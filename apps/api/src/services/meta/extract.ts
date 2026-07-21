/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/meta/extract.ts
 * Role    : Pure extraction of inbound messages from a Meta WhatsApp webhook body
 *           delivered directly by Meta. Narrows unknown → ExtractedInbound.
 *           Reference: Lynkbot @lynkbot/meta extractFirstMessage / isStatusUpdate.
 * Exports : isStatusUpdate(), extractInboundMessages()
 */
import type { ExtractedMessage, IngestEventType } from '@recall/shared';

export interface ExtractedInbound extends ExtractedMessage {
  raw: Record<string, unknown>;
  /** WhatsApp profile name from `value.contacts[].profile.name`, when the sender shares it. */
  senderName: string | null;
}

/** wa_id → profile name for one change value. Meta sends contacts alongside messages. */
function contactNames(value: Record<string, unknown>): Map<string, string> {
  const names = new Map<string, string>();
  for (const rawContact of asArray(value.contacts)) {
    const contact = asRecord(rawContact);
    const waId = asString(contact?.wa_id);
    const name = asString(asRecord(contact?.profile)?.name);
    if (waId && name) names.set(waId, name);
  }
  return names;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function mapEventType(metaType: string): IngestEventType {
  switch (metaType) {
    case 'audio':
      return 'audio';
    case 'image':
    case 'sticker':
      return 'image';
    case 'document':
    case 'video':
      return 'document';
    default:
      return 'message';
  }
}

/** Iterate every change's `value` object across all entries. */
function* changeValues(body: unknown): Generator<Record<string, unknown>> {
  const root = asRecord(body);
  if (!root) return;
  for (const entry of asArray(root.entry)) {
    for (const change of asArray(asRecord(entry)?.changes)) {
      const value = asRecord(asRecord(change)?.value);
      if (value) yield value;
    }
  }
}

/** True when the payload is a delivery/read status callback (no inbound messages). */
export function isStatusUpdate(body: unknown): boolean {
  let sawStatuses = false;
  for (const value of changeValues(body)) {
    if (asArray(value.messages).length > 0) return false;
    if (asArray(value.statuses).length > 0) sawStatuses = true;
  }
  return sawStatuses;
}

export function extractInboundMessages(body: unknown): ExtractedInbound[] {
  const out: ExtractedInbound[] = [];
  for (const value of changeValues(body)) {
    const phoneNumberId = asString(asRecord(value.metadata)?.phone_number_id);
    const names = contactNames(value);
    for (const rawMsg of asArray(value.messages)) {
      const msg = asRecord(rawMsg);
      if (!msg) continue;
      const metaMessageId = asString(msg.id);
      const senderWaId = asString(msg.from);
      const metaType = asString(msg.type) ?? 'unknown';
      if (!metaMessageId || !senderWaId) continue;

      const typeObj = asRecord(msg[metaType]);
      const content =
        metaType === 'text'
          ? asString(asRecord(msg.text)?.body)
          : (asString(typeObj?.caption) ?? null);
      const tsSeconds = Number(asString(msg.timestamp) ?? '');
      const occurredAt = Number.isFinite(tsSeconds)
        ? new Date(tsSeconds * 1000).toISOString()
        : new Date().toISOString();

      out.push({
        metaMessageId,
        senderWaId,
        phoneNumberId,
        eventType: mapEventType(metaType),
        rawType: metaType,
        content,
        mediaId: typeObj ? asString(typeObj.id) : null,
        mime: typeObj ? asString(typeObj.mime_type) : null,
        occurredAt,
        raw: msg,
        senderName: names.get(senderWaId) ?? null,
      });
    }
  }
  return out;
}
