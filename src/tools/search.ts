// src/tools/search.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { KVAdapter } from '../storage/kv-adapter.js';
import { findNodeById, findNodePath } from '../core/xmind-mutator.js';
import { fuzzyMatch, fuzzyPath } from '../utils/fuzzy.js';
import { XmindError } from '../utils/errors.js';
import { readDoc } from './_shared.js';
import type { XMindTopic, XMindDocument, SearchResult } from '../core/types.js';

function collectResults(doc: XMindDocument, query: string, searchIn: ('title'|'notes'|'labels')[], caseSensitive: boolean, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const q = caseSensitive ? query : query.toLowerCase();
  function scan(topic: XMindTopic, idx: number, path: string[]): void {
    if (results.length >= maxResults) return;
    let best = 0;
    if (searchIn.includes('title')) { const t = caseSensitive ? topic.title : topic.title.toLowerCase(); const { matched, score } = fuzzyMatch(q, t); if (matched) best = Math.max(best, score); }
    if (searchIn.includes('notes') && topic.notes?.plain) { const t = caseSensitive ? topic.notes.plain : topic.notes.plain.toLowerCase(); const { matched, score } = fuzzyMatch(q, t); if (matched) best = Math.max(best, score * 0.8); }
    if (searchIn.includes('labels') && topic.labels?.length) { for (const l of topic.labels) { const t = caseSensitive ? l : l.toLowerCase(); const { matched, score } = fuzzyMatch(q, t); if (matched) best = Math.max(best, score * 0.7); } }
    if (best > 0) results.push({ topic, path: [...path, topic.title], score: best, sheetIndex: idx });
    for (const c of topic.children ?? []) scan(c, idx, [...path, topic.title]);
  }
  doc.sheets.forEach((s, i) => scan(s.rootTopic, i, []));
  return results.sort((a, b) => b.score - a.score);
}

function flatten(topic: XMindTopic): XMindTopic[] {
  const r: XMindTopic[] = [];
  function c(t: XMindTopic) { r.push(t); for (const ch of t.children ?? []) c(ch); }
  for (const ch of topic.children ?? []) c(ch);
  return r;
}

export function registerSearchTools(server: McpServer, env: Env): void {
  server.registerTool('search_nodes', {
    title: 'Search XMind Nodes',
    description: 'Fuzzy search across title, notes, and/or labels.\n\nArgs:\n  - fileKey, query, searchIn (default ["title"]), caseSensitive (default false), maxResults (default 20)',
    inputSchema: z.object({
      fileKey: z.string().min(1), query: z.string().min(1),
      searchIn: z.array(z.enum(['title', 'notes', 'labels'])).default(['title']),
      caseSensitive: z.boolean().default(false),
      maxResults: z.number().int().min(1).max(100).default(20),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, query, searchIn, caseSensitive, maxResults }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const results = collectResults(doc, query, searchIn, caseSensitive, maxResults);
    return { content: [{ type: 'text', text: JSON.stringify({ results, totalFound: results.length }, null, 2) }] };
  });

  server.registerTool('extract_node', {
    title: 'Extract XMind Node by Path',
    description: 'Find a node by slash-separated fuzzy path.\n\nArgs:\n  - fileKey, searchQuery (e.g. "Root/Project/Task")\n\nReturns: { topic, subtree, path }',
    inputSchema: z.object({ fileKey: z.string().min(1), searchQuery: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, searchQuery }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const topic = fuzzyPath(doc, searchQuery);
    if (!topic) throw new XmindError('NODE_NOT_FOUND', `No node matching: ${searchQuery}`);
    return { content: [{ type: 'text', text: JSON.stringify({ topic, subtree: flatten(topic), path: findNodePath(doc, topic.id) }, null, 2) }] };
  });

  server.registerTool('extract_node_by_id', {
    title: 'Extract XMind Node by ID',
    description: 'Find a node by exact ID.\n\nArgs:\n  - fileKey, nodeId\n\nReturns: { topic, subtree, path }',
    inputSchema: z.object({ fileKey: z.string().min(1), nodeId: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ fileKey, nodeId }) => {
    const kv = new KVAdapter(env.XMIND_STORE);
    const doc = await readDoc(kv, fileKey);
    const topic = findNodeById(doc, nodeId);
    if (!topic) throw new XmindError('NODE_NOT_FOUND', `Node not found: ${nodeId}`);
    return { content: [{ type: 'text', text: JSON.stringify({ topic, subtree: flatten(topic), path: findNodePath(doc, nodeId) }, null, 2) }] };
  });
}
