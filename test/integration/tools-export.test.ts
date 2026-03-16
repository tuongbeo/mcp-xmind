// test/integration/tools-export.test.ts
import { describe, it, expect } from 'vitest';
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import { parseXmindBuffer } from '../../src/core/xmind-parser.js';
import { exportToMarkdown, exportToJson, exportToHtml } from '../../src/core/xmind-exporter.js';
import { simpleDoc, withTasksDoc } from '../fixtures/generate.js';

function roundtripDoc(doc: Parameters<typeof buildXmindFile>[0]) {
  return parseXmindBuffer(buildXmindFile(doc).buffer as ArrayBuffer);
}

describe('export tools — integration', () => {
  it('markdown roundtrip: build → parse → export', () => {
    const doc = roundtripDoc(simpleDoc);
    const md = exportToMarkdown(doc);
    expect(md).toContain('# Simple Sheet');
    expect(md).toContain('## Root Topic');
  });

  it('JSON export from roundtripped doc is valid', () => {
    const doc = roundtripDoc(simpleDoc);
    const parsed = JSON.parse(exportToJson(doc));
    expect(parsed.sheets[0].rootTopic.id).toBe('fixture-0-0-0');
  });

  it('HTML tree style from roundtripped doc', () => {
    const doc = roundtripDoc(simpleDoc);
    const html = exportToHtml(doc, { style: 'tree' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Root Topic');
  });

  it('HTML outline style', () => {
    const doc = roundtripDoc(simpleDoc);
    expect(exportToHtml(doc, { style: 'outline' })).toContain('<ul>');
  });

  it('HTML table style', () => {
    const doc = roundtripDoc(simpleDoc);
    const html = exportToHtml(doc, { style: 'table' });
    expect(html).toContain('<table>');
    expect(html).toContain('Root Topic');
  });

  it('markdown includes tasks when includeTasks=true', () => {
    const doc = roundtripDoc(withTasksDoc);
    const md = exportToMarkdown(doc, { includeTasks: true });
    expect(md).toContain('[x]');
    expect(md).toContain('[ ]');
  });
});
