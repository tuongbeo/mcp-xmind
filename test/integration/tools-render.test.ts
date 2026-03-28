// test/integration/tools-render.test.ts
import { describe, it, expect } from 'vitest';
import { toMarkmapMarkdown, buildMarkmapHtml } from '../../src/core/xmind-exporter.js';
import type { XMindSheet, XMindTopic } from '../../src/core/types.js';

const ROOT: XMindTopic = {
  id: 'r0', title: 'mcp-xmind Architecture',
  children: [
    { id: 'cf0', title: 'CF Workers', children: [
      { id: 'i0', title: 'index.ts', children: [{ id: 'm0', title: 'MCP handler' }, { id: 'h0', title: 'Health check' }] },
      { id: 's0', title: 'server.ts', children: [{ id: 'r1', title: 'Tool registry' }] },
    ]},
    { id: 'st0', title: 'Storage', children: [
      { id: 'kv0', title: 'KV Store', children: [{ id: 'me0', title: 'Metadata index' }, { id: 'bl0', title: 'File blobs' }] },
    ]},
    { id: 'co0', title: 'Core', children: [
      { id: 'pa0', title: 'Parser' }, { id: 'bu0', title: 'Builder' },
      { id: 'mu0', title: 'Mutator', tasks: { status: 'in-progress' } },
      { id: 'ex0', title: 'Exporter', tasks: { status: 'done' } },
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
  });
  it('depth > 6 uses list item prefix', () => {
    const deep: XMindSheet = { id: 's', title: 'D',
      rootTopic: { id: 'r', title: 'L1', children: [{ id: 'c1', title: 'L2', children: [
        { id: 'c2', title: 'L3', children: [{ id: 'c3', title: 'L4', children: [
          { id: 'c4', title: 'L5', children: [{ id: 'c5', title: 'L6', children: [
            { id: 'c6', title: 'L7' }]}]}]}]}]}]} };
    expect(toMarkmapMarkdown(deep)).toMatch(/^- L7/m);
  });
  it('respects maxDepth', () => {
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
  });
  it('appends notes when includeNotes=true', () => {
    const s: XMindSheet = { id: 's', title: 'N',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'A note.' }, children: [] } };
    expect(toMarkmapMarkdown(s, { includeNotes: true })).toContain('*A note.*');
  });
  it('omits notes by default', () => {
    const s: XMindSheet = { id: 's', title: 'N',
      rootTopic: { id: 'r', title: 'Root', notes: { plain: 'Hidden.' }, children: [] } };
    expect(toMarkmapMarkdown(s)).not.toContain('Hidden.');
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

  it('zero CDN/external dependencies', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('markmap');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('import(');
  });

  it('embeds markdown content in the page', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('mcp-xmind Architecture');
  });

  it('contains SVG canvas and renderer', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('<svg');
    expect(html).toContain('function parse(');
    expect(html).toContain('function render(');
    expect(html).toContain('function layout(');
  });

  it('has pan/zoom event listeners', () => {
    const html = buildMarkmapHtml(md, 'Tech Architecture');
    expect(html).toContain('pointerdown');
    expect(html).toContain('pointermove');
    expect(html).toContain('wheel');
  });

  it('applies palette colors from theme', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'colorful' });
    expect(html).toContain('#E24B4A');
  });

  it('dark theme palette', () => {
    const html = buildMarkmapHtml(md, 'Test', { theme: 'dark' });
    expect(html).toContain('#7F77DD');
  });

  it('forest theme palette', () => {
    expect(buildMarkmapHtml(md, 'Test', { theme: 'forest' })).toContain('#1D9E75');
  });

  it('escapes title HTML entities', () => {
    const html = buildMarkmapHtml(md, 'A & B <Test>');
    expect(html).toContain('A &amp; B &lt;Test&gt;');
    expect(html).not.toContain('<Test>');
  });

  it('omits download button when no xmindBase64', () => {
    const html = buildMarkmapHtml(md, 'Test');
    expect(html).not.toContain('Download .xmind');
    expect(html).not.toContain('atob(');
  });

  it('includes download button when xmindBase64 provided', () => {
    const html = buildMarkmapHtml(md, 'Test', { xmindBase64: 'dGVzdA==', fileName: 'x.xmind' });
    expect(html).toContain('Download .xmind');
    expect(html).toContain('x.xmind');
    expect(html).toContain('dGVzdA==');
    expect(html).toContain('atob(');
  });
});
