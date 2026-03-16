// src/tools/tasks.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { readDoc } from './_shared.js';
import type { XMindTopic, TaskResult } from '../core/types.js';

export function registerTaskTools(server: McpServer, env: Env): void {
  server.registerTool('get_todo_tasks', {
    title: 'Get Todo Tasks from XMind',
    description: 'Extract all nodes with task metadata.\n\nArgs:\n  - fileKey, sheetIndex? (default: all), statusFilter? (array of "todo"|"in-progress"|"done")\n\nReturns: { tasks, totalCount, byStatus }',
    inputSchema: z.object({
      fileKey: z.string().min(1),
      sheetIndex: z.number().int().min(0).optional(),
      statusFilter: z.array(z.enum(['todo', 'in-progress', 'done'])).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, sheetIndex, statusFilter }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
    const results: TaskResult[] = [];
    sheets.forEach((sheet, li) => {
      const gi = sheetIndex !== undefined ? sheetIndex : li;
      collect(sheet.rootTopic, [], gi, results, statusFilter);
    });
    const byStatus: Record<string, number> = {};
    for (const t of results) { const s = t.task.status ?? 'unknown'; byStatus[s] = (byStatus[s] ?? 0) + 1; }
    return { content: [{ type: 'text', text: JSON.stringify({ tasks: results, totalCount: results.length, byStatus }, null, 2) }] };
  });
}

function collect(topic: XMindTopic, path: string[], idx: number, results: TaskResult[], filter?: ('todo'|'in-progress'|'done')[]): void {
  if (topic.tasks) {
    const s = topic.tasks.status;
    if (!filter || !s || filter.includes(s)) results.push({ topic: topic.title, path: [...path, topic.title], task: topic.tasks, sheetIndex: idx });
  }
  for (const c of topic.children ?? []) collect(c, [...path, topic.title], idx, results, filter);
}
