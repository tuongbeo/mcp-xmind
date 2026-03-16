// src/tools/delete.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { buildXmindFile } from '../core/xmind-builder.js';
import { deleteNode, deleteSheet, countNodes } from '../core/xmind-mutator.js';
import { XmindError } from '../utils/errors.js';
import type { FileMetadata } from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';

async function readAndPersist(
  r2: R2Adapter,
  kv: KVAdapter,
  fileKey: string,
  outputFileName: string | undefined,
  transform: (doc: ReturnType<typeof parseXmindBuffer>) => ReturnType<typeof parseXmindBuffer>
): Promise<{ outputKey: string; doc: ReturnType<typeof parseXmindBuffer> }> {
  const buffer = await r2.get(fileKey);
  if (!buffer) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  const doc = parseXmindBuffer(buffer);
  const updatedDoc = transform(doc);
  const outputKey = outputFileName ? `${uuidv4()}/${outputFileName}` : fileKey;
  const built = buildXmindFile(updatedDoc);
  await r2.put(outputKey, built);
  const meta: FileMetadata = {
    fileName: outputKey.split('/').pop() ?? outputKey,
    fileKey: outputKey,
    fileSize: built.byteLength,
    sheetCount: updatedDoc.sheets.length,
    nodeCount: countNodes(updatedDoc),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await kv.index(outputKey, meta);
  return { outputKey, doc: updatedDoc };
}

export function registerDeleteTools(server: McpServer, env: Env): void {
  server.registerTool(
    'delete_node',
    {
      title: 'Delete XMind Node',
      description: 'Remove a node (and optionally its children) from an XMind file.\n\nArgs:\n  - fileKey: R2 object key\n  - nodeId: ID of the node to delete\n  - deleteChildren (default true): re-parent children if false\n  - outputFileName: omit to overwrite in place\n\nReturns: { fileKey, deletedCount }\nErrors: NODE_NOT_FOUND, CANNOT_DELETE_ROOT',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        nodeId: z.string().min(1),
        deleteChildren: z.boolean().default(true),
        outputFileName: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ fileKey, nodeId, deleteChildren, outputFileName }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      let deletedCount = 0;
      const { outputKey } = await readAndPersist(r2, kv, fileKey, outputFileName, (doc) => {
        const result = deleteNode(doc, nodeId, deleteChildren);
        deletedCount = result.deletedCount;
        return result.doc;
      });
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey: outputKey, deletedCount }, null, 2) }] };
    }
  );

  server.registerTool(
    'delete_sheet',
    {
      title: 'Delete XMind Sheet',
      description: 'Remove an entire sheet from an XMind document.\n\nArgs:\n  - fileKey: R2 object key\n  - sheetIndex: zero-based sheet index\n  - outputFileName: omit to overwrite in place\n\nReturns: { fileKey, remainingSheets }\nErrors: LAST_SHEET, SHEET_NOT_FOUND',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        sheetIndex: z.number().int().min(0),
        outputFileName: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ fileKey, sheetIndex, outputFileName }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      let remainingSheets = 0;
      const { outputKey } = await readAndPersist(r2, kv, fileKey, outputFileName, (doc) => {
        const result = deleteSheet(doc, sheetIndex);
        remainingSheets = result.sheets.length;
        return result;
      });
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey: outputKey, remainingSheets }, null, 2) }] };
    }
  );
}
