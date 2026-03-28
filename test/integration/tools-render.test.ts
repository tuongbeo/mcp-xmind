// test/integration/tools-render.test.ts
import { describe, it, expect } from 'vitest';
import { toMarkmapMarkdown, buildMarkmapHtml } from '../../src/core/xmind-exporter.js';
import type { XMindSheet, XMindTopic } from '../../src/core/types.js';

// ─── Minimal fixture ───────────────────────────────────────────────────────────

const ROOT: XMindTopic = {
  id: 'root-0',
  title: 'mcp-xmind Architecture',
  children: [
    {
      id: 'cf-0', title: 'CF Workers',
      children: [
        { id: 'idx-0', title: 'index.ts', children: [{ id: 'mcp-0', title: 'MCP handler' }, { id: 'hc-0', title: 'Health check' }] },
        { id: 'srv-0', title: 'server.ts', children: [{ id: 'reg-0', title: 'Tool registry' }] },
      ],
    },
    {
      id: 'stor-0', title: 'Storage',
      children: [
        { id: 'kv-0', title: 'KV Store', children: [{ id: 'meta-0', title: 'Metadata index' }, { id: 'blob-0', title: 'File blobs' }] },
      ],
    },
    {
      id: 'core-0', title: 'Core',
      children: [
        { id: 'parse-0', title: 'Parser' },
        { id: 'build-0', title: 'Builder' },
        { id: 'mut-0', title: 'Mutator', tasks: { status: 'in-progress' } },
        { id: 'exp-0', title: 'Exporter', tasks: { status: 'done' } },
      ],
    },
  ],
};

const SHEET: XMindSheet = { id: 'sheet-0', title: 'Tech Architecture', rootTopic: ROOT };

// ─── toMarkmapMarkdown ─────────────────────────────────────────────────────────

describe('toMarkmapMarkdown', () => {
  it('root topic becomes h1', () => {
    const md = toMarkmapMarkdown(SHEET);
    expect(md.split('\n')[0]).toBe('# mcp-xmind Architecture');
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
    // Build a 7-level deep sheet
    const deep: XMindSheet = {
      id: 's', title: 'Deep',
      rootTopic: { id: 'r', title: 'L1', children: [{ id: 'c1', title: 'L2', children: [
        { id: 'c2', title: 'L3', children: [{ id: 'c3', title: 'L4', children: [
          { id: 'c4', title: 'L5', children: [{ id: 'c5', title: 'L6', children: [
            { id: 'c6', title: 'L7 deep' }
          ]}]}
        ]}]}
      ]}]},
    };
    const md = toMarkmapMarkdown(deep);
    expect(md).toMatch(/^- L7 deep/m);
  });

  it('respects maxDepth — no h3 when maxDepth=2', () => {
    const md = toMarkmapMarkdown(SHEET, { maxDepth: 2 });
    expect(md).toMatch(/^## /m);
    expect(md).not.toMatch(/^### /m);
  });

  it('includes task status icons when includeTasks=true', () => {
    const md = toMarkmapMarkdown(SHEET, { includeTasks: true });
    expect(md).toContain('◑'); // in-progress
    expect(md).toContain('☑'); // done
  });

  it('omits task icons when includeTasks=false', () => {
    const md = toMarkmapMarkdown(SHEET, { includeTasks: false });
    expect(md).not.toContain('☑');
    expect(md).not.toContain('◑');
  });

  it('appends notes when includeNotes=true', () => {
    const sheetWithNotes: XMindSheet = {
      id: 's', title: 'Notes',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'This is a note.' }, children: [] },
    };
    const md = toMarkmapMarkdown(sheetWithNotes, { includeNotes: true });
    expect(md).toContain('*This is a note.*');
  });

  it('omits notes when includeNotes=false (default)', () => {
    const sheetWithNotes: XMindSheet = {
      id: 's', title: 'Notes',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'Hidden note.' }, children: [] },
    };
    const md = toMarkmapMarkdown(sheetWithNotes, { includeNotes: false });
    expect(md).not.toContain('Hidden note.');
  });
});

// ─── buildMarkmapHtml ──────────────────────────────────────────────────────────

describe('buildMarkmapHtml', () => {
  const md = toMarkmapMarkdown(SHEET);

  it('returns a complete HTML document', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes markmap-autoloader from jsdelivr CDN', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('cdn.jsdelivr.net/npm/markmap-autoloader');
  });

  it('embeds markdown inside <script type="text/template">', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('type="text/template"');
    expect(html).toContain('# mcp-xmind Architecture');
  });

  it('includes markmap frontmatter with autoFit and duration', () => {
    const html = buildMarkmapHtml(md, 'Test');
    expect(html).toContain('autoFit: true');
    expect(html).toContain('duration: 300');
    expect(html).toContain('initialExpandLevel: 2');
  });

  it('applies colorFreezeLevel: 6 for colorful theme', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'colorful' });
    expect(html).toContain('colorFreezeLevel: 6');
    expect(html).toContain('#E24B4A');
  });

  it('applies colorFreezeLevel: 2 for dark theme', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'dark' });
    expect(html).toContain('colorFreezeLevel: 2');
    expect(html).toContain('#7F77DD');
  });

  it('applies forest palette for forest theme', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'forest' });
    expect(html).toContain('#1D9E75');
  });

  it('escapes title HTML entities', () => {
    const html = buildMarkmapHtml(md, 'A & B <Test>');
    expect(html).toContain('A &amp; B &lt;Test&gt;');
    expect(html).not.toContain('<Test>');
  });

  it('uses custom maxWidth when provided', () => {
    const html = buildMarkmapHtml(md, 'Test', { maxWidth: 500 });
    expect(html).toContain('maxWidth: 500');
  });
});
