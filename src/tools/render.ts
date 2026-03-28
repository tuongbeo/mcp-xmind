// src/tools/render.ts — render_xmind tool
// Returns a self-contained markmap HTML string that Claude renders
// inline as an artifact in Claude Chat / Claude Cowork.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { toMarkmapMarkdown, buildMarkmapHtml } from '../core/xmind-exporter.js';
import { readDoc } from './_shared.js';
import { XmindError } from '../utils/errors.js';
import type { XMindTopic } from '../core/types.js';

function countTopic(t: XMindTopic): number {
  return 1 + (t.children ?? []).reduce((s, c) => s + countTopic(c), 0);
}

export function registerRenderTools(server: McpServer, env: Env): void {
  server.registerTool('render_xmind', {
    title: 'Render XMind as inline mindmap',
    description: [
      'Render an XMind file as an interactive mindmap directly inside Claude Chat / Claude Cowork.',
      'Returns a self-contained markmap HTML artifact — no download required.',
      '',
      'Args:',
      '  - fileKey        : KV key of the .xmind file (required)',
      '  - sheetIndex     : Sheet to render, 0-based (default: 0)',
      '  - theme          : "default" | "colorful" | "dark" | "forest" (default: "default")',
      '  - maxDepth       : Limit rendering depth, 1-10 (default: full tree)',
      '  - includeNotes   : Append short note preview below node (default: false)',
      '  - includeTasks   : Show task status icons ☐ ◑ ☑ (default: true)',
      '',
      'Returns: { html, nodeCount, sheetTitle, sheetIndex }',
    ].join('\n'),
    inputSchema: z.object({
      fileKey:       z.string().min(1).describe('KV key of the .xmind file'),
      sheetIndex:    z.number().int().min(0).default(0).describe('Sheet index (0-based)'),
      theme:         z.enum(['default', 'colorful', 'dark', 'forest']).default('default'),
      maxDepth:      z.number().int().min(1).max(10).optional().describe('Max depth to render'),
      includeNotes:  z.boolean().default(false).describe('Show note preview under node'),
      includeTasks:  z.boolean().default(true).describe('Show task status icons'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, sheetIndex, theme, maxDepth, includeNotes, includeTasks }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);

    const sheet = doc.sheets[sheetIndex];
    if (!sheet) {
      throw new XmindError(
        'NODE_NOT_FOUND',
        `Sheet index ${sheetIndex} does not exist (document has ${doc.sheets.length} sheet(s))`
      );
    }

    const markdown = toMarkmapMarkdown(sheet, { maxDepth, includeNotes, includeTasks });
    const html = buildMarkmapHtml(markdown, sheet.title, { theme });
    const nodeCount = countTopic(sheet.rootTopic);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ html, nodeCount, sheetTitle: sheet.title, sheetIndex }, null, 2),
      }],
    };
  });
}
