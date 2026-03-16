// src/tools/update.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { updateNode, addNode, moveNode, findNodeById } from '../core/xmind-mutator.js';
import { readDoc, persistDoc, outputKey } from './_shared.js';

const TaskSchema = z.object({
  due: z.string().optional(), assignee: z.string().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
});
const NotesSchema = z.object({ plain: z.string().optional(), html: z.string().optional() });

export function registerUpdateTools(server: McpServer, env: Env): void {
  server.registerTool('update_node', {
    title: 'Update XMind Node',
    description: 'Modify fields of an existing node.\n\nArgs:\n  - fileKey, nodeId, updates (title/notes/labels/markers/tasks/callout/href), outputFileName?\n\nReturns: { fileKey, updatedNode }',
    inputSchema: z.object({
      fileKey: z.string().min(1), nodeId: z.string().min(1),
      updates: z.object({
        title: z.string().optional(), notes: NotesSchema.optional(),
        labels: z.array(z.string()).optional(), markers: z.array(z.string()).optional(),
        tasks: TaskSchema.optional(), callout: z.string().optional(), href: z.string().optional(),
      }),
      outputFileName: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ fileKey, nodeId, updates, outputFileName }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const updated = updateNode(doc, nodeId, updates);
    const ok = outputKey(fileKey, outputFileName);
    await persistDoc(kv, updated, ok);
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey: ok, updatedNode: findNodeById(updated, nodeId) }, null, 2) }] };
  });

  server.registerTool('add_node', {
    title: 'Add Node to XMind',
    description: 'Add a new child node under a parent. ID is auto-generated.\n\nArgs:\n  - fileKey, parentId, topic, position?, outputFileName?\n\nReturns: { fileKey, newNodeId, topic }',
    inputSchema: z.object({
      fileKey: z.string().min(1), parentId: z.string().min(1),
      topic: z.object({
        title: z.string().min(1), notes: NotesSchema.optional(),
        labels: z.array(z.string()).optional(), markers: z.array(z.string()).optional(),
        tasks: TaskSchema.optional(), callout: z.string().optional(),
        href: z.string().optional(), branch: z.enum(['folded', 'open']).optional(),
      }),
      position: z.number().int().min(0).optional(),
      outputFileName: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ fileKey, parentId, topic, position, outputFileName }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const { doc: updated, newNodeId } = addNode(doc, parentId, topic, position);
    const ok = outputKey(fileKey, outputFileName);
    await persistDoc(kv, updated, ok);
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey: ok, newNodeId, topic: findNodeById(updated, newNodeId) }, null, 2) }] };
  });

  server.registerTool('move_node', {
    title: 'Move XMind Node',
    description: 'Move a node to a different parent.\n\nArgs:\n  - fileKey, nodeId, newParentId, position?, outputFileName?\n\nReturns: { fileKey, movedNode }',
    inputSchema: z.object({
      fileKey: z.string().min(1), nodeId: z.string().min(1),
      newParentId: z.string().min(1), position: z.number().int().min(0).optional(),
      outputFileName: z.string().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ fileKey, nodeId, newParentId, position, outputFileName }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const updated = moveNode(doc, nodeId, newParentId, position);
    const ok = outputKey(fileKey, outputFileName);
    await persistDoc(kv, updated, ok);
    return { content: [{ type: 'text', text: JSON.stringify({ fileKey: ok, movedNode: findNodeById(updated, nodeId) }, null, 2) }] };
  });
}
