// src/tools/export.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { exportToMarkdown, exportToJson, exportToHtml } from '../core/xmind-exporter.js';
import { XmindError } from '../utils/errors.js';
import type { XMindTopic } from '../core/types.js';

async function loadDoc(r2: R2Adapter, fileKey: string) {
  const buffer = await r2.get(fileKey);
  if (!buffer) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  return parseXmindBuffer(buffer);
}

function countTopicNodes(topic: XMindTopic): number {
  let n = 1;
  for (const c of topic.children ?? []) n += countTopicNodes(c);
  return n;
}

export function registerExportTools(server: McpServer, env: Env): void {
  server.registerTool(
    'export_to_markdown',
    {
      title: 'Export XMind to Markdown',
      description: 'Render an XMind file as a Markdown outline.\n\nArgs:\n  - fileKey: R2 object key\n  - sheetIndex: export one sheet (default: all)\n  - depth (default 6): max heading depth\n  - includeNotes (default false)\n  - includeTasks (default false)\n\nReturns: { markdown, charCount }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        sheetIndex: z.number().int().min(0).optional(),
        depth: z.number().int().min(1).max(6).default(6),
        includeNotes: z.boolean().default(false),
        includeTasks: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ fileKey, sheetIndex, depth, includeNotes, includeTasks }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const markdown = exportToMarkdown(doc, { sheetIndex, depth, includeNotes, includeTasks });
      return { content: [{ type: 'text', text: JSON.stringify({ markdown, charCount: markdown.length }, null, 2) }] };
    }
  );

  server.registerTool(
    'export_to_json',
    {
      title: 'Export XMind to JSON',
      description: 'Serialize the full XMindDocument model to JSON.\n\nArgs:\n  - fileKey: R2 object key\n  - pretty (default true)\n  - includeMetadata (default false)\n\nReturns: { json, nodeCount }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        pretty: z.boolean().default(true),
        includeMetadata: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ fileKey, pretty, includeMetadata }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const nodeCount = doc.sheets.reduce((s, sh) => s + countTopicNodes(sh.rootTopic), 0);
      const json = exportToJson(doc, { pretty, includeMetadata });
      return { content: [{ type: 'text', text: JSON.stringify({ json, nodeCount }, null, 2) }] };
    }
  );

  server.registerTool(
    'export_to_html',
    {
      title: 'Export XMind to HTML',
      description: 'Render an XMind file as self-contained HTML (inline CSS).\n\nArgs:\n  - fileKey: R2 object key\n  - sheetIndex: one sheet only (default: all)\n  - style: "tree" | "outline" | "table" (default "tree")\n  - includeNotes (default false)\n\nReturns: { html }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        sheetIndex: z.number().int().min(0).optional(),
        style: z.enum(['tree', 'outline', 'table']).default('tree'),
        includeNotes: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ fileKey, sheetIndex, style, includeNotes }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const html = exportToHtml(doc, { sheetIndex, style, includeNotes });
      return { content: [{ type: 'text', text: JSON.stringify({ html }, null, 2) }] };
    }
  );
}
