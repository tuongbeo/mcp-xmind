// test/unit/kv-adapter.test.ts
// Full coverage of KVAdapter: putFile, getFile, deleteFile, index, get, delete, list, listFileKeys
import { describe, it, expect, beforeEach } from 'vitest';
import { KVAdapter } from '../../src/storage/kv-adapter.js';
import type { FileMetadata } from '../../src/core/types.js';

// In-memory KV mock (mirrors CF KVNamespace API)
function mockKV() {
  const store = new Map<string, string>();
  return {
    async put(key: string, value: string) { store.set(key, value); },
    async get(key: string) { return store.get(key) ?? null; },
    async delete(key: string) { store.delete(key); },
    async list(opts?: { prefix?: string; limit?: number; cursor?: string }) {
      const prefix = opts?.prefix ?? '';
      const keys = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

function makeMeta(fileKey: string, overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    fileName: fileKey.split('/').pop()!,
    fileKey,
    fileSize: 512,
    sheetCount: 1,
    nodeCount: 5,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('KVAdapter — file storage', () => {
  let kv: KVAdapter;

  beforeEach(() => { kv = new KVAdapter(mockKV() as never); });

  it('putFile and getFile roundtrip', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]).buffer;
    await kv.putFile('uuid-1/test.xmind', data);
    const result = await kv.getFile('uuid-1/test.xmind');
    expect(result).not.toBeNull();
    const bytes = new Uint8Array(result!);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[4]).toBe(0xff);
  });

  it('putFile accepts Uint8Array', async () => {
    const arr = new Uint8Array([1, 2, 3]);
    await kv.putFile('uuid-2/f.xmind', arr);
    const result = await kv.getFile('uuid-2/f.xmind');
    expect(new Uint8Array(result!)).toEqual(arr);
  });

  it('getFile returns null for missing key', async () => {
    const result = await kv.getFile('nonexistent/key.xmind');
    expect(result).toBeNull();
  });

  it('deleteFile removes both file and meta entries', async () => {
    const data = new Uint8Array([1]).buffer;
    await kv.putFile('uuid-3/f.xmind', data);
    await kv.index('uuid-3/f.xmind', makeMeta('uuid-3/f.xmind'));
    await kv.deleteFile('uuid-3/f.xmind');
    expect(await kv.getFile('uuid-3/f.xmind')).toBeNull();
    expect(await kv.get('uuid-3/f.xmind')).toBeNull();
  });
});

describe('KVAdapter — metadata index', () => {
  let kv: KVAdapter;

  beforeEach(() => { kv = new KVAdapter(mockKV() as never); });

  it('index and get metadata', async () => {
    const meta = makeMeta('uuid-4/map.xmind', { sheetCount: 3, nodeCount: 22 });
    await kv.index('uuid-4/map.xmind', meta);
    const result = await kv.get('uuid-4/map.xmind');
    expect(result?.sheetCount).toBe(3);
    expect(result?.nodeCount).toBe(22);
  });

  it('get returns null for missing key', async () => {
    expect(await kv.get('not/here.xmind')).toBeNull();
  });

  it('delete removes metadata entry', async () => {
    await kv.index('uuid-5/x.xmind', makeMeta('uuid-5/x.xmind'));
    await kv.delete('uuid-5/x.xmind');
    expect(await kv.get('uuid-5/x.xmind')).toBeNull();
  });

  it('list returns all indexed files', async () => {
    await kv.index('a1/f1.xmind', makeMeta('a1/f1.xmind'));
    await kv.index('a1/f2.xmind', makeMeta('a1/f2.xmind'));
    const all = await kv.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some(m => m.fileKey === 'a1/f1.xmind')).toBe(true);
  });

  it('list filters by prefix', async () => {
    await kv.index('proj-A/f1.xmind', makeMeta('proj-A/f1.xmind'));
    await kv.index('proj-B/f2.xmind', makeMeta('proj-B/f2.xmind'));
    const filtered = await kv.list('proj-A');
    expect(filtered.every(m => m.fileKey.startsWith('proj-A'))).toBe(true);
  });
});

describe('KVAdapter — listFileKeys pagination', () => {
  let kv: KVAdapter;

  beforeEach(async () => {
    kv = new KVAdapter(mockKV() as never);
    await kv.index('p/f1.xmind', makeMeta('p/f1.xmind'));
    await kv.index('p/f2.xmind', makeMeta('p/f2.xmind'));
    await kv.index('p/f3.xmind', makeMeta('p/f3.xmind'));
  });

  it('listFileKeys returns all keys with prefix', async () => {
    const result = await kv.listFileKeys('p/');
    expect(result.keys).toHaveLength(3);
    expect(result.complete).toBe(true);
    expect(result.cursor).toBeUndefined();
  });

  it('listFileKeys strips meta: prefix from returned keys', async () => {
    const result = await kv.listFileKeys('p/');
    expect(result.keys.every(k => !k.startsWith('meta:'))).toBe(true);
    expect(result.keys).toContain('p/f1.xmind');
  });

  it('listFileKeys with no prefix returns everything', async () => {
    const result = await kv.listFileKeys();
    expect(result.keys.length).toBeGreaterThanOrEqual(3);
  });
});
