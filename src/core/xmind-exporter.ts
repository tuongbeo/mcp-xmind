import type {
  XMindDocument,
  XMindSheet,
  XMindTopic,
  ExportMarkdownOptions,
  ExportJsonOptions,
  ExportHtmlOptions,
} from './types.js';

export function exportToMarkdown(doc: XMindDocument, opts: ExportMarkdownOptions = {}): string {
  const { sheetIndex, depth = 6, includeNotes = false, includeTasks = false } = opts;
  const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
  return sheets.map((sheet) => renderSheetMarkdown(sheet, depth, includeNotes, includeTasks)).join('\n\n---\n\n');
}

function renderSheetMarkdown(sheet: XMindSheet, maxDepth: number, includeNotes: boolean, includeTasks: boolean): string {
  const lines: string[] = [`# ${sheet.title}`];
  renderTopicMarkdown(sheet.rootTopic, 2, maxDepth, includeNotes, includeTasks, lines);
  return lines.join('\n');
}

function renderTopicMarkdown(topic: XMindTopic, level: number, maxDepth: number, includeNotes: boolean, includeTasks: boolean, lines: string[]): void {
  const prefix = level <= maxDepth ? '#'.repeat(level) : '-';
  lines.push(`${prefix} ${topic.title}`);
  if (includeNotes && topic.notes?.plain) lines.push(`> ${topic.notes.plain}`);
  if (includeTasks && topic.tasks) {
    const t = topic.tasks;
    const check = t.status === 'done' ? '[x]' : '[ ]';
    lines.push(`- ${check} ${topic.title}${t.due ? ` (due: ${t.due})` : ''}${t.assignee ? ` @${t.assignee}` : ''}`);
  }
  for (const child of topic.children ?? []) renderTopicMarkdown(child, level + 1, maxDepth, includeNotes, includeTasks, lines);
}

export function exportToJson(doc: XMindDocument, opts: ExportJsonOptions = {}): string {
  const { pretty = true, includeMetadata = false } = opts;
  const output: Record<string, unknown> = { sheets: doc.sheets };
  if (includeMetadata) output.metadata = { sheetCount: doc.sheets.length, exportedAt: new Date().toISOString() };
  return JSON.stringify(output, null, pretty ? 2 : undefined);
}

export function exportToHtml(doc: XMindDocument, opts: ExportHtmlOptions = {}): string {
  const { sheetIndex, style = 'tree', includeNotes = false } = opts;
  const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
  const body = sheets.map((sheet) => renderSheetHtml(sheet, style, includeNotes)).join('\n');
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>XMind Export</title>\n<style>\n  body { font-family: system-ui, sans-serif; margin: 2rem; color: #333; }\n  h1 { color: #1a1a2e; border-bottom: 2px solid #4a90d9; padding-bottom: 0.5rem; }\n  details { margin: 0.25rem 0; }\n  summary { cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; }\n  summary:hover { background: #f0f4ff; }\n  .node-leaf { padding: 0.2rem 0.4rem; margin: 0.1rem 0; }\n  .notes { color: #666; font-style: italic; font-size: 0.9em; margin-left: 1rem; }\n  ul { list-style: disc; padding-left: 1.5rem; }\n  table { border-collapse: collapse; width: 100%; }\n  th, td { border: 1px solid #ddd; padding: 0.4rem 0.8rem; text-align: left; }\n  th { background: #f5f5f5; }\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>`;
}

function renderSheetHtml(sheet: XMindSheet, style: 'outline' | 'tree' | 'table', includeNotes: boolean): string {
  if (style === 'table') return renderTableHtml(sheet);
  if (style === 'outline') return renderOutlineHtml(sheet, includeNotes);
  return renderTreeHtml(sheet, includeNotes);
}

function renderTreeHtml(sheet: XMindSheet, includeNotes: boolean): string {
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n${renderTopicTree(sheet.rootTopic, includeNotes)}\n</section>`;
}

function renderTopicTree(topic: XMindTopic, includeNotes: boolean): string {
  const notes = includeNotes && topic.notes?.plain ? `<div class="notes">${esc(topic.notes.plain)}</div>` : '';
  if (!topic.children?.length) return `<div class="node-leaf">${esc(topic.title)}${notes}</div>`;
  const children = topic.children.map((c) => renderTopicTree(c, includeNotes)).join('\n');
  return `<details open>\n<summary>${esc(topic.title)}${notes}</summary>\n${children}\n</details>`;
}

function renderOutlineHtml(sheet: XMindSheet, includeNotes: boolean): string {
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n<ul>\n${renderTopicOutline(sheet.rootTopic, includeNotes)}\n</ul>\n</section>`;
}

function renderTopicOutline(topic: XMindTopic, includeNotes: boolean): string {
  const notes = includeNotes && topic.notes?.plain ? ` <em>${esc(topic.notes.plain)}</em>` : '';
  if (!topic.children?.length) return `<li>${esc(topic.title)}${notes}</li>`;
  const children = topic.children.map((c) => renderTopicOutline(c, includeNotes)).join('\n');
  return `<li>${esc(topic.title)}${notes}\n<ul>\n${children}\n</ul>\n</li>`;
}

function renderTableHtml(sheet: XMindSheet): string {
  const rows: string[] = [];
  collectTableRows(sheet.rootTopic, [], rows);
  const tableRows = rows.map((row) => `<tr><td>${row}</td></tr>`).join('\n');
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n<table>\n<thead><tr><th>Topic</th></tr></thead>\n<tbody>\n${tableRows}\n</tbody>\n</table>\n</section>`;
}

function collectTableRows(topic: XMindTopic, path: string[], rows: string[]): void {
  rows.push(exportToJson == null ? '' : esc([...path, topic.title].join(' › ')));
  for (const child of topic.children ?? []) collectTableRows(child, [...path, topic.title], rows);
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
