import type { FileMetadata } from '../core/types.js';

export class KVAdapter {
  constructor(private readonly kv: KVNamespace) {}

  async index(fileKey: string, meta: FileMetadata): Promise<void> {
    await this.kv.put(`file:${fileKey}`, JSON.stringify(meta));
  }

  async get(fileKey: string): Promise<FileMetadata | null> {
    const raw = await this.kv.get(`file:${fileKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as FileMetadata;
  }

  async delete(fileKey: string): Promise<void> {
    await this.kv.delete(`file:${fileKey}`);
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    const result = await this.kv.list({ prefix: `file:${prefix ?? ''}` });
    const metas: FileMetadata[] = [];
    for (const key of result.keys) {
      const raw = await this.kv.get(key.name);
      if (raw) { try { metas.push(JSON.parse(raw) as FileMetadata); } catch { /* skip */ } }
    }
    return metas;
  }
}
