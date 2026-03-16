// test/integration/tools-search.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { findNodeById, findNodePath } from '../../src/core/xmind-mutator.js';
import { fuzzyMatch, fuzzyPath } from '../../src/utils/fuzzy.js';
import { simpleDoc } from '../fixtures/generate.js';

describe('search tools — integration', () => {
  const buf = buildXmindFile(simpleDoc).buffer as ArrayBuffer;
  const doc = parseXmindBuffer(buf);

  it('fuzzyMatch exact returns score 1.0', () => {
    const { matched, score } = fuzzyMatch('root topic', 'root topic');
    expect(matched).toBe(true);
    expect(score).toBe(1.0);
  });

  it('fuzzyMatch substring returns score 0.8', () => {
    const { matched, score } = fuzzyMatch('child', 'child a');
    expect(matched).toBe(true);
    expect(score).toBeCloseTo(0.8);
  });

  it('fuzzyMatch non-match returns false', () => {
    expect(fuzzyMatch('xyz', 'root topic').matched).toBe(false);
  });

  it('fuzzyPath finds node by slash-separated path', () => {
    const node = fuzzyPath(doc, 'root topic/child a');
    expect(node?.id).toBe('fixture-0-1-0');
  });

  it('fuzzyPath returns null for non-existent path', () => {
    expect(fuzzyPath(doc, 'root/nonexistent/deep')).toBeNull();
  });

  it('findNodeById from parsed doc', () => {
    expect(findNodeById(doc, 'fixture-0-2-1')?.title).toBe('Leaf');
  });

  it('findNodePath returns correct ancestry', () => {
    const path = findNodePath(doc, 'fixture-0-2-1');
    expect(path).toEqual(['Root Topic', 'Child B', 'Leaf']);
  });

  it('case-insensitive fuzzy search via lowercasing', () => {
    const { matched } = fuzzyMatch('CHILD A'.toLowerCase(), 'Child A'.toLowerCase());
    expect(matched).toBe(true);
  });
});
