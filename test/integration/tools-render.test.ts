// test/integration/tools-render.test.ts
import { describe, it, expect } from 'vitest';
import { toMarkmapMarkdown, buildMarkmapHtml } from '../../src/core/xmind-exporter.js';
import type { XMindSheet, XMindTopic } from '../../src/core/types.js';

const ROOT: XMindTopic = {
  id: 'root-0', title: 'mcp-xmind Architecture',
  children: [
    { id: 'cf-0', title: 'CF Workers', children: [
      { id: 'idx-0', title: 'index.ts', children: [
        { id: 'mcp-0', title: 'MCP handler' },
        { id: 'hc-0', title: 'Health check' },
      ]},
      { id: 'srv-0', title: 'server.ts', children: [
        { id: 'reg-0', title: 'Tool registry' },
      ]},
    ]},
    { id: 'stor-0', title: 'Storage', children: [
      { id: 'kv-0', title: 'KV Store', children: [
        { id: 'meta-0', title: 'Metadata index' },
        { id: 'blob-0', title: 'File blobs' },
      ]},
    ]},
    { id: 'core-0', title: 'Core', children: [
      { id: 'parse-0', title: 'Parser' },
      { id: 'build-0', title: 'Builder' },
      { id: 'mut-0', title: 'Mutator', tasks: { status: 'in-progress' } },
      { id: 'exp-0', title: 'Exporter', tasks: { status: 'done' } },
    ]},
  ],
};
const SHEET: XMindSheet = { id: 'sheet-0', title: 'Tech Architecture', rootTopic: ROOT };

// ─── toMarkmapMarkdown ─────────────────────────────────────────────────────

describe('toMarkmapMarkdown', () => {
  it('root topic becomes h1', () => {
    expect(toMarkmapMarkdown(SHEET).split('\n')[0]).toBe('# mcp-xmind Architecture');
  });
  it('depth-1 children become h2', () => {
    const md = toMarkmapMarkdown(SHEET);
    expect(md).toMatch(/^## CF Workers/m);
    expect(md).toMatch(/^## Storage/m);
    expect(md).toMatch(/^## Core/m);
  });
  it('depth-2 children become h3', () => {
    const md = toMarkmapMarkdown(SHEET);
    expect(md).toMatch(/^### index\.ts/m);
    expect(md).toMatch(/^### KV Store/m);
  });
  it('leaf nodes become h4+', () => {
    const md = toMarkmapMarkdown(SHEET);
    expect(md).toMatch(/^#### MCP handler/m);
    expect(md).toMatch(/^#### Metadata index/m);
  });
  it('depth > 6 uses list item prefix "-"', () => {
    const deep: XMindSheet = {
      id: 's', title: 'Deep',
      rootTopic: { id: 'r', title: 'L1', children: [{ id: 'c1', title: 'L2', children: [
        { id: 'c2', title: 'L3', children: [{ id: 'c3', title: 'L4', children: [
          { id: 'c4', title: 'L5', children: [{ id: 'c5', title: 'L6', children: [
            { id: 'c6', title: 'L7 deep' },
          ]}]},
        ]}]},
      ]}]},
    };
    expect(toMarkmapMarkdown(deep)).toMatch(/^- L7 deep/m);
  });
  it('respects maxDepth — no h3 when maxDepth=2', () => {
    const md = toMarkmapMarkdown(SHEET, { maxDepth: 2 });
    expect(md).toMatch(/^## /m);
    expect(md).not.toMatch(/^### /m);
  });
  it('includes task status icons when includeTasks=true', () => {
    const md = toMarkmapMarkdown(SHEET, { includeTasks: true });
    expect(md).toContain('◑');
    expect(md).toContain('☑');
  });
  it('omits task icons when includeTasks=false', () => {
    const md = toMarkmapMarkdown(SHEET, { includeTasks: false });
    expect(md).not.toContain('☑');
    expect(md).not.toContain('◑');
  });
  it('appends notes when includeNotes=true', () => {
    const s: XMindSheet = { id: 's', title: 'N',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'This is a note.' }, children: [] } };
    expect(toMarkmapMarkdown(s, { includeNotes: true })).toContain('*This is a note.*');
  });
  it('omits notes when includeNotes=false (default)', () => {
    const s: XMindSheet = { id: 's', title: 'N',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'Hidden.' }, children: [] } };
    expect(toMarkmapMarkdown(s, { includeNotes: false })).not.toContain('Hidden.');
  });
});

// ─── buildMarkmapHtml ──────────────────────────────────────────────────────

describe('buildMarkmapHtml', () => {
  const md = toMarkmapMarkdown(SHEET);

  it('returns a complete HTML document', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('loads only markmap-view (no markmap-lib, no autoloader)', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('cdn.jsdelivr.net/npm/markmap-view');
    expect(html).not.toContain('markmap-lib');
    expect(html).not.toContain('markmap-autoloader');
  });

  it('uses custom mdToTree parser, not Transformer import', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('mdToTree');
    // No import of Transformer from markmap-lib
    expect(html).not.toContain("import('https://cdn.jsdelivr.net/npm/markmap-lib");
  });

  it('embeds markdown as JS string (not text/template)', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('# mcp-xmind Architecture');
    expect(html).not.toContain('type="text/template"');
  });

  it('passes colorFreezeLevel and duration to Markmap.create', () => {
    const html = buildMarkmapHtml(md, 'Test');
    expect(html).toContain('colorFreezeLevel:');
    expect(html).toContain('duration: 300');
    expect(html).toContain('initialExpandLevel: 2');
  });

  it('colorful theme: colorFreezeLevel 6 + correct palette', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'colorful' });
    expect(html).toContain('colorFreezeLevel: 6');
    expect(html).toContain('#E24B4A');
  });

  it('dark theme: colorFreezeLevel 2 + correct palette', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'dark' });
    expect(html).toContain('colorFreezeLevel: 2');
    expect(html).toContain('#7F77DD');
  });

  it('forest theme: correct palette', () => {
    expect(buildMarkmapHtml(md, 'Test', { theme: 'forest' })).toContain('#1D9E75');
  });

  it('escapes title HTML entities', () => {
    const html = buildMarkmapHtml(md, 'A & B <Test>');
    expect(html).toContain('A &amp; B &lt;Test&gt;');
    expect(html).not.toContain('<Test>');
  });

  it('uses custom maxWidth when provided', () => {
    expect(buildMarkmapHtml(md, 'Test', { maxWidth: 500 })).toContain('maxWidth: 500');
  });

  it('omits download button when xmindBase64 not provided', () => {
    const html = buildMarkmapHtml(md, 'Test');
    expect(html).not.toContain('Download .xmind');
    expect(html).not.toContain('dlXmind');
  });

  it('includes download button when xmindBase64 is provided', () => {
    const html = buildMarkmapHtml(md, 'Test', { xmindBase64: 'dGVzdA==', fileName: 'my-map.xmind' });
    expect(html).toContain('dl-btn');
    expect(html).toContain('Download .xmind');
    expect(html).toContain('my-map.xmind');
  });

  it('embeds base64 bytes and download function', () => {
    const b64 = 'dGVzdA==';
    const html = buildMarkmapHtml(md, 'Test', { xmindBase64: b64, fileName: 'x.xmind' });
    expect(html).toContain(b64);
    expect(html).toContain('dlXmind');
    expect(html).toContain('atob(');
  });
});
