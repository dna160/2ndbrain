import { describe, expect, it } from 'vitest';

import { extractInboundMessages, isStatusUpdate } from './extract';

function wrap(messages: unknown[], statuses: unknown[] = []) {
  return {
    entry: [
      { changes: [{ value: { metadata: { phone_number_id: 'PN1' }, messages, statuses } }] },
    ],
  };
}

const textMsg = { id: 'm1', from: '628a', type: 'text', timestamp: '1700000000', text: { body: 'hello' } };
const audioMsg = { id: 'm2', from: '628b', type: 'audio', timestamp: '1700000001', audio: { id: 'A1', mime_type: 'audio/ogg', voice: true } };
const imageMsg = { id: 'm3', from: '628c', type: 'image', timestamp: '1700000002', image: { id: 'I1', mime_type: 'image/jpeg', caption: 'a pic' } };
const docMsg = { id: 'm4', from: '628d', type: 'document', timestamp: '1700000003', document: { id: 'D1', mime_type: 'application/pdf' } };
const videoMsg = { id: 'm5', from: '628e', type: 'video', timestamp: '1700000004', video: { id: 'V1', mime_type: 'video/mp4' } };
const stickerMsg = { id: 'm6', from: '628f', type: 'sticker', timestamp: 'not-a-number', sticker: { id: 'S1', mime_type: 'image/webp' } };

describe('isStatusUpdate', () => {
  it('is true for a status-only payload', () => {
    expect(isStatusUpdate(wrap([], [{ id: 'm1', status: 'delivered' }]))).toBe(true);
  });
  it('is false when messages are present', () => {
    expect(isStatusUpdate(wrap([textMsg], [{ status: 'read' }]))).toBe(false);
  });
  it('is false for an empty/garbage body', () => {
    expect(isStatusUpdate({})).toBe(false);
    expect(isStatusUpdate(null)).toBe(false);
  });
});

describe('extractInboundMessages', () => {
  it('maps message kinds to Recall event types', () => {
    const out = extractInboundMessages(
      wrap([textMsg, audioMsg, imageMsg, docMsg, videoMsg, stickerMsg]),
    );
    expect(out.map((m) => m.eventType)).toEqual([
      'message',
      'audio',
      'image',
      'document',
      'document',
      'image',
    ]);
  });

  it('extracts text body and media metadata', () => {
    const [text, audio, image] = extractInboundMessages(wrap([textMsg, audioMsg, imageMsg]));
    expect(text).toMatchObject({ content: 'hello', mediaId: null, phoneNumberId: 'PN1' });
    expect(audio).toMatchObject({ mediaId: 'A1', mime: 'audio/ogg', rawType: 'audio' });
    expect(image).toMatchObject({ content: 'a pic', mediaId: 'I1' });
  });

  it('falls back to a valid ISO time for an unparseable timestamp', () => {
    const [sticker] = extractInboundMessages(wrap([stickerMsg]));
    expect(() => new Date(sticker!.occurredAt).toISOString()).not.toThrow();
    expect(Number.isNaN(Date.parse(sticker!.occurredAt))).toBe(false);
  });

  it('skips messages missing id or sender', () => {
    const out = extractInboundMessages(
      wrap([{ type: 'text', text: { body: 'x' } }, { id: 'only-id', type: 'text' }]),
    );
    expect(out).toHaveLength(0);
  });

  it('returns nothing for a non-webhook body', () => {
    expect(extractInboundMessages(null)).toEqual([]);
    expect(extractInboundMessages({ entry: 'nope' })).toEqual([]);
  });

  it('yields null content for a text message with no body', () => {
    const out = extractInboundMessages(
      wrap([{ id: 't0', from: '628q', type: 'text', timestamp: '1700000000' }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ eventType: 'message', content: null });
  });

  it('handles a typeless message and skips non-object entries', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                // no metadata → phoneNumberId null
                messages: [
                  'not-an-object',
                  { id: 'mt', from: '628x' }, // no type, no timestamp
                ],
              },
            },
          ],
        },
      ],
    };
    const out = extractInboundMessages(body);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ eventType: 'message', rawType: 'unknown', phoneNumberId: null, mediaId: null });
  });
});
