// test/unit/xmind-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { simpleDoc, multiSheetDoc, withTasksDoc } from '../fixtures/generate.js';

function roundtrip(doc: Parameters<typeof buildXmindFile>[0]) {
  const built = buildXmindFile(doc);
  return parseXmindBuffer(built.buffer as ArrayBuffer);
}

describe('xmind-builder', () => {
  it('roundtrip preserves sheet count', () => {
    const rt = roundtrip(multiSheetDoc);
    expect(rt.sheets).toHaveLength(3);
  });

  it('roundtrip preserves node hierarchy', () => {
    const rt = roundtrip(simpleDoc);
    expect(rt.sheets[0].rootTopic.id).toBe('fixture-0-0-0');
    expect(rt.sheets[0].rootTopic.children![0].id).toBe('fixture-0-1-0');
    expect(rt.sheets[0].rootTopic.children![0].children![0].id).toBe('fixture-0-2-0');
  });

  it('roundtrip preserves task data', () => {
    const rt = roundtrip(withTasksDoc);
    const child = rt.sheets[0].rootTopic.children![0];
    expect(child.tasks?.status).toBe('done');
    expect(child.tasks?.priority).toBe(1);
  });

  it('roundtrip preserves titles', () => {
    const rt = roundtrip(simpleDoc);
    expect(rt.sheets[0].rootTopic.title).toBe('Root Topic');
    expect(rt.sheets[0].rootTopic.children![1].title).toBe('Child B');
  });

  it('builds valid ZIP with content.json', () => {
    const built = buildXmindFile(simpleDoc);
    // ZIP magic bytes: PK (0x50, 0x4B)
    expect(built[0]).toBe(0x50);
    expect(built[1]).toBe(0x4B);
  });
});
