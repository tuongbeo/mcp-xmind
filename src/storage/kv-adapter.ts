// src/storage/kv-adapter.ts
// Stores both file content (as base64) and metadata in a single KV namespace.
// No R2 required — works on Cloudflare Workers free plan.
import type { FileMetadata } from '../core/types.js';

export class KVAdapter {
  constructor(private readonly kv: KVNamespace) {}

  // ── File content ─────────────────────────────────────────────────────────

  async putFile(fileKey: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    await this.kv.put(`file:${fileKey}`, btoa(binary));
  }

  async getFile(fileKey: string): Promise<ArrayBuffer | null> {
    const b64 = await this.kv.get(`file:${fileKey}`);
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async deleteFile(fileKey: string): Promise<void> {
    await Promise.all([
      this.kv.delete(`file:${fileKey}`),
      this.kv.delete(`meta:${fileKey}`),
    ]);
  }

  // ── Metadata index ────────────────────────────────────────────────────────

  async index(fileKey: string, meta: FileMetadata): Promise<void> {
    await this.kv.put(`meta:${fileKey}`, JSON.stringify(meta));
  }

  async get(fileKey: string): Promise<FileMetadata | null> {
    const raw = await this.kv.get(`meta:${fileKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as FileMetadata;
  }

  async delete(fileKey: string): Promise<void> {
    await this.kv.delete(`meta:${fileKey}`);
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    const result = await this.kv.list({ prefix: `meta:${prefix ?? ''}` });
    const metas: FileMetadata[] = [];
    for (const key of result.keys) {
      const raw = await this.kv.get(key.name);
      if (raw) {
        try { metas.push(JSON.parse(raw) as FileMetadata); } catch { /* skip */ }
      }
    }
    return metas;
  }

  // ── Directory listing ────────────────────────────────────────────────────

  async listFileKeys(prefix?: string, cursor?: string, limit = 20): Promise<{
    keys: string[];
    cursor?: string;
    complete: boolean;
  }> {
    const opts: KVNamespaceListOptions = { prefix: `meta:${prefix ?? ''}`, limit };
    if (cursor) opts.cursor = cursor;
    const result = await this.kv.list(opts);
    // result.cursor only exists when list_complete === false
    const nextCursor = result.list_complete
      ? undefined
      : (result as unknown as { cursor: string }).cursor;
    return {
      keys: result.keys.map(k => k.name.replace(/^meta:/, '')),
      cursor: nextCursor,
      complete: result.list_complete,
    };
  }
}
