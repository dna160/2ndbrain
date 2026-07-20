/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/meta/media.client.ts
 * Role    : Fetch WhatsApp media from the Meta Graph API. Two-step: resolve the (short-lived)
 *           media URL, then download the bytes with the access token. Behind an interface so
 *           the media worker is testable without network.
 * Exports : MetaMediaClient, GraphMetaMediaClient
 */
export interface MetaMediaMeta {
  url: string;
  mimeType: string;
  fileSize: number;
  sha256?: string;
}

export interface MetaMediaClient {
  getMediaMeta(mediaId: string): Promise<MetaMediaMeta>;
  download(url: string): Promise<Uint8Array>;
}

export class GraphMetaMediaClient implements MetaMediaClient {
  constructor(
    private readonly accessToken: string,
    private readonly graphBase = 'https://graph.facebook.com/v20.0',
  ) {}

  async getMediaMeta(mediaId: string): Promise<MetaMediaMeta> {
    const res = await fetch(`${this.graphBase}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error(`meta media meta failed: ${res.status}`);
    const json = (await res.json()) as {
      url: string;
      mime_type: string;
      file_size: number;
      sha256?: string;
    };
    return { url: json.url, mimeType: json.mime_type, fileSize: json.file_size, sha256: json.sha256 };
  }

  async download(url: string): Promise<Uint8Array> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) throw new Error(`meta media download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
