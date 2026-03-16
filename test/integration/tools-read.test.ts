// test/integration/tools-read.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { simpleDoc, multiSheetDoc } from '../fixtures/generate.js';

// In-memory mock R2 bucket
function mockR2() {
  const store = new Map<string, ArrayBuffer>();
  return {
    async put(key: string, data: ArrayBuffer | Uint8Array) {
      const buf = data instanceof Uint8Array
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        : data;
      store.set(key, buf);
    },
    async get(key: string) {
      const buf = store.get(key);
      if (!buf) return null;
      return { arrayBuffer: async () => buf };
    },
    store,
  };
}

describe('read tools — core logic', () => {
  let r2: ReturnType<typeof mockR2>;

  beforeEach(() => {
    r2 = mockR2();
  });

  it('put/get roundtrip works', async () => {
    await r2.put('test/simple.xmind', buildXmindFile(simpleDoc).buffer as ArrayBuffer);
    const obj = await r2.get('test/simple.xmind');
    expect(obj).not.toBeNull();
    const buf = await obj!.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(10);
  });

  it('parses fixture from mock R2', async () => {
    await r2.put('test/simple.xmind', buildXmindFile(simpleDoc).buffer as ArrayBuffer);
    const obj = await r2.get('test/simple.xmind');
    const doc = parseXmindBuffer(await obj!.arrayBuffer());
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].rootTopic.id).toBe('fixture-0-0-0');
  });

  it('multi-sheet fixture has 3 sheets', async () => {
    await r2.put('test/multi.xmind', buildXmindFile(multiSheetDoc).buffer as ArrayBuffer);
    const obj = await r2.get('test/multi.xmind');
    const doc = parseXmindBuffer(await obj!.arrayBuffer());
    expect(doc.sheets).toHaveLength(3);
  });
});
