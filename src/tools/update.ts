// src/tools/update.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { buildXmindFile } from '../core/xmind-builder.js';
import { updateNode, addNode, moveNode, findNodeById, countNodes } from '../core/xmind-mutator.js';
import { XmindError } from '../utils/errors.js';
import type { FileMetadata } from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';

const TaskSchema = z.object({
  due: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
});

const NotesSchema = z.object({ plain: z.string().optional(), html: z.string().optional() });

async function readDoc(r2: R2Adapter, fileKey: string) {
  const b = await r2.get(fileKey);
  if (!b) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  return { buffer: b, doc: parseXmindBuffer(b) };
}

async function persistDoc(r2: R2Adapter, kv: KVAdapter, doc: ReturnType<typeof parseXmindBuffer>, outputKey: string): Promise<void> {
  const built = buildXmindFile(doc);
  await r2.put(outputKey, built);
  const meta: FileMetadata = {
    fileName: outputKey.split('/').pop() ?? outputKey,
    fileKey: outputKey, fileSize: built.byteLength,
    sheetCount: doc.sheets.length, nodeCount: countNodes(doc),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await kv.index(outputKey, meta);
}

export function registerUpdateTools(server: McpServer, env: Env): void {
  server.registerTool(
    'update_node',
    {
      title: 'Update XMind Node',
      description: 'Modify fields of an existing node in an XMind file.\n\nArgs:\n  - fileKey, nodeId, updates (title/notes/labels/markers/tasks/callout/href), outputFileName (optional)\n\nReturns: { fileKey, updatedNode }\nErrors: NODE_NOT_FOUND',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        nodeId: z.string().min(1),
        updates: z.object({
          title: z.string().optional(),
          notes: NotesSchema.optional(),
          labels: z.array(z.string()).optional(),
          markers: z.array(z.string()).optional(),
          tasks: TaskSchema.optional(),
          callout: z.string().optional(),
          href: z.string().optional(),
        }),
        outputFileName: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileKey, nodeId, updates, outputFileName }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      const { doc } = await readDoc(r2, fileKey);
      const updatedDoc = updateNode(doc, nodeId, updates);
      const outputKey = outputFileName ? `${uuidv4()}/${outputFileName}` : fileKey;
      await persistDoc(r2, kv, updatedDoc, outputKey);
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey: outputKey, updatedNode: findNodeById(updatedDoc, nodeId) }, null, 2) }] };
    }
  );

  server.registerTool(
    'add_node',
    {
      title: 'Add Node to XMind',
      description: 'Add a new child node under a specified parent. ID is auto-generated.\n\nArgs:\n  - fileKey, parentId, topic (title + optional fields), position (optional), outputFileName (optional)\n\nReturns: { fileKey, newNodeId, topic }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        parentId: z.string().min(1),
        topic: z.object({
          title: z.string().min(1),
          notes: NotesSchema.optional(),
          labels: z.array(z.string()).optional(),
          markers: z.array(z.string()).optional(),
          tasks: TaskSchema.optional(),
          callout: z.string().optional(),
          href: z.string().optional(),
          branch: z.enum(['folded', 'open']).optional(),
        }),
        position: z.number().int().min(0).optional(),
        outputFileName: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileKey, parentId, topic, position, outputFileName }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      const { doc } = await readDoc(r2, fileKey);
      const { doc: updatedDoc, newNodeId } = addNode(doc, parentId, topic, position);
      const outputKey = outputFileName ? `${uuidv4()}/${outputFileName}` : fileKey;
      await persistDoc(r2, kv, updatedDoc, outputKey);
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey: outputKey, newNodeId, topic: findNodeById(updatedDoc, newNodeId) }, null, 2) }] };
    }
  );

  server.registerTool(
    'move_node',
    {
      title: 'Move XMind Node',
      description: 'Move a node to a different parent within the same document.\n\nArgs:\n  - fileKey, nodeId, newParentId, position (optional), outputFileName (optional)\n\nReturns: { fileKey, movedNode }\nErrors: NODE_NOT_FOUND, CIRCULAR_REFERENCE, CANNOT_DELETE_ROOT',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        nodeId: z.string().min(1),
        newParentId: z.string().min(1),
        position: z.number().int().min(0).optional(),
        outputFileName: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileKey, nodeId, newParentId, position, outputFileName }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      const { doc } = await readDoc(r2, fileKey);
      const updatedDoc = moveNode(doc, nodeId, newParentId, position);
      const outputKey = outputFileName ? `${uuidv4()}/${outputFileName}` : fileKey;
      await persistDoc(r2, kv, updatedDoc, outputKey);
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey: outputKey, movedNode: findNodeById(updatedDoc, nodeId) }, null, 2) }] };
    }
  );
}
