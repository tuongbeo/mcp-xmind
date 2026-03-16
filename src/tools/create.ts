// src/tools/create.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { R2Adapter } from '../storage/r2-adapter.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { buildXmindFile } from '../core/xmind-builder.js';
import { countNodes } from '../core/xmind-mutator.js';
import type { XMindDocument, XMindTopic, XMindSheet, LayoutType } from '../core/types.js';
import type { Env } from '../index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TopicSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    children: z.array(TopicSchema).optional(),
    notes: z.object({ plain: z.string().optional(), html: z.string().optional() }).optional(),
    labels: z.array(z.string()).optional(),
    markers: z.array(z.string()).optional(),
    callout: z.string().optional(),
    href: z.string().optional(),
    branch: z.enum(['folded', 'open']).optional(),
    tasks: z.object({
      due: z.string().optional(),
      assignee: z.string().optional(),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      progress: z.number().min(0).max(100).optional(),
      status: z.enum(['todo', 'in-progress', 'done']).optional(),
    }).optional(),
  })
);

function assignIds(topic: Omit<XMindTopic, 'id'>, prefix: string): XMindTopic {
  const id = `${prefix}-${uuidv4().slice(0, 8)}`;
  return { ...topic, id, children: topic.children?.map((c, i) => assignIds(c, `${id}-${i}`)) };
}

export function registerCreateTool(server: McpServer, env: Env): void {
  server.registerTool(
    'create_xmind',
    {
      title: 'Create XMind File',
      description: 'Create a new .xmind file and upload it to R2 storage.\n\nArgs:\n  - fileName: desired filename\n  - sheets: array of { title, rootTopic, layout?, theme? }\n\nReturns: { fileKey, fileSize, sheetCount, nodeCount }',
      inputSchema: z.object({
        fileName: z.string().min(1),
        sheets: z.array(z.object({
          title: z.string().min(1),
          rootTopic: TopicSchema,
          layout: z.enum(['map', 'org-chart', 'fishbone', 'timeline', 'tree-table']).optional(),
          theme: z.string().optional(),
        })).min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ fileName, sheets }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const kv = new KVAdapter(env.XMIND_META);
      const docSheets: XMindSheet[] = sheets.map((s, i) => ({
        id: `sheet-${uuidv4().slice(0, 8)}`,
        title: s.title,
        rootTopic: assignIds(s.rootTopic, `s${i}`),
        layout: s.layout as LayoutType | undefined,
        theme: s.theme,
      }));
      const doc: XMindDocument = { sheets: docSheets };
      const built = buildXmindFile(doc);
      const nodeCount = countNodes(doc);
      const safeName = fileName.endsWith('.xmind') ? fileName : `${fileName}.xmind`;
      const fileKey = `${uuidv4()}/${safeName}`;
      await r2.put(fileKey, built);
      const now = new Date().toISOString();
      await kv.index(fileKey, {
        fileName: safeName, fileKey, fileSize: built.byteLength,
        sheetCount: docSheets.length, nodeCount, createdAt: now, updatedAt: now,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ fileKey, fileSize: built.byteLength, sheetCount: docSheets.length, nodeCount }) }] };
    }
  );
}
