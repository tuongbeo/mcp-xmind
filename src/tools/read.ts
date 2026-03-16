// src/tools/read.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { R2Adapter } from '../storage/r2-adapter.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { XmindError } from '../utils/errors.js';
import type { Env } from '../index.js';
import type { XMindTopic } from '../core/types.js';

function countNodes(topic: XMindTopic): number {
  let n = 1;
  for (const c of topic.children ?? []) n += countNodes(c);
  return n;
}

export function registerReadTools(server: McpServer, env: Env): void {
  server.registerTool(
    'read_xmind',
    {
      title: 'Read XMind File',
      description: 'Parse and return the full structure of an XMind file stored in R2.\n\nArgs:\n  - fileKey: R2 object key of the .xmind file\n\nReturns: full XMindDocument JSON',
      inputSchema: z.object({
        fileKey: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ fileKey }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const buffer = await r2.get(fileKey);
      if (!buffer) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
      const doc = parseXmindBuffer(buffer);
      return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
    }
  );

  server.registerTool(
    'read_multiple_xmind_files',
    {
      title: 'Read Multiple XMind Files',
      description: 'Load multiple XMind files from R2 in parallel.\n\nArgs:\n  - fileKeys: array of R2 keys\n  - mergeStrategy: "separate" | "compare"\n\nReturns: { documents, errors? }',
      inputSchema: z.object({
        fileKeys: z.array(z.string().min(1)).min(1).max(20),
        mergeStrategy: z.enum(['separate', 'compare']).default('separate'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ fileKeys, mergeStrategy }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const results = await Promise.all(
        fileKeys.map(async (key) => {
          const buf = await r2.get(key);
          if (!buf) return { key, error: `not found: ${key}` };
          return { key, doc: parseXmindBuffer(buf) };
        })
      );
      const documents: Record<string, unknown> = {};
      const errors: Record<string, string> = {};
      for (const r of results) {
        if ('error' in r) errors[r.key] = r.error ?? '';
        else documents[r.key] = r.doc;
      }
      const output: Record<string, unknown> = { documents };
      if (Object.keys(errors).length) output.errors = errors;
      if (mergeStrategy === 'compare') output.summary = { totalFiles: fileKeys.length, loaded: Object.keys(documents).length };
      return { content: [{ type: 'text', text: JSON.stringify(output) }] };
    }
  );

  server.registerTool(
    'list_xmind_directory',
    {
      title: 'List XMind Directory',
      description: 'List .xmind files in R2 with metadata.\n\nArgs:\n  - prefix: filter by key prefix\n  - limit: max results (default 20)\n  - cursor: pagination cursor\n\nReturns: { files, nextCursor? }',
      inputSchema: z.object({
        prefix: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ prefix, limit, cursor }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      const r2List = await r2.list(prefix, cursor, limit);
      const files = await Promise.all(
        r2List.objects.map(async (obj) => {
          const meta = await kv.get(obj.key);
          return meta ?? {
            fileName: obj.key.split('/').at(-1) ?? obj.key,
            fileKey: obj.key, fileSize: obj.size, sheetCount: 0, nodeCount: 0,
            createdAt: obj.uploaded, updatedAt: obj.uploaded,
          };
        })
      );
      return { content: [{ type: 'text', text: JSON.stringify({ files, nextCursor: r2List.nextCursor }) }] };
    }
  );
}
