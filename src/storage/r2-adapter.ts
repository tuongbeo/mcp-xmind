export interface R2ListResult {
  objects: Array<{ key: string; size: number; uploaded: string }>;
  nextCursor?: string;
  truncated: boolean;
}

export class R2Adapter {
  constructor(private readonly bucket: R2Bucket) {}

  async get(key: string): Promise<ArrayBuffer | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return obj.arrayBuffer();
  }

  async put(key: string, data: ArrayBuffer | Uint8Array, metadata?: Record<string, string>): Promise<void> {
    const buf: ArrayBuffer = data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      : data as ArrayBuffer;
    await this.bucket.put(key, buf, { customMetadata: metadata });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(prefix?: string, cursor?: string, limit = 20): Promise<R2ListResult> {
    const opts: R2ListOptions = { limit };
    if (prefix) opts.prefix = prefix;
    if (cursor) opts.cursor = cursor;
    const result = await this.bucket.list(opts);
    return {
      objects: result.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() })),
      nextCursor: result.truncated ? result.cursor : undefined,
      truncated: result.truncated,
    };
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return `https://r2-public/${key}?expires=${Date.now() + expiresIn * 1000}`;
  }
}
