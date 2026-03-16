// test/integration/tools-create.test.ts
import { describe, it, expect } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { KVAdapter } from '../../src/storage/kv-adapter.js';
import type { XMindDocument } from '../../src/core/types.js';

// Minimal KV mock
function mockKV() {
  const store = new Map<string, string>();
  return {
    async put(key: string, value: string) { store.set(key, value); },
    async get(key: string) { return store.get(key) ?? null; },
    async delete(key: string) { store.delete(key); },
    async list(opts?: { prefix?: string }) {
      const prefix = opts?.prefix ?? '';
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }));
      return { keys };
    },
  };
}

describe('create — build/parse integration', () => {
  it('stores and retrieves a created doc', async () => {
    const doc: XMindDocument = {
      sheets: [{
        id: 'test-sheet', title: 'Test',
        rootTopic: { id: 'root', title: 'Root', children: [{ id: 'c1', title: 'Child 1' }] },
      }],
    };
    const built = buildXmindFile(doc);
    const parsed = parseXmindBuffer(built.buffer as ArrayBuffer);
    expect(parsed.sheets[0].rootTopic.title).toBe('Root');
    expect(parsed.sheets[0].rootTopic.children).toHaveLength(1);
  });

  it('stores multi-sheet doc', () => {
    const doc: XMindDocument = {
      sheets: [
        { id: 's1', title: 'Sheet 1', rootTopic: { id: 'r1', title: 'R1' } },
        { id: 's2', title: 'Sheet 2', rootTopic: { id: 'r2', title: 'R2' } },
      ],
    };
    const parsed = parseXmindBuffer(buildXmindFile(doc).buffer as ArrayBuffer);
    expect(parsed.sheets).toHaveLength(2);
  });

  it('KVAdapter indexes and retrieves metadata', async () => {
    const kv = new KVAdapter(mockKV() as never);
    await kv.index('test/file.xmind', {
      fileName: 'file.xmind', fileKey: 'test/file.xmind',
      fileSize: 1024, sheetCount: 2, nodeCount: 10,
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    });
    const meta = await kv.get('test/file.xmind');
    expect(meta?.sheetCount).toBe(2);
    expect(meta?.nodeCount).toBe(10);
  });
});
