/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/meta/send.client.ts
 * Role    : Meta WhatsApp Cloud send API — free-form text + approved template. Behind an
 *           interface so waSend is testable without network.
 */
export interface MetaSendClient {
  sendText(waId: string, text: string): Promise<string>;
  sendTemplate(waId: string, templateName: string): Promise<string>;
}

export class GraphMetaSendClient implements MetaSendClient {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphBase = 'https://graph.facebook.com/v20.0',
  ) {}

  sendText(waId: string, text: string): Promise<string> {
    return this.post({ messaging_product: 'whatsapp', to: waId, type: 'text', text: { body: text } });
  }

  sendTemplate(waId: string, templateName: string): Promise<string> {
    return this.post({
      messaging_product: 'whatsapp',
      to: waId,
      type: 'template',
      template: { name: templateName, language: { code: 'en' } },
    });
  }

  private async post(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.graphBase}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`meta send failed: ${res.status}`);
    const json = (await res.json()) as { messages?: Array<{ id: string }> };
    const id = json.messages?.[0]?.id;
    if (!id) throw new Error('meta send: no message id');
    return id;
  }
}
