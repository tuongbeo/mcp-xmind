import { XMLParser } from 'fast-xml-parser';
import { unzipXmind } from '../utils/zip.js';
import { XmindError } from '../utils/errors.js';
import type {
  XMindDocument,
  XMindSheet,
  XMindTopic,
  XMindRelationship,
  XMindTask,
  LayoutType,
} from './types.js';

const decoder = new TextDecoder();

export function parseXmindBuffer(buffer: ArrayBuffer): XMindDocument {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipXmind(buffer);
  } catch {
    throw new XmindError('CORRUPT_FILE', 'Failed to unzip .xmind file');
  }

  if ('content.json' in files) {
    const text = decoder.decode(files['content.json']);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new XmindError('PARSE_ERROR', 'Failed to parse content.json');
    }
    return parseContentJson(json);
  }

  if ('content.xml' in files) {
    const xml = decoder.decode(files['content.xml']);
    return parseContentXml(xml);
  }

  throw new XmindError('CORRUPT_FILE', 'No content.json or content.xml found in .xmind file');
}

function parseContentJson(json: unknown): XMindDocument {
  if (!Array.isArray(json)) {
    throw new XmindError('PARSE_ERROR', 'content.json must be an array of sheets');
  }

  const sheets: XMindSheet[] = json.map((rawSheet: unknown, idx: number) => {
    const sheet = rawSheet as Record<string, unknown>;
    const id = String(sheet.id ?? `sheet-${idx}`);
    const title = String(sheet.title ?? `Sheet ${idx + 1}`);
    const rootTopicRaw = sheet.rootTopic as Record<string, unknown>;
    if (!rootTopicRaw) {
      throw new XmindError('PARSE_ERROR', `Sheet ${idx} has no rootTopic`);
    }
    const rootTopic = parseTopicJson(rootTopicRaw, `${idx}-0-0`);
    const relationships = parseRelationshipsJson(sheet.relationships);
    const theme = typeof sheet.theme === 'string' ? sheet.theme : undefined;
    const layout = parseLayout(sheet.structureClass);

    return { id, title, rootTopic, relationships, theme, layout };
  });

  return { sheets };
}

function parseTopicJson(raw: Record<string, unknown>, fallbackId: string): XMindTopic {
  const id = String(raw.id ?? fallbackId);
  const title = String(raw.title ?? '');

  const topic: XMindTopic = { id, title };

  if (raw.children && typeof raw.children === 'object') {
    const attached = (raw.children as Record<string, unknown>).attached;
    if (Array.isArray(attached)) {
      topic.children = attached.map((c: unknown, i: number) =>
        parseTopicJson(c as Record<string, unknown>, `${id}-${i}`)
      );
    }
  }

  if (raw.notes && typeof raw.notes === 'object') {
    const n = raw.notes as Record<string, unknown>;
    topic.notes = {};
    if (typeof n.plain === 'object' && n.plain !== null) {
      topic.notes.plain = String((n.plain as Record<string, unknown>).content ?? '');
    } else if (typeof n.plain === 'string') {
      topic.notes.plain = n.plain;
    }
    if (typeof n.html === 'string') topic.notes.html = n.html;
  }

  if (Array.isArray(raw.labels)) {
    topic.labels = raw.labels.map(String);
  }

  if (Array.isArray(raw.markers)) {
    topic.markers = (raw.markers as Array<Record<string, unknown>>).map((m) =>
      String(m.markerId ?? m)
    );
  }

  const taskData = extractTaskFromMarkers(topic.markers ?? []);
  if (taskData || raw.task) {
    topic.tasks = { ...(taskData ?? {}), ...(raw.task as XMindTask ?? {}) };
  }

  if (typeof raw.href === 'string') topic.href = raw.href;
  if (typeof raw.callout === 'string') topic.callout = raw.callout;
  if (raw.branch === 'folded' || raw.branch === 'open') topic.branch = raw.branch;
  if (typeof raw.structureClass === 'string') topic.structureClass = raw.structureClass;

  return topic;
}

function extractTaskFromMarkers(markers: string[]): XMindTask | null {
  const task: XMindTask = {};
  let hasTask = false;

  for (const marker of markers) {
    if (marker === 'task-done') { task.status = 'done'; hasTask = true; }
    else if (marker === 'task-todo') { task.status = 'todo'; hasTask = true; }
    else if (marker === 'task-inf') { task.status = 'in-progress'; hasTask = true; }
    else if (marker.startsWith('priority-')) {
      const p = parseInt(marker.replace('priority-', ''));
      if (p >= 1 && p <= 3) { task.priority = p as 1|2|3; hasTask = true; }
    }
  }

  return hasTask ? task : null;
}

function parseRelationshipsJson(raw: unknown): XMindRelationship[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((r: unknown) => {
    const rel = r as Record<string, unknown>;
    return {
      id: String(rel.id ?? ''),
      end1Id: String(rel.end1Id ?? ''),
      end2Id: String(rel.end2Id ?? ''),
      title: typeof rel.title === 'string' ? rel.title : undefined,
    };
  });
}

function parseLayout(structureClass: unknown): LayoutType | undefined {
  if (typeof structureClass !== 'string') return undefined;
  if (structureClass.includes('fishbone')) return 'fishbone';
  if (structureClass.includes('org-chart') || structureClass.includes('orgchart')) return 'org-chart';
  if (structureClass.includes('timeline')) return 'timeline';
  if (structureClass.includes('tree-table')) return 'tree-table';
  return 'map';
}

export function parseContentXml(xml: string): XMindDocument {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['sheet', 'topic', 'children', 'relationship'].includes(name),
  });

  let result: Record<string, unknown>;
  try {
    result = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new XmindError('PARSE_ERROR', 'Failed to parse content.xml');
  }

  const xmap = result['xmap-content'] as Record<string, unknown> | undefined;
  if (!xmap) throw new XmindError('PARSE_ERROR', 'Invalid XMind 8 XML format');

  const rawSheets = Array.isArray(xmap.sheet) ? xmap.sheet : [xmap.sheet];
  const sheets: XMindSheet[] = rawSheets.map((rawSheet: unknown, idx: number) => {
    const sheet = rawSheet as Record<string, unknown>;
    return parseSheetXml(sheet, idx);
  });

  return { sheets };
}

function parseSheetXml(sheet: Record<string, unknown>, idx: number): XMindSheet {
  const id = String((sheet as Record<string, unknown>)['@_id'] ?? `sheet-${idx}`);
  const title = String(sheet.title ?? `Sheet ${idx + 1}`);
  const rootTopics = Array.isArray(sheet.topic) ? sheet.topic : [sheet.topic];
  const rootTopic = parseTopicXml(rootTopics[0] as Record<string, unknown>, `${idx}-0-0`);

  return { id, title, rootTopic };
}

function parseTopicXml(raw: Record<string, unknown>, fallbackId: string): XMindTopic {
  const id = String((raw as Record<string, unknown>)['@_id'] ?? fallbackId);
  const title = String(raw.title ?? '');
  const topic: XMindTopic = { id, title };

  const childrenRaw = raw.children as Record<string, unknown> | undefined;
  if (childrenRaw && childrenRaw.topic) {
    const topics = Array.isArray(childrenRaw.topic) ? childrenRaw.topic : [childrenRaw.topic];
    topic.children = topics.map((c: unknown, i: number) =>
      parseTopicXml(c as Record<string, unknown>, `${id}-${i}`)
    );
  }

  if (raw.notes) {
    const notes = raw.notes as Record<string, unknown>;
    topic.notes = { plain: String(notes.plain ?? '') };
  }

  return topic;
}
