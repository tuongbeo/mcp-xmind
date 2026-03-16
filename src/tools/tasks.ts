// src/tools/tasks.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { XmindError } from '../utils/errors.js';
import type { XMindTopic, TaskResult } from '../core/types.js';

export function registerTaskTools(server: McpServer, env: Env): void {
  server.registerTool(
    'get_todo_tasks',
    {
      title: 'Get Todo Tasks from XMind',
      description: 'Extract all nodes that have task metadata from an XMind file.\n\nArgs:\n  - fileKey: R2 object key\n  - sheetIndex (optional): limit to one sheet\n  - statusFilter (optional): filter by "todo" | "in-progress" | "done"\n\nReturns: { tasks, totalCount, byStatus }',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        sheetIndex: z.number().int().min(0).optional(),
        statusFilter: z.array(z.enum(['todo', 'in-progress', 'done'])).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ fileKey, sheetIndex, statusFilter }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const buffer = await r2.get(fileKey);
      if (!buffer) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
      const doc = parseXmindBuffer(buffer);
      const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
      const results: TaskResult[] = [];
      sheets.forEach((sheet, localIdx) => {
        const globalIdx = sheetIndex !== undefined ? sheetIndex : localIdx;
        collectTasks(sheet.rootTopic, [], globalIdx, results, statusFilter);
      });
      const byStatus: Record<string, number> = {};
      for (const t of results) { const s = t.task.status ?? 'unknown'; byStatus[s] = (byStatus[s] ?? 0) + 1; }
      return { content: [{ type: 'text', text: JSON.stringify({ tasks: results, totalCount: results.length, byStatus }, null, 2) }] };
    }
  );
}

function collectTasks(
  topic: XMindTopic,
  path: string[],
  sheetIdx: number,
  results: TaskResult[],
  statusFilter?: ('todo' | 'in-progress' | 'done')[]
): void {
  if (topic.tasks) {
    const status = topic.tasks.status;
    if (!statusFilter || !status || statusFilter.includes(status)) {
      results.push({ topic: topic.title, path: [...path, topic.title], task: topic.tasks, sheetIndex: sheetIdx });
    }
  }
  for (const child of topic.children ?? []) collectTasks(child, [...path, topic.title], sheetIdx, results, statusFilter);
}
