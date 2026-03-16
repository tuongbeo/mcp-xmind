// src/tools/storage.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { countNodes } from '../core/xmind-mutator.js';
import { XmindError } from '../utils/errors.js';
import { v4 as uuidv4 } from 'uuid';

export function registerStorageTools(server: McpServer, env: Env): void {
  server.registerTool('upload_xmind', {
    title: 'Upload XMind File',
    description: 'Upload an existing .xmind file (Base64-encoded) to storage.\nValidates ZIP integrity before persisting.\n\nArgs:\n  - fileName: desired filename ending in .xmind\n  - fileBase64: base64-encoded .xmind file content\n\nReturns: { fileKey, fileSize, sheetCount, nodeCount }\nErrors: CORRUPT_FILE, FILE_TOO_LARGE',
    inputSchema: z.object({
      fileName: z.string().min(1).endsWith('.xmind'),
      fileBase64: z.string().min(1),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ fileName, fileBase64 }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    let buffer: ArrayBuffer;
    try {
      const binary = atob(fileBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } catch { throw new XmindError('CORRUPT_FILE', 'Failed to decode base64 content'); }
    const maxMb = parseInt(env.MAX_FILE_SIZE_MB ?? '10');
    if (buffer.byteLength > maxMb * 1024 * 1024) throw new XmindError('FILE_TOO_LARGE', `File exceeds ${maxMb}MB limit`);
    const doc = parseXmindBuffer(buffer);
    const fileKey = `${uuidv4()}/${fileName}`;
    await kv.putFile(fileKey, buffer);
    const nodeCount = countNodes(doc);
    const now = new Date().toISOString();
    await kv.index(fileKey, { fileName, fileKey, fileSize: buffer.byteLength, sheetCount: doc.sheets.length, nodeCount, createdAt: now, updatedAt: now });
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey, fileSize: buffer.byteLength, sheetCount: doc.sheets.length, nodeCount }, null, 2) }] };
  });

  server.registerTool('get_file_url', {
    title: 'Get XMind File as Base64',
    description: 'Retrieve an XMind file as base64-encoded content for download.\n\nArgs:\n  - fileKey: file key to retrieve\n\nReturns: { fileBase64, fileName, fileSize }',
    inputSchema: z.object({ fileKey: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const buf = await kv.getFile(fileKey);
    if (!buf) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const meta = await kv.get(fileKey);
    return { content: [{ type: 'text', text: JSON.stringify({ fileBase64: btoa(binary), fileName: meta?.fileName ?? fileKey.split('/').at(-1), fileSize: buf.byteLength }) }] };
  });
}
