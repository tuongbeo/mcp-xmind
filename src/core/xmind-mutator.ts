import { v4 as uuidv4 } from 'uuid';
import { XmindError } from '../utils/errors.js';
import type { XMindDocument, XMindSheet, XMindTopic } from './types.js';

export function findNodeById(doc: XMindDocument, id: string): XMindTopic | null {
  for (const sheet of doc.sheets) {
    const found = findInTopic(sheet.rootTopic, id);
    if (found) return found;
  }
  return null;
}

function findInTopic(topic: XMindTopic, id: string): XMindTopic | null {
  if (topic.id === id) return topic;
  for (const child of topic.children ?? []) {
    const found = findInTopic(child, id);
    if (found) return found;
  }
  return null;
}

export function findNodePath(doc: XMindDocument, id: string): string[] {
  for (const sheet of doc.sheets) {
    const path = findPathInTopic(sheet.rootTopic, id, []);
    if (path) return path;
  }
  return [];
}

function findPathInTopic(topic: XMindTopic, id: string, current: string[]): string[] | null {
  const path = [...current, topic.title];
  if (topic.id === id) return path;
  for (const child of topic.children ?? []) {
    const found = findPathInTopic(child, id, path);
    if (found) return found;
  }
  return null;
}

export function countNodes(doc: XMindDocument): number {
  let count = 0;
  for (const sheet of doc.sheets) {
    count += countInTopic(sheet.rootTopic);
  }
  return count;
}

function countInTopic(topic: XMindTopic): number {
  let count = 1;
  for (const child of topic.children ?? []) {
    count += countInTopic(child);
  }
  return count;
}

export function isDescendant(doc: XMindDocument, ancestorId: string, descendantId: string): boolean {
  const ancestor = findNodeById(doc, ancestorId);
  if (!ancestor) return false;
  return !!findInTopic(ancestor, descendantId);
}

export function updateNode(doc: XMindDocument, id: string, updates: Partial<XMindTopic>): XMindDocument {
  let found = false;
  const sheets = doc.sheets.map((sheet) => ({ ...sheet, rootTopic: updateInTopic(sheet.rootTopic, id, updates, () => { found = true; }) }));
  if (!found) throw new XmindError('NODE_NOT_FOUND', `Node not found: ${id}`);
  return { sheets };
}

function updateInTopic(topic: XMindTopic, id: string, updates: Partial<XMindTopic>, onFound: () => void): XMindTopic {
  if (topic.id === id) {
    onFound();
    const mergedNotes = updates.notes ? { ...(topic.notes ?? {}), ...updates.notes } : topic.notes;
    return { ...topic, ...updates, id: topic.id, notes: mergedNotes };
  }
  if (!topic.children?.length) return topic;
  return { ...topic, children: topic.children.map((c) => updateInTopic(c, id, updates, onFound)) };
}

export function addNode(doc: XMindDocument, parentId: string, topic: Omit<XMindTopic, 'id'>, position?: number): { doc: XMindDocument; newNodeId: string } {
  const newId = uuidv4();
  const newTopic: XMindTopic = { ...topic, id: newId };
  let found = false;
  const sheets = doc.sheets.map((sheet) => ({ ...sheet, rootTopic: addToParent(sheet.rootTopic, parentId, newTopic, position, () => { found = true; }) }));
  if (!found) throw new XmindError('PARENT_NOT_FOUND', `Parent node not found: ${parentId}`);
  return { doc: { sheets }, newNodeId: newId };
}

function addToParent(topic: XMindTopic, parentId: string, newChild: XMindTopic, position: number | undefined, onFound: () => void): XMindTopic {
  if (topic.id === parentId) {
    onFound();
    const children = [...(topic.children ?? [])];
    if (position !== undefined && position >= 0 && position <= children.length) { children.splice(position, 0, newChild); }
    else { children.push(newChild); }
    return { ...topic, children };
  }
  if (!topic.children?.length) return topic;
  return { ...topic, children: topic.children.map((c) => addToParent(c, parentId, newChild, position, onFound)) };
}

export function moveNode(doc: XMindDocument, nodeId: string, newParentId: string, position?: number): XMindDocument {
  if (nodeId === newParentId) throw new XmindError('CIRCULAR_REFERENCE', 'Cannot move node to itself');
  if (isDescendant(doc, nodeId, newParentId)) throw new XmindError('CIRCULAR_REFERENCE', 'Cannot move node to one of its own descendants');
  const node = findNodeById(doc, nodeId);
  if (!node) throw new XmindError('NODE_NOT_FOUND', `Node not found: ${nodeId}`);
  for (const sheet of doc.sheets) { if (sheet.rootTopic.id === nodeId) throw new XmindError('CANNOT_DELETE_ROOT', 'Cannot move root topic of a sheet'); }
  const detached = detachNode(doc, nodeId);
  const { doc: result } = addNodeDirect(detached, newParentId, node, position);
  return result;
}

function detachNode(doc: XMindDocument, nodeId: string): XMindDocument {
  return { sheets: doc.sheets.map((s) => ({ ...s, rootTopic: detachFromTopic(s.rootTopic, nodeId) })) };
}

function detachFromTopic(topic: XMindTopic, nodeId: string): XMindTopic {
  if (!topic.children?.length) return topic;
  return { ...topic, children: topic.children.filter((c) => c.id !== nodeId).map((c) => detachFromTopic(c, nodeId)) };
}

function addNodeDirect(doc: XMindDocument, parentId: string, node: XMindTopic, position?: number): { doc: XMindDocument; newNodeId: string } {
  let found = false;
  const sheets = doc.sheets.map((s) => ({ ...s, rootTopic: addToParent(s.rootTopic, parentId, node, position, () => { found = true; }) }));
  if (!found) throw new XmindError('PARENT_NOT_FOUND', `Parent not found: ${parentId}`);
  return { doc: { sheets }, newNodeId: node.id };
}

export function deleteNode(doc: XMindDocument, id: string, deleteChildren = true): { doc: XMindDocument; deletedCount: number } {
  for (const sheet of doc.sheets) { if (sheet.rootTopic.id === id) throw new XmindError('CANNOT_DELETE_ROOT', 'Cannot delete root topic of a sheet'); }
  const node = findNodeById(doc, id);
  if (!node) throw new XmindError('NODE_NOT_FOUND', `Node not found: ${id}`);
  const deletedCount = deleteChildren ? countInTopic(node) : 1;
  let sheets: XMindSheet[];
  if (!deleteChildren && node.children?.length) {
    sheets = doc.sheets.map((s) => ({ ...s, rootTopic: reparentChildren(s.rootTopic, id) }));
  } else {
    sheets = doc.sheets.map((s) => ({ ...s, rootTopic: detachFromTopic(s.rootTopic, id), relationships: s.relationships?.filter((r) => r.end1Id !== id && r.end2Id !== id) }));
  }
  return { doc: { sheets }, deletedCount };
}

function reparentChildren(topic: XMindTopic, targetId: string): XMindTopic {
  if (!topic.children?.length) return topic;
  const targetIdx = topic.children.findIndex((c) => c.id === targetId);
  if (targetIdx !== -1) {
    const grandchildren = topic.children[targetIdx].children ?? [];
    return { ...topic, children: [...topic.children.slice(0, targetIdx), ...grandchildren, ...topic.children.slice(targetIdx + 1)] };
  }
  return { ...topic, children: topic.children.map((c) => reparentChildren(c, targetId)) };
}

export function deleteSheet(doc: XMindDocument, sheetIndex: number): XMindDocument {
  if (doc.sheets.length <= 1) throw new XmindError('LAST_SHEET', 'Cannot delete the only sheet in a document');
  if (sheetIndex < 0 || sheetIndex >= doc.sheets.length) throw new XmindError('SHEET_NOT_FOUND', `Sheet index out of range: ${sheetIndex}`);
  return { sheets: doc.sheets.filter((_, i) => i !== sheetIndex) };
}
