// test/integration/tools-delete.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { findNodeById, deleteNode, deleteSheet } from '../../src/core/xmind-mutator.js';
import { simpleDoc, multiSheetDoc } from '../fixtures/generate.js';

function store() {
  const m = new Map<string, ArrayBuffer>();
  return {
    put: (k: string, d: ArrayBuffer) => m.set(k, d),
    get: (k: string) => m.get(k)!,
  };
}

describe('delete tools — integration', () => {
  let db: ReturnType<typeof store>;

  beforeEach(() => {
    db = store();
    db.put('simple.xmind', buildXmindFile(simpleDoc).buffer as ArrayBuffer);
    db.put('multi.xmind', buildXmindFile(multiSheetDoc).buffer as ArrayBuffer);
  });

  it('deleteNode leaf persists after rebuild', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    const { doc: updated } = deleteNode(doc, 'fixture-0-2-0');
    db.put('simple.xmind', buildXmindFile(updated).buffer as ArrayBuffer);
    expect(findNodeById(parseXmindBuffer(db.get('simple.xmind')), 'fixture-0-2-0')).toBeNull();
  });

  it('deleteNode subtree removes all descendants', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    const { doc: updated, deletedCount } = deleteNode(doc, 'fixture-0-1-0', true);
    expect(deletedCount).toBe(2);
    db.put('simple.xmind', buildXmindFile(updated).buffer as ArrayBuffer);
    const reloaded = parseXmindBuffer(db.get('simple.xmind'));
    expect(findNodeById(reloaded, 'fixture-0-1-0')).toBeNull();
    expect(findNodeById(reloaded, 'fixture-0-2-0')).toBeNull();
  });

  it('deleteSheet removes sheet from multi-sheet doc', () => {
    const doc = parseXmindBuffer(db.get('multi.xmind'));
    const updated = deleteSheet(doc, 1);
    db.put('multi.xmind', buildXmindFile(updated).buffer as ArrayBuffer);
    const reloaded = parseXmindBuffer(db.get('multi.xmind'));
    expect(reloaded.sheets).toHaveLength(2);
    expect(reloaded.sheets.every(s => s.id !== 'sheet-1')).toBe(true);
  });

  it('LAST_SHEET error on single-sheet doc', () => {
    const doc = parseXmindBuffer(db.get('simple.xmind'));
    expect(() => deleteSheet(doc, 0)).toThrowError('Cannot delete the only sheet');
  });
});
