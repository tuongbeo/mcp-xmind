// src/tools/read.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { XmindError } from '../utils/errors.js';
import type { Env } from '../index.js';

async function loadDoc(kv: KVAdapter, fileKey: string) {
  const buf = await kv.getFile(fileKey);
  if (!buf) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  return parseXmindBuffer(buf);
}

export function registerReadTools(server: McpServer, env: Env): void {
  server.registerTool('read_xmind', {
    title: 'Read XMind File',
    description: 'Parse and return the full structure of an XMind file.\n\nArgs:\n  - fileKey: file key returned from create_xmind or upload_xmind\n\nReturns: full XMindDocument JSON',
    inputSchema: z.object({ fileKey: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await loadDoc(kv, fileKey);
    return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
  });

  server.registerTool('read_multiple_xmind_files', {
    title: 'Read Multiple XMind Files',
    description: 'Load multiple XMind files in parallel.\n\nArgs:\n  - fileKeys: array of file keys\n  - mergeStrategy: "separate" | "compare"\n\nReturns: { documents, errors? }',
    inputSchema: z.object({
      fileKeys: z.array(z.string().min(1)).min(1).max(20),
      mergeStrategy: z.enum(['separate', 'compare']).default('separate'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKeys, mergeStrategy }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const results = await Promise.all(fileKeys.map(async key => {
      const buf = await kv.getFile(key);
      if (!buf) return { key, error: `not found: ${key}` };
      return { key, doc: parseXmindBuffer(buf) };
    }));
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
  });

  server.registerTool('list_xmind_directory', {
    title: 'List XMind Directory',
    description: 'List stored XMind files with metadata.\n\nArgs:\n  - prefix: filter by key prefix (optional)\n  - limit: max results (default 20)\n  - cursor: pagination cursor (optional)\n\nReturns: { files, nextCursor? }',
    inputSchema: z.object({
      prefix: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ prefix, limit, cursor }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const { keys, cursor: nextCursor } = await kv.listFileKeys(prefix, cursor, limit);
    const files = await Promise.all(keys.map(async k => {
      const meta = await kv.get(k);
      return meta ?? { fileName: k.split('/').at(-1) ?? k, fileKey: k, fileSize: 0, sheetCount: 0, nodeCount: 0, createdAt: '', updatedAt: '' };
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ files, nextCursor }) }] };
  });
}
