import { buildXmindZip } from '../utils/zip.js';
import type { XMindDocument, XMindSheet, XMindTopic } from './types.js';

/**
 * Builds a .xmind ZIP file from an XMindDocument model.
 * Produces XMind 2023+ content.json format.
 */
export function buildXmindFile(doc: XMindDocument): Uint8Array {
  const contentJson = buildContentJson(doc);
  const files: Record<string, string> = {
    'content.json': JSON.stringify(contentJson),
    'metadata.json': JSON.stringify({ creator: { name: 'mcp-xmind', version: '2.0.0' } }),
  };
  return buildXmindZip(files);
}

function buildContentJson(doc: XMindDocument): unknown[] {
  return doc.sheets.map(buildSheetJson);
}

function buildSheetJson(sheet: XMindSheet): unknown {
  return {
    id: sheet.id,
    title: sheet.title,
    rootTopic: buildTopicJson(sheet.rootTopic),
    ...(sheet.relationships?.length ? { relationships: sheet.relationships } : {}),
    ...(sheet.theme ? { theme: sheet.theme } : {}),
    ...(sheet.layout ? { structureClass: layoutToStructureClass(sheet.layout) } : {}),
  };
}

function buildTopicJson(topic: XMindTopic): unknown {
  const result: Record<string, unknown> = {
    id: topic.id,
    title: topic.title,
  };

  if (topic.children?.length) {
    result.children = { attached: topic.children.map(buildTopicJson) };
  }

  if (topic.notes) {
    result.notes = {
      plain: { content: topic.notes.plain ?? '' },
      ...(topic.notes.html ? { html: topic.notes.html } : {}),
    };
  }

  if (topic.labels?.length) result.labels = topic.labels;

  if (topic.markers?.length) {
    result.markers = topic.markers.map((m) => ({ markerId: m }));
  }

  if (topic.href) result.href = topic.href;
  if (topic.callout) result.callout = topic.callout;
  if (topic.branch) result.branch = topic.branch;
  if (topic.structureClass) result.structureClass = topic.structureClass;

  if (topic.tasks) {
    result.task = topic.tasks;
  }

  return result;
}

function layoutToStructureClass(layout: string): string {
  const map: Record<string, string> = {
    'org-chart': 'org.xmind.ui.orgchart',
    fishbone: 'org.xmind.ui.fishbone',
    timeline: 'org.xmind.ui.timeline',
    'tree-table': 'org.xmind.ui.treetable',
    map: 'org.xmind.ui.map.unbalanced',
  };
  return map[layout] ?? 'org.xmind.ui.map.unbalanced';
}
