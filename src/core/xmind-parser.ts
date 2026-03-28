/**
 * xmind-parser.ts
 *
 * Parses a .xmind file buffer → XMindDocument.
 * Supports both formats:
 *   - content.xml  (XMind 8 / XMind 25.x, preferred)
 *   - content.json (XMind Zen fallback)
 */

import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { XMindDocument, XMindSheet, XMindTopic, XMindRelationship, XMindTask } from './types.js';
import { XmindError } from '../utils/errors.js';

// ─── Public API ────────────────────────────────────────────────────────────

export function parseXmindBuffer(buffer: ArrayBuffer): XMindDocument {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new XmindError('CORRUPT_FILE', 'Failed to unzip: not a valid ZIP/XMind archive');
  }

  if ('content.xml' in files) {
    return parseContentXml(strFromU8(files['content.xml']));
  }
  if ('content.json' in files) {
    try {
      return parseContentJson(JSON.parse(strFromU8(files['content.json'])));
    } catch (e) {
      throw new XmindError('PARSE_ERROR', `Invalid content.json: ${e}`);
    }
  }
  throw new XmindError('CORRUPT_FILE', 'Neither content.xml nor content.json found');
}

// ─── XML parser ────────────────────────────────────────────────────────────

export function parseContentXml(xml: string): XMindDocument {
  const parser = new XMLParser({
    ignoreAttributes:    false,
    attributeNamePrefix: '@_',
    isArray: (name) =>
      ['sheet', 'topic', 'topics', 'label', 'marker-ref', 'relationship'].includes(name),
  });

  let root: any;
  try {
    root = parser.parse(xml);
  } catch (e) {
    throw new XmindError('PARSE_ERROR', `XML parse error: ${e}`);
  }

  const xmap = root['xmap-content'];
  if (!xmap) throw new XmindError('PARSE_ERROR', 'Missing <xmap-content>');

  const rawSheets: any[] = Array.isArray(xmap.sheet)
    ? xmap.sheet
    : xmap.sheet ? [xmap.sheet] : [];

  return { sheets: rawSheets.map(parseXmlSheet) };
}

function parseXmlSheet(raw: any): XMindSheet {
  const rootRaw = Array.isArray(raw.topic) ? raw.topic[0] : raw.topic;
  const sheet: XMindSheet = {
    id:        raw['@_id']   ?? crypto.randomUUID(),
    title:     raw.title     ?? 'Untitled',
    rootTopic: parseXmlTopic(rootRaw),
  };

  // Relationships
  const relNode = raw.relationships?.relationship;
  if (relNode && Array.isArray(relNode) && relNode.length > 0) {
    sheet.relationships = relNode.map((r: any): XMindRelationship => ({
      id:     r['@_id']   ?? crypto.randomUUID(),
      end1Id: r['@_end1'] ?? '',
      end2Id: r['@_end2'] ?? '',
      title:  r.title,
    }));
  }

  return sheet;
}


function parseXmlTopic(raw: any): XMindTopic {
  if (!raw) return { id: crypto.randomUUID(), title: '' };

  const topic: XMindTopic = {
    id:    raw['@_id'] ?? crypto.randomUUID(),
    title: raw.title   ?? '',
  };

  if (raw['@_structure-class']) topic.structureClass = raw['@_structure-class'];

  // Children: two formats are valid:
  //   1. Builder format: <children><topics type="attached"><topic>…</topics></children>
  //   2. Simple format:  <children><topic>…<topic>…</children>  (used by tests + some editors)
  const childrenNode = raw.children;
  if (childrenNode) {
    const children: XMindTopic[] = [];

    if (childrenNode.topics) {
      // Format 1: wrapped in <topics type="...">
      const topicsArr: any[] = Array.isArray(childrenNode.topics)
        ? childrenNode.topics
        : [childrenNode.topics];
      for (const block of topicsArr) {
        const type      = block['@_type'];
        const topicList = Array.isArray(block.topic)
          ? block.topic
          : block.topic ? [block.topic] : [];
        for (const t of topicList) {
          const child = parseXmlTopic(t);
          if (type === 'callout') child._isCallout = true;
          children.push(child);
        }
      }
    } else if (childrenNode.topic) {
      // Format 2: direct <topic> children (simple/test format)
      const topicList = Array.isArray(childrenNode.topic)
        ? childrenNode.topic
        : [childrenNode.topic];
      for (const t of topicList) children.push(parseXmlTopic(t));
    }

    if (children.length > 0) topic.children = children;
  }

  // Tasks — stored as <task status="done" priority="1" progress="100" .../>
  if (raw.task) {
    const t = raw.task;
    const task: XMindTask = {};
    if (t['@_status'])   task.status   = t['@_status'] as XMindTask['status'];
    if (t['@_priority']) task.priority = Number(t['@_priority']) as XMindTask['priority'];
    if (t['@_progress']) task.progress = Number(t['@_progress']);
    if (t['@_due'])      task.due      = t['@_due'];
    if (t['@_assignee']) task.assignee = t['@_assignee'];
    topic.tasks = task;
  }

  // Notes
  if (raw.notes?.plain) {
    topic.notes = { plain: String(raw.notes.plain) };
  }

  // Markers
  const refs = raw['marker-refs']?.['marker-ref'];
  if (refs) {
    const list = Array.isArray(refs) ? refs : [refs];
    topic.markers = list.map((r: any) => r['@_marker-id']).filter(Boolean);
  }

  // Labels
  const lbls = raw.labels?.label;
  if (lbls) {
    topic.labels = (Array.isArray(lbls) ? lbls : [lbls]).map(String);
  }

  if (raw['xlink:href']) topic.href = raw['xlink:href'];

  return topic;
}

// ─── JSON parser (XMind Zen fallback) ──────────────────────────────────────

function parseContentJson(arr: any[]): XMindDocument {
  if (!Array.isArray(arr)) {
    throw new XmindError('PARSE_ERROR', 'content.json root must be an array');
  }
  return { sheets: arr.map(parseJsonSheet) };
}

function parseJsonSheet(raw: any): XMindSheet {
  return {
    id:        raw.id    ?? crypto.randomUUID(),
    title:     raw.title ?? 'Untitled',
    rootTopic: parseJsonTopic(raw.rootTopic),
  };
}

function parseJsonTopic(raw: any): XMindTopic {
  if (!raw) return { id: crypto.randomUUID(), title: '' };

  const topic: XMindTopic = {
    id:    raw.id    ?? crypto.randomUUID(),
    title: raw.title ?? '',
  };

  if (raw.structureClass) topic.structureClass = raw.structureClass;
  if (raw.href)           topic.href = raw.href;
  if (raw.labels)         topic.labels = raw.labels;

  // markers: [{markerId:"task-done"}] → ["task-done"]
  if (raw.markers) {
    topic.markers = (raw.markers as any[]).map((m) =>
      typeof m === 'string' ? m : m.markerId ?? String(m)
    );
  }

  // notes: {plain:{content:"..."}} or {plain:"..."}
  if (raw.notes?.plain) {
    const p = raw.notes.plain;
    topic.notes = { plain: typeof p === 'string' ? p : (p.content ?? '') };
  }

  const attached = raw.children?.attached ?? [];
  if (attached.length > 0) {
    topic.children = (attached as any[]).map(parseJsonTopic);
  }

  return topic;
}
