// test/integration/tools-update.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { findNodeById, updateNode, addNode, moveNode } from '../../src/core/xmind-mutator.js';
import { simpleDoc } from '../fixtures/generate.js';

type DocBuffer = { buf: ArrayBuffer };

function store(): { put(k: string, d: ArrayBuffer): void; get(k: string): ArrayBuffer } {
  const m = new Map<string, ArrayBuffer>();
  return { put: (k, d) => m.set(k, d), get: (k) => m.get(k)! };
}

describe('update tools — integration', () => {
  let db: ReturnType<typeof store>;

  beforeEach(() => {
    db = store();
    db.put('simple.xmind', buildXmindFile(simpleDoc).buffer as ArrayBuffer);
  });

  it('updateNode title persists after rebuild', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    const updated = updateNode(doc, 'fixture-0-1-0', { title: 'New Title' });
    db.put('simple.xmind', buildXmindFile(updated).buffer as ArrayBuffer);
    const reloaded = parseXmindBuffer(db.get('simple.xmind'));
    expect(findNodeById(reloaded, 'fixture-0-1-0')?.title).toBe('New Title');
  });

  it('addNode child persists after rebuild', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    const { doc: updated, newNodeId } = addNode(doc, 'fixture-0-0-0', { title: 'Added' });
    db.put('simple.xmind', buildXmindFile(updated).buffer as ArrayBuffer);
    const reloaded = parseXmindBuffer(db.get('simple.xmind'));
    expect(findNodeById(reloaded, newNodeId)?.title).toBe('Added');
    expect(findNodeById(reloaded, 'fixture-0-0-0')?.children).toHaveLength(3);
  });

  it('moveNode persists after rebuild', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    const moved = moveNode(doc, 'fixture-0-1-0', 'fixture-0-1-1');
    db.put('simple.xmind', buildXmindFile(moved).buffer as ArrayBuffer);
    const reloaded = parseXmindBuffer(db.get('simple.xmind'));
    expect(findNodeById(reloaded, 'fixture-0-1-1')?.children?.some(c => c.id === 'fixture-0-1-0')).toBe(true);
    expect(findNodeById(reloaded, 'fixture-0-0-0')?.children).toHaveLength(1);
  });
});
