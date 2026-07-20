/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/r2.service.ts
 * Role    : Cloudflare R2 (S3-compatible) object storage — put + presigned PUT.
 *           Behind the R2Client interface so media/upload paths are testable with a fake.
 * Exports : R2Client, S3R2Client
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface R2Client {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  presignPut(key: string, contentType: string, expiresInSec: number): Promise<string>;
}

export class S3R2Client implements R2Client {
  private readonly s3: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  presignPut(key: string, contentType: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSec },
    );
  }
}
