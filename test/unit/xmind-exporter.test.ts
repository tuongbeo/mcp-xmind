// test/unit/xmind-exporter.test.ts
import { describe, it, expect } from 'vitest';
import { exportToMarkdown, exportToJson, exportToHtml } from '../../src/core/xmind-exporter.js';
import { simpleDoc, multiSheetDoc, withTasksDoc } from '../fixtures/generate.js';

describe('exportToMarkdown', () => {
  it('renders sheet title as H1', () => {
    const md = exportToMarkdown(simpleDoc);
    expect(md).toContain('# Simple Sheet');
  });

  it('renders root as H2, children as deeper headings', () => {
    const md = exportToMarkdown(simpleDoc);
    expect(md).toContain('## Root Topic');
    expect(md).toContain('### Child A');
  });

  it('renders single sheet with sheetIndex', () => {
    const md = exportToMarkdown(multiSheetDoc, { sheetIndex: 1 });
    expect(md).toContain('# Sheet 2');
    expect(md).not.toContain('# Sheet 1');
  });

  it('includes notes when includeNotes=true', () => {
    const docWithNotes = {
      ...simpleDoc,
      sheets: [{ ...simpleDoc.sheets[0], rootTopic: { ...simpleDoc.sheets[0].rootTopic, notes: { plain: 'My note' } } }],
    };
    const md = exportToMarkdown(docWithNotes, { includeNotes: true });
    expect(md).toContain('> My note');
  });

  it('respects depth limit', () => {
    const md = exportToMarkdown(simpleDoc, { depth: 2 });
    expect(md).toContain('## Root Topic');
    expect(md).not.toContain('### Child A');
    expect(md).toContain('- Child A');
  });
});

describe('exportToJson', () => {
  it('returns valid JSON', () => {
    const json = exportToJson(simpleDoc);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes sheets in output', () => {
    const parsed = JSON.parse(exportToJson(simpleDoc));
    expect(parsed.sheets).toHaveLength(1);
  });

  it('includes metadata when requested', () => {
    const parsed = JSON.parse(exportToJson(simpleDoc, { includeMetadata: true }));
    expect(parsed.metadata?.sheetCount).toBe(1);
    expect(parsed.metadata?.exportedAt).toBeTruthy();
  });

  it('compact format when pretty=false', () => {
    const json = exportToJson(simpleDoc, { pretty: false });
    expect(json).not.toContain('\n');
  });
});

describe('exportToHtml', () => {
  it('returns DOCTYPE html', () => {
    const html = exportToHtml(simpleDoc);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('tree style uses details/summary', () => {
    const html = exportToHtml(simpleDoc, { style: 'tree' });
    expect(html).toContain('<details');
    expect(html).toContain('<summary>');
  });

  it('outline style uses ul/li', () => {
    const html = exportToHtml(simpleDoc, { style: 'outline' });
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
  });

  it('table style uses table/tr', () => {
    const html = exportToHtml(simpleDoc, { style: 'table' });
    expect(html).toContain('<table>');
    expect(html).toContain('<tr>');
  });

  it('escapes HTML entities', () => {
    const docWithSpecial = {
      ...simpleDoc,
      sheets: [{ ...simpleDoc.sheets[0], rootTopic: { ...simpleDoc.sheets[0].rootTopic, title: '<script>alert(1)</script>' } }],
    };
    const html = exportToHtml(docWithSpecial);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
