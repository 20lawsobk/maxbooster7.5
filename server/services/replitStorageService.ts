import { logger } from '../logger.js';
import crypto from 'crypto';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export class ReplitStorageService {
  private bucketName: string;
  private objectPrefix: string;
  private storageClient: any;
  private _initPromise: Promise<void>;

  constructor() {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || '';
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || process.env.REPLIT_BUCKET_ID || '';

    if (!privateDir && !bucketId) {
      throw new Error('PRIVATE_OBJECT_DIR or REPLIT_BUCKET_ID environment variable is required');
    }

    if (privateDir) {
      const parts = privateDir.replace(/^\//, '').split('/');
      this.bucketName = parts[0];
      this.objectPrefix = parts.slice(1).join('/');
    } else {
      this.bucketName = bucketId;
      this.objectPrefix = '';
    }

    this.storageClient = null;
    this._initPromise = this._initClient();

    logger.info(`✅ Replit App Storage initialized for bucket: ${this.bucketName}`);
  }

  private async _initClient(): Promise<void> {
    const { Storage } = await import('@google-cloud/storage');
    this.storageClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }

  private async ensureClient(): Promise<void> {
    await this._initPromise;
  }

  private getObjectPath(key: string): string {
    return this.objectPrefix ? `${this.objectPrefix}/${key}` : key;
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string = 'uploads'
  ): Promise<{ url: string; key: string }> {
    await this.ensureClient();
    try {
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
      const key = `${folder}/${timestamp}-${hash}-${fileName}`;
      const objectPath = this.getObjectPath(key);

      const bucket = this.storageClient.bucket(this.bucketName);
      const file = bucket.file(objectPath);

      await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
      });

      logger.info(`✅ File uploaded to Replit App Storage: ${key}`);

      const url = `/objects/${key}`;

      return { url, key };
    } catch (error: unknown) {
      logger.error('❌ Failed to upload file to Replit App Storage:', error);
      throw new Error(
        `Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    await this.ensureClient();
    try {
      const objectPath = this.getObjectPath(key);
      const bucket = this.storageClient.bucket(this.bucketName);
      const file = bucket.file(objectPath);

      const [contents] = await file.download();
      logger.info(`✅ File downloaded from Replit App Storage: ${key}`);
      return Buffer.from(contents);
    } catch (error: unknown) {
      logger.error('❌ Failed to download file from Replit App Storage:', error);
      throw new Error(
        `Storage download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.ensureClient();
    try {
      const objectPath = this.getObjectPath(key);
      const bucket = this.storageClient.bucket(this.bucketName);
      const file = bucket.file(objectPath);

      await file.delete({ ignoreNotFound: true });
      logger.info(`✅ File deleted from Replit App Storage: ${key}`);
    } catch (error: unknown) {
      logger.error('❌ Failed to delete file from Replit App Storage:', error);
      throw new Error(
        `Storage delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async fileExists(key: string): Promise<boolean> {
    await this.ensureClient();
    try {
      const objectPath = this.getObjectPath(key);
      const bucket = this.storageClient.bucket(this.bucketName);
      const file = bucket.file(objectPath);
      const [exists] = await file.exists();
      return exists;
    } catch (error: unknown) {
      logger.error('❌ Failed to check file existence in Replit App Storage:', error);
      return false;
    }
  }

  async listFiles(prefix: string = ''): Promise<string[]> {
    await this.ensureClient();
    try {
      const objectPath = this.getObjectPath(prefix);
      const bucket = this.storageClient.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: objectPath });
      return files.map((f: any) => f.name);
    } catch (error: unknown) {
      logger.error('❌ Failed to list files in Replit App Storage:', error);
      throw new Error(
        `Storage list failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getPublicUrl(key: string): string {
    return `/objects/${key}`;
  }
}

let storageInstance: ReplitStorageService | null = null;

export function getReplitStorageService(): ReplitStorageService {
  if (!storageInstance) {
    storageInstance = new ReplitStorageService();
  }
  return storageInstance;
}
