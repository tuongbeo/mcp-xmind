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

// ─── Markmap renderer ──────────────────────────────────────────────────────────

export interface ToMarkmapOptions {
  maxDepth?: number;
  includeNotes?: boolean;
  includeTasks?: boolean;
}

/**
 * Convert an XMindSheet to markmap-compatible markdown.
 * markmap uses ATX headings (#, ##, …) for depth 1-6,
 * then unordered list items for deeper levels.
 * Task status icons and short notes are appended inline.
 */
export function toMarkmapMarkdown(sheet: XMindSheet, opts: ToMarkmapOptions = {}): string {
  const { maxDepth = Infinity, includeNotes = false, includeTasks = true } = opts;
  const lines: string[] = [];

  function walk(topic: XMindTopic, depth: number): void {
    if (depth > maxDepth) return;
    const heading = depth <= 6 ? '#'.repeat(depth) : '-';
    let line = `${heading} ${topic.title}`;

    if (includeTasks && topic.tasks?.status) {
      const icon: Record<string, string> = { todo: '☐', 'in-progress': '◑', done: '☑' };
      line += ` ${icon[topic.tasks.status] ?? ''}`;
    }
    if (topic.markers?.length) {
      line += `  <!-- markers: ${topic.markers.join(', ')} -->`;
    }
    lines.push(line);

    if (includeNotes && topic.notes?.plain) {
      const preview = topic.notes.plain.slice(0, 80).replace(/\n/g, ' ');
      const indent = '  '.repeat(Math.min(depth, 6));
      lines.push(`${indent}*${preview}*`);
    }

    for (const child of topic.children ?? []) walk(child, depth + 1);
  }

  walk(sheet.rootTopic, 1);
  return lines.join('\n');
}

export interface BuildMarkmapHtmlOpts {
  theme?: 'default' | 'colorful' | 'dark' | 'forest';
  maxWidth?: number;
  /** base64-encoded .xmind bytes — enables "Download .xmind" button */
  xmindBase64?: string;
  /** filename for the .xmind download, e.g. "my-map.xmind" */
  fileName?: string;
}

/**
 * Build a self-contained markmap HTML string for inline rendering
 * inside Claude Chat / Claude Cowork artifacts.
 *
 * Uses markmap-lib + markmap-view with explicit JS init via <script type="module">.
 * Does NOT use markmap-autoloader — autoloader tries to parse YAML frontmatter
 * via a web worker which is blocked in sandboxed iframes, causing:
 *   "Cannot read properties of undefined (reading 'markmap')"
 *
 * CDN: cdn.jsdelivr.net (within CF Workers CSP allowlist).
 */
export function buildMarkmapHtml(
  markdown: string,
  title: string,
  opts: BuildMarkmapHtmlOpts = {}
): string {
  const { theme = 'default', maxWidth = 300, xmindBase64, fileName } = opts;

  const colorMap: Record<string, string[]> = {
    default:  ['#534AB7', '#1D9E75', '#185FA5', '#BA7517', '#993556', '#0F6E56'],
    colorful: ['#E24B4A', '#534AB7', '#1D9E75', '#185FA5', '#D4537E', '#BA7517'],
    dark:     ['#7F77DD', '#5DCAA5', '#378ADD', '#EF9F27', '#D4537E', '#9FE1CB'],
    forest:   ['#1D9E75', '#0F6E56', '#3B6D11', '#639922', '#085041', '#04342C'],
  };
  const colors = colorMap[theme] ?? colorMap.default;
  const freezeLevel = theme === 'colorful' ? 6 : 2;

  const safeTitle = esc(title);
  const safeFileName = esc(fileName ?? `${title}.xmind`);
  // Embed markdown as a JS template literal — escape backticks and $ signs
  const safeMd = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  const colorsJson = JSON.stringify(colors);

  const downloadBtn = xmindBase64
    ? `<button class="dl-btn" onclick="dlXmind()">⬇ Download .xmind<\/button>`
    : '';

  const downloadFn = xmindBase64
    ? `window.dlXmind = function() {
      var b64 = '${xmindBase64}';
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var blob = new Blob([arr], { type: 'application/vnd.xmind.workbook' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${safeFileName}';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    };`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}<\/title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #fafaf9; display: flex; flex-direction: column; height: 100vh; }
    .mm-bar {
      height: 44px; flex-shrink: 0;
      display: flex; align-items: center; gap: 10px;
      padding: 0 14px; background: #fff; border-bottom: 1px solid #e5e5e3;
      font-size: 13px; color: #6b6b66;
    }
    .badge { padding: 2px 8px; background: #EEEDFE; color: #3C3489; border-radius: 10px; font-size: 11px; }
    .title { font-weight: 500; color: #1a1a18; }
    .hint { color: #aaa9a3; font-size: 12px; }
    .spacer { flex: 1; }
    .dl-btn {
      padding: 4px 12px; border-radius: 6px; border: 1px solid #d4d4d0;
      background: #f5f5f3; color: #333; font-size: 12px;
      cursor: pointer; font-family: inherit;
    }
    .dl-btn:hover { background: #eaeae8; }
    #mm-wrap { flex: 1; overflow: hidden; position: relative; }
    #mm-wrap svg { width: 100%; height: 100%; display: block; }
    #mm-err { padding: 20px; color: #c0392b; font-size: 13px; display: none; white-space: pre-wrap; }
  <\/style>
<\/head>
<body>
  <div class="mm-bar">
    <span class="badge">XMind<\/span>
    <span class="title">${safeTitle}<\/span>
    <span class="hint">Scroll = zoom · Drag = pan · Click = collapse<\/span>
    <span class="spacer"><\/span>
    ${downloadBtn}
  <\/div>
  <div id="mm-err"><\/div>
  <div id="mm-wrap"><svg id="mm-svg"><\/svg><\/div>
  <script>
    ${downloadFn}
  <\/script>
  <script type="module">
    async function render() {
      try {
        const [lib, view] = await Promise.all([
          import('https://cdn.jsdelivr.net/npm/markmap-lib@0.16/dist/browser/index.js'),
          import('https://cdn.jsdelivr.net/npm/markmap-view@0.16/dist/browser/index.js'),
        ]);
        const { Transformer } = lib;
        const { Markmap } = view;
        const md = \`${safeMd}\`;
        const { root } = new Transformer().transform(md);
        const svg = document.getElementById('mm-svg');
        const mm = Markmap.create(svg, {
          colorFreezeLevel: ${freezeLevel},
          color: ${colorsJson},
          duration: 300,
          maxWidth: ${maxWidth},
          zoom: true,
          pan: true,
          initialExpandLevel: 2,
        }, root);
        setTimeout(() => mm.fit(), 100);
      } catch (e) {
        const el = document.getElementById('mm-err');
        el.style.display = 'block';
        el.textContent = 'Render error: ' + e.message;
      }
    }
    render();
  <\/script>
<\/body>
<\/html>`;
}
