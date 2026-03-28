/**
 * xmind-builder.ts
 *
 * Builds a valid .xmind file (ZIP archive) from an XMindDocument model.
 *
 * Format: XMind 8 XML — the only format accepted by XMind 25.x desktop.
 * Key requirements confirmed by testing:
 *   1. content.xml  (NOT content.json)
 *   2. ZIP_STORED   (compression level 0 — DEFLATED is rejected)
 *   3. META-INF/manifest.xml  (lists all files)
 *   4. Thumbnails/thumbnail.png  (valid PNG, any size)
 *   5. meta.xml with timestamp
 */

import { zipSync, strToU8 } from 'fflate';
import type { XMindDocument, XMindSheet, XMindTopic } from './types.js';

// ─── Public API ────────────────────────────────────────────────────────────

export function buildXmindFile(doc: XMindDocument): Uint8Array {
  const timestamp = Date.now().toString();

  const files: Record<string, Uint8Array> = {
    'content.xml':              strToU8(buildContentXml(doc, timestamp)),
    'meta.xml':                 strToU8(buildMetaXml(timestamp)),
    'META-INF/manifest.xml':    strToU8(buildManifestXml()),
    'Thumbnails/thumbnail.png': buildThumbnailPng(),
  };

  // level: 0 = STORED (no compression). XMind 25.x rejects DEFLATED archives.
  return zipSync(files, { level: 0 });
}

// ─── content.xml ───────────────────────────────────────────────────────────

function buildContentXml(doc: XMindDocument, timestamp: string): string {
  const sheetsXml = doc.sheets.map((s) => buildSheetXml(s, timestamp)).join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<xmap-content' +
    ' xmlns="urn:xmind:xmap:xmlns:content:2.0"' +
    ' xmlns:fo="http://www.w3.org/1999/XSL/Format"' +
    ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' +
    ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ' xmlns:svg="http://www.w3.org/2000/svg"' +
    ` timestamp="${timestamp}" version="2.0">` +
    sheetsXml +
    '</xmap-content>'
  );
}

function buildSheetXml(sheet: XMindSheet, timestamp: string): string {
  const structAttr = sheet.rootTopic.structureClass
    ? ` structure-class="${esc(sheet.rootTopic.structureClass)}"`
    : '';

  let relsXml = '';
  if (sheet.relationships && sheet.relationships.length > 0) {
    relsXml = '<relationships>';
    for (const rel of sheet.relationships) {
      relsXml += `<relationship id="${esc(rel.id)}" end1="${esc(rel.end1Id)}" end2="${esc(rel.end2Id)}"`;
      relsXml += rel.title ? `><title>${esc(rel.title)}</title></relationship>` : '/>';
    }
    relsXml += '</relationships>';
  }

  return (
    `<sheet id="${esc(sheet.id)}" timestamp="${timestamp}"${structAttr}>` +
    buildTopicXml(sheet.rootTopic, timestamp, true) +
    `<title>${esc(sheet.title)}</title>` +
    relsXml +
    '</sheet>'
  );
}

function buildTopicXml(topic: XMindTopic, timestamp: string, isRoot = false): string {
  let xml = `<topic id="${esc(topic.id)}"`;
  if (isRoot) xml += ` timestamp="${timestamp}"`;
  xml += '>';

  xml += `<title>${esc(topic.title)}</title>`;

  // Children: split into attached vs callout
  const attached = (topic.children ?? []).filter((c) => !c._isCallout);
  const callouts  = (topic.children ?? []).filter((c) =>  c._isCallout);

  if (attached.length > 0) {
    xml += '<children><topics type="attached">';
    for (const child of attached) xml += buildTopicXml(child, timestamp, false);
    xml += '</topics></children>';
  }
  if (callouts.length > 0) {
    xml += '<children><topics type="callout">';
    for (const c of callouts) xml += buildTopicXml(c, timestamp, false);
    xml += '</topics></children>';
  }

  // Notes
  if (topic.notes?.plain) {
    xml += `<notes><plain>${esc(topic.notes.plain)}</plain></notes>`;
  }

  // Tasks — serialized as <task status="..." priority="..." .../>
  if (topic.tasks) {
    const t = topic.tasks;
    let taskXml = '<task';
    if (t.status)   taskXml += ` status="${esc(t.status)}"`;
    if (t.priority !== undefined) taskXml += ` priority="${t.priority}"`;
    if (t.progress !== undefined) taskXml += ` progress="${t.progress}"`;
    if (t.due)      taskXml += ` due="${esc(t.due)}"`;
    if (t.assignee) taskXml += ` assignee="${esc(t.assignee)}"`;
    taskXml += '/>';
    xml += taskXml;
  }

  // Markers  e.g. ["task-done", "priority-1"]
  if (topic.markers && topic.markers.length > 0) {
    xml += '<marker-refs>';
    for (const m of topic.markers) {
      const id = typeof m === 'string' ? m : (m as any).markerId ?? String(m);
      xml += `<marker-ref marker-id="${esc(id)}"/>`;
    }
    xml += '</marker-refs>';
  }

  // Labels
  if (topic.labels && topic.labels.length > 0) {
    xml += '<labels>';
    for (const l of topic.labels) xml += `<label>${esc(l)}</label>`;
    xml += '</labels>';
  }

  // href / link
  if (topic.href) {
    xml += `<xlink:href xmlns:xlink="http://www.w3.org/1999/xlink">${esc(topic.href)}</xlink:href>`;
  }

  xml += '</topic>';
  return xml;
}


// ─── meta.xml ──────────────────────────────────────────────────────────────

function buildMetaXml(timestamp: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<meta xmlns="urn:xmind:xmap:xmlns:meta:2.0" timestamp="${timestamp}" version="2.0">` +
    '<Author><n>XMind MCP Server</n></Author>' +
    '</meta>'
  );
}

// ─── META-INF/manifest.xml ─────────────────────────────────────────────────

function buildManifestXml(): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">' +
    '<file-entry full-path="content.xml" media-type="text/xml"/>' +
    '<file-entry full-path="meta.xml" media-type="text/xml"/>' +
    '<file-entry full-path="Thumbnails/" media-type=""/>' +
    '<file-entry full-path="Thumbnails/thumbnail.png" media-type="image/png"/>' +
    '<file-entry full-path="META-INF/" media-type=""/>' +
    '<file-entry full-path="META-INF/manifest.xml" media-type="text/xml"/>' +
    '</manifest>'
  );
}

// ─── Thumbnail PNG ─────────────────────────────────────────────────────────

/**
 * Returns a minimal valid 1×1 white PNG (67 bytes).
 * XMind only checks the file exists and is valid PNG — size doesn't matter.
 */
function buildThumbnailPng(): Uint8Array {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
