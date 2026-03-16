// test/unit/xmind-mutator.test.ts
import { describe, it, expect } from 'vitest';
import {
  findNodeById, findNodePath, countNodes, isDescendant,
  updateNode, addNode, moveNode, deleteNode, deleteSheet,
} from '../../src/core/xmind-mutator.js';
import { simpleDoc, multiSheetDoc } from '../fixtures/generate.js';

describe('xmind-mutator — read helpers', () => {
  it('findNodeById returns correct node', () => {
    const n = findNodeById(simpleDoc, 'fixture-0-1-0');
    expect(n?.title).toBe('Child A');
  });

  it('findNodeById returns null for unknown id', () => {
    expect(findNodeById(simpleDoc, 'nonexistent')).toBeNull();
  });

  it('findNodePath returns full path', () => {
    const path = findNodePath(simpleDoc, 'fixture-0-2-0');
    expect(path).toEqual(['Root Topic', 'Child A', 'Grandchild']);
  });

  it('countNodes counts all nodes', () => {
    expect(countNodes(simpleDoc)).toBe(5);
  });

  it('isDescendant detects ancestry', () => {
    expect(isDescendant(simpleDoc, 'fixture-0-1-0', 'fixture-0-2-0')).toBe(true);
    expect(isDescendant(simpleDoc, 'fixture-0-1-1', 'fixture-0-2-0')).toBe(false);
  });
});

describe('xmind-mutator — updateNode', () => {
  it('updates title', () => {
    const updated = updateNode(simpleDoc, 'fixture-0-1-0', { title: 'Updated A' });
    expect(findNodeById(updated, 'fixture-0-1-0')?.title).toBe('Updated A');
  });

  it('deep-merges notes', () => {
    const d1 = updateNode(simpleDoc, 'fixture-0-0-0', { notes: { plain: 'hello' } });
    const d2 = updateNode(d1, 'fixture-0-0-0', { notes: { html: '<b>world</b>' } });
    const n = findNodeById(d2, 'fixture-0-0-0');
    expect(n?.notes?.plain).toBe('hello');
    expect(n?.notes?.html).toBe('<b>world</b>');
  });

  it('throws NODE_NOT_FOUND for unknown id', () => {
    expect(() => updateNode(simpleDoc, 'bad-id', { title: 'x' })).toThrowError('Node not found');
  });
});

describe('xmind-mutator — addNode', () => {
  it('appends child by default', () => {
    const { doc } = addNode(simpleDoc, 'fixture-0-1-0', { title: 'New Leaf' });
    const parent = findNodeById(doc, 'fixture-0-1-0');
    expect(parent?.children).toHaveLength(2);
    expect(parent?.children![1].title).toBe('New Leaf');
  });

  it('inserts at position 0', () => {
    const { doc } = addNode(simpleDoc, 'fixture-0-0-0', { title: 'First' }, 0);
    expect(findNodeById(doc, 'fixture-0-0-0')?.children![0].title).toBe('First');
  });

  it('throws PARENT_NOT_FOUND', () => {
    expect(() => addNode(simpleDoc, 'bad-id', { title: 'x' })).toThrowError('Parent node not found');
  });
});

describe('xmind-mutator — moveNode', () => {
  it('moves node to new parent', () => {
    const moved = moveNode(simpleDoc, 'fixture-0-1-0', 'fixture-0-1-1');
    expect(findNodeById(moved, 'fixture-0-1-1')?.children?.some(c => c.id === 'fixture-0-1-0')).toBe(true);
    expect(findNodeById(moved, 'fixture-0-0-0')?.children?.some(c => c.id === 'fixture-0-1-0')).toBe(false);
  });

  it('throws CIRCULAR_REFERENCE when moving to descendant', () => {
    expect(() => moveNode(simpleDoc, 'fixture-0-1-0', 'fixture-0-2-0')).toThrowError('Cannot move node to one of its own');
  });
});

describe('xmind-mutator — deleteNode', () => {
  it('deletes leaf node', () => {
    const { doc, deletedCount } = deleteNode(simpleDoc, 'fixture-0-2-0');
    expect(deletedCount).toBe(1);
    expect(findNodeById(doc, 'fixture-0-2-0')).toBeNull();
  });

  it('re-parents children when deleteChildren=false', () => {
    const { doc } = deleteNode(simpleDoc, 'fixture-0-1-0', false);
    const root = findNodeById(doc, 'fixture-0-0-0');
    expect(root?.children?.some(c => c.id === 'fixture-0-2-0')).toBe(true);
  });

  it('throws CANNOT_DELETE_ROOT', () => {
    expect(() => deleteNode(simpleDoc, 'fixture-0-0-0')).toThrowError('Cannot delete root topic');
  });
});

describe('xmind-mutator — deleteSheet', () => {
  it('deletes a sheet', () => {
    const result = deleteSheet(multiSheetDoc, 1);
    expect(result.sheets).toHaveLength(2);
    expect(result.sheets.every(s => s.id !== 'sheet-1')).toBe(true);
  });

  it('throws LAST_SHEET when only one sheet remains', () => {
    expect(() => deleteSheet(simpleDoc, 0)).toThrowError('Cannot delete the only sheet');
  });
});
