// test/unit/xmind-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { simpleDoc, multiSheetDoc, withTasksDoc, withRelationshipsDoc } from '../fixtures/generate.js';

describe('xmind-parser', () => {
  it('parses simple.xmind — 1 sheet, 5 nodes', () => {
    const buf = buildXmindFile(simpleDoc).buffer as ArrayBuffer;
    const doc = parseXmindBuffer(buf);
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].title).toBe('Simple Sheet');
    expect(doc.sheets[0].rootTopic.id).toBe('fixture-0-0-0');
    expect(doc.sheets[0].rootTopic.children).toHaveLength(2);
    expect(doc.sheets[0].rootTopic.children![0].children).toHaveLength(1);
  });

  it('parses multi-sheet.xmind — 3 sheets', () => {
    const buf = buildXmindFile(multiSheetDoc).buffer as ArrayBuffer;
    const doc = parseXmindBuffer(buf);
    expect(doc.sheets).toHaveLength(3);
    expect(doc.sheets[1].title).toBe('Sheet 2');
    expect(doc.sheets[2].rootTopic.id).toBe('fixture-2-0-0');
  });

  it('parses task markers', () => {
    const buf = buildXmindFile(withTasksDoc).buffer as ArrayBuffer;
    const doc = parseXmindBuffer(buf);
    const root = doc.sheets[0].rootTopic;
    expect(root.children![0].tasks?.status).toBe('done');
    expect(root.children![1].tasks?.status).toBe('in-progress');
    expect(root.children![2].tasks?.status).toBe('todo');
  });

  it('parses relationships', () => {
    const buf = buildXmindFile(withRelationshipsDoc).buffer as ArrayBuffer;
    const doc = parseXmindBuffer(buf);
    expect(doc.sheets[0].relationships).toHaveLength(3);
    expect(doc.sheets[0].relationships![0].title).toBe('calls');
  });

  it('throws CORRUPT_FILE on invalid ZIP', () => {
    const bad = new Uint8Array([0, 1, 2, 3]).buffer;
    expect(() => parseXmindBuffer(bad)).toThrowError('Failed to unzip');
  });
});
