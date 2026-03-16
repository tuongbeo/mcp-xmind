// src/tools/delete.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { deleteNode, deleteSheet } from '../core/xmind-mutator.js';
import { readDoc, persistDoc, outputKey } from './_shared.js';

export function registerDeleteTools(server: McpServer, env: Env): void {
  server.registerTool('delete_node', {
    title: 'Delete XMind Node',
    description: 'Remove a node from an XMind file.\n\nArgs:\n  - fileKey, nodeId, deleteChildren (default true), outputFileName?\n\nReturns: { fileKey, deletedCount }\nErrors: NODE_NOT_FOUND, CANNOT_DELETE_ROOT',
    inputSchema: z.object({
      fileKey: z.string().min(1), nodeId: z.string().min(1),
      deleteChildren: z.boolean().default(true),
      outputFileName: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async ({ fileKey, nodeId, deleteChildren, outputFileName }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const { doc: updated, deletedCount } = deleteNode(doc, nodeId, deleteChildren);
    const ok = outputKey(fileKey, outputFileName);
    await persistDoc(kv, updated, ok);
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey: ok, deletedCount }, null, 2) }] };
  });

  server.registerTool('delete_sheet', {
    title: 'Delete XMind Sheet',
    description: 'Remove an entire sheet from an XMind document.\n\nArgs:\n  - fileKey, sheetIndex, outputFileName?\n\nReturns: { fileKey, remainingSheets }\nErrors: LAST_SHEET, SHEET_NOT_FOUND',
    inputSchema: z.object({
      fileKey: z.string().min(1), sheetIndex: z.number().int().min(0),
      outputFileName: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async ({ fileKey, sheetIndex, outputFileName }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const updated = deleteSheet(doc, sheetIndex);
    const ok = outputKey(fileKey, outputFileName);
    await persistDoc(kv, updated, ok);
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey: ok, remainingSheets: updated.sheets.length }, null, 2) }] };
  });
}
