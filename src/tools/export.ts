// src/tools/export.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { exportToMarkdown, exportToJson, exportToHtml } from '../core/xmind-exporter.js';
import { readDoc } from './_shared.js';
import type { XMindTopic } from '../core/types.js';

function countTopicNodes(t: XMindTopic): number { let n = 1; for (const c of t.children ?? []) n += countTopicNodes(c); return n; }

export function registerExportTools(server: McpServer, env: Env): void {
  server.registerTool('export_to_markdown', {
    title: 'Export XMind to Markdown',
    description: 'Render an XMind file as a Markdown outline.\n\nArgs:\n  - fileKey, sheetIndex?, depth (default 6), includeNotes (default false), includeTasks (default false)\n\nReturns: { markdown, charCount }',
    inputSchema: z.object({
      fileKey: z.string().min(1), sheetIndex: z.number().int().min(0).optional(),
      depth: z.number().int().min(1).max(6).default(6),
      includeNotes: z.boolean().default(false), includeTasks: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, sheetIndex, depth, includeNotes, includeTasks }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const markdown = exportToMarkdown(doc, { sheetIndex, depth, includeNotes, includeTasks });
    return { content: [{ type: 'text', text: JSON.stringify({ markdown, charCount: markdown.length }, null, 2) }] };
  });

  server.registerTool('export_to_json', {
    title: 'Export XMind to JSON',
    description: 'Serialize the full XMindDocument to JSON.\n\nArgs:\n  - fileKey, pretty (default true), includeMetadata (default false)\n\nReturns: { json, nodeCount }',
    inputSchema: z.object({
      fileKey: z.string().min(1),
      pretty: z.boolean().default(true), includeMetadata: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, pretty, includeMetadata }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const nodeCount = doc.sheets.reduce((s, sh) => s + countTopicNodes(sh.rootTopic), 0);
    return { content: [{ type: 'text', text: JSON.stringify({ json: exportToJson(doc, { pretty, includeMetadata }), nodeCount }, null, 2) }] };
  });

  server.registerTool('export_to_html', {
    title: 'Export XMind to HTML',
    description: 'Render as self-contained HTML.\n\nArgs:\n  - fileKey, sheetIndex?, style ("tree"|"outline"|"table", default "tree"), includeNotes (default false)\n\nReturns: { html }',
    inputSchema: z.object({
      fileKey: z.string().min(1), sheetIndex: z.number().int().min(0).optional(),
      style: z.enum(['tree', 'outline', 'table']).default('tree'),
      includeNotes: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, sheetIndex, style, includeNotes }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    return { content: [{ type: 'text', text: JSON.stringify({ html: exportToHtml(doc, { sheetIndex, style, includeNotes }) }, null, 2) }] };
  });
}
