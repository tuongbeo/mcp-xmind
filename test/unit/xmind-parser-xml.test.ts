// test/unit/xmind-parser-xml.test.ts
// Covers the XMind 8 XML path (content.xml) in xmind-parser.ts
import { describe, it, expect } from 'vitest';
import { parseContentXml } from '../../src/core/xmind-parser.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { buildXmindZip } from '../../src/utils/zip.js';
import { XmindError } from '../../src/utils/errors.js';

// Minimal valid XMind 8 XML
// Parser expects <children><topic> direct (no <topics> wrapper)
function makeXml(sheetTitle: string, rootTitle: string, children = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content version="2.0">
  <sheet id="s1">
    <title>${sheetTitle}</title>
    <topic id="root1">
      <title>${rootTitle}</title>
      <children>${children}</children>
    </topic>
  </sheet>
</xmap-content>`;
}

describe('parseContentXml — XMind 8 format', () => {
  it('parses a single sheet with root topic', () => {
    const doc = parseContentXml(makeXml('My Sheet', 'Root Topic'));
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].title).toBe('My Sheet');
    expect(doc.sheets[0].rootTopic.title).toBe('Root Topic');
    expect(doc.sheets[0].rootTopic.id).toBe('root1');
  });

  it('parses child topics correctly', () => {
    const children = `
      <topic id="c1"><title>Child A</title></topic>
      <topic id="c2"><title>Child B</title></topic>
    `;
    const doc = parseContentXml(makeXml('Sheet', 'Root', children));
    expect(doc.sheets[0].rootTopic.children).toHaveLength(2);
    expect(doc.sheets[0].rootTopic.children?.[0].title).toBe('Child A');
    expect(doc.sheets[0].rootTopic.children?.[1].title).toBe('Child B');
  });

  it('parses notes from XML', () => {
    const children = `<topic id="c1"><title>T</title><notes><plain>Note text</plain></notes></topic>`;
    const doc = parseContentXml(makeXml('S', 'Root', children));
    expect(doc.sheets[0].rootTopic.children?.[0].notes?.plain).toBe('Note text');
  });

  it('handles multiple sheets', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content version="2.0">
  <sheet id="s1"><title>Sheet 1</title><topic id="r1"><title>Root 1</title></topic></sheet>
  <sheet id="s2"><title>Sheet 2</title><topic id="r2"><title>Root 2</title></topic></sheet>
</xmap-content>`;
    const doc = parseContentXml(xml);
    expect(doc.sheets).toHaveLength(2);
    expect(doc.sheets[0].title).toBe('Sheet 1');
    expect(doc.sheets[1].title).toBe('Sheet 2');
  });

  it('uses fallback IDs when @id is absent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content><sheet><title>S</title><topic><title>T</title></topic></sheet></xmap-content>`;
    const doc = parseContentXml(xml);
    expect(doc.sheets[0].rootTopic.id).toBeTruthy();
  });

  it('throws PARSE_ERROR for invalid XML', () => {
    expect(() => parseContentXml('<not valid xml <<<')).toThrow(XmindError);
  });

  it('throws PARSE_ERROR when xmap-content element is missing', () => {
    expect(() => parseContentXml('<root><other/></root>')).toThrow(XmindError);
  });
});

describe('parseXmindBuffer — content.xml path', () => {
  it('parses a buffer containing content.xml (XMind 8)', () => {
    const xmlContent = makeXml('XML Sheet', 'XML Root');
    const files: Record<string, string> = { 'content.xml': xmlContent };
    const buf = buildXmindZip(files).buffer as ArrayBuffer;
    const doc = parseXmindBuffer(buf);
    expect(doc.sheets[0].rootTopic.title).toBe('XML Root');
  });

  it('throws CORRUPT_FILE when neither content.json nor content.xml found', () => {
    const files: Record<string, string> = { 'manifest.json': '{}' };
    const buf = buildXmindZip(files).buffer as ArrayBuffer;
    expect(() => parseXmindBuffer(buf)).toThrow(XmindError);
  });

  it('throws CORRUPT_FILE for invalid zip bytes', () => {
    const bad = new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer;
    expect(() => parseXmindBuffer(bad)).toThrow(XmindError);
  });

  it('throws PARSE_ERROR for malformed content.json', () => {
    const files: Record<string, string> = { 'content.json': 'NOT JSON {{{{' };
    const buf = buildXmindZip(files).buffer as ArrayBuffer;
    expect(() => parseXmindBuffer(buf)).toThrow(XmindError);
  });

  it('throws PARSE_ERROR when content.json is not an array', () => {
    const files: Record<string, string> = { 'content.json': '{"not":"array"}' };
    const buf = buildXmindZip(files).buffer as ArrayBuffer;
    expect(() => parseXmindBuffer(buf)).toThrow(XmindError);
  });
});
