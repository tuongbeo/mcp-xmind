// src/tools/storage.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { countNodes } from '../core/xmind-mutator.js';
import { XmindError } from '../utils/errors.js';
import type { FileMetadata } from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';

export function registerStorageTools(server: McpServer, env: Env): void {
  server.registerTool(
    'upload_xmind',
    {
      title: 'Upload XMind File',
      description: 'Upload an existing .xmind file (Base64-encoded) to R2 storage.\nValidates ZIP integrity and parses structure before persisting.\n\nArgs:\n  - fileName: desired filename ending in .xmind\n  - fileBase64: base64-encoded .xmind file content\n\nReturns: { fileKey, fileSize, sheetCount, nodeCount }\nErrors: CORRUPT_FILE, FILE_TOO_LARGE',
      inputSchema: z.object({
        fileName: z.string().min(1).endsWith('.xmind'),
        fileBase64: z.string().min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileName, fileBase64 }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      let buffer: ArrayBuffer;
      try {
        const binary = atob(fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        buffer = bytes.buffer;
      } catch {
        throw new XmindError('CORRUPT_FILE', 'Failed to decode base64 content');
      }
      const maxMb = parseInt(env.MAX_FILE_SIZE_MB ?? '10');
      if (buffer.byteLength > maxMb * 1024 * 1024) {
        throw new XmindError('FILE_TOO_LARGE', `File exceeds ${maxMb}MB limit`);
      }
      const doc = parseXmindBuffer(buffer);
      const fileKey = `${uuidv4()}/${fileName}`;
      await r2.put(fileKey, buffer);
      const nodeCount = doc.sheets.reduce((s, sh) => s + countNodes({ sheets: [sh] }), 0);
      const meta: FileMetadata = {
        fileName, fileKey, fileSize: buffer.byteLength,
        sheetCount: doc.sheets.length, nodeCount,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await kv.index(fileKey, meta);
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey, fileSize: buffer.byteLength, sheetCount: doc.sheets.length, nodeCount }, null, 2) }] };
    }
  );

  server.registerTool(
    'get_file_url',
    {
      title: 'Get XMind File URL',
      description: 'Generate a presigned URL for direct download of an XMind file from R2.\n\nArgs:\n  - fileKey: R2 object key\n  - expiresInSeconds (default 3600, max 86400)\n\nReturns: { url, expiresAt }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        expiresInSeconds: z.number().int().min(60).max(86400).default(3600),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileKey, expiresInSeconds }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const buffer = await r2.get(fileKey);
      if (!buffer) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
      const url = await r2.getSignedUrl(fileKey, expiresInSeconds);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { content: [{ type: 'text', text: JSON.stringify({ url, expiresAt }, null, 2) }] };
    }
  );
}
