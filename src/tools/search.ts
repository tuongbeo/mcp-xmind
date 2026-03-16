// src/tools/search.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../index.js';
import { R2Adapter } from '../storage/r2-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { findNodeById, findNodePath } from '../core/xmind-mutator.js';
import { fuzzyMatch, fuzzyPath } from '../utils/fuzzy.js';
import { XmindError } from '../utils/errors.js';
import type { XMindTopic, XMindDocument, SearchResult } from '../core/types.js';

async function loadDoc(r2: R2Adapter, fileKey: string): Promise<XMindDocument> {
  const buf = await r2.get(fileKey);
  if (!buf) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  return parseXmindBuffer(buf);
}

function collectSearchResults(
  doc: XMindDocument,
  query: string,
  searchIn: ('title' | 'notes' | 'labels')[],
  caseSensitive: boolean,
  maxResults: number
): SearchResult[] {
  const results: SearchResult[] = [];
  const q = caseSensitive ? query : query.toLowerCase();

  function searchTopic(topic: XMindTopic, sheetIdx: number, path: string[]): void {
    if (results.length >= maxResults) return;
    let bestScore = 0;
    if (searchIn.includes('title')) {
      const text = caseSensitive ? topic.title : topic.title.toLowerCase();
      const { matched, score } = fuzzyMatch(q, text);
      if (matched) bestScore = Math.max(bestScore, score);
    }
    if (searchIn.includes('notes') && topic.notes?.plain) {
      const text = caseSensitive ? topic.notes.plain : topic.notes.plain.toLowerCase();
      const { matched, score } = fuzzyMatch(q, text);
      if (matched) bestScore = Math.max(bestScore, score * 0.8);
    }
    if (searchIn.includes('labels') && topic.labels?.length) {
      for (const label of topic.labels) {
        const text = caseSensitive ? label : label.toLowerCase();
        const { matched, score } = fuzzyMatch(q, text);
        if (matched) bestScore = Math.max(bestScore, score * 0.7);
      }
    }
    if (bestScore > 0) results.push({ topic, path: [...path, topic.title], score: bestScore, sheetIndex: sheetIdx });
    for (const child of topic.children ?? []) searchTopic(child, sheetIdx, [...path, topic.title]);
  }

  doc.sheets.forEach((s, i) => searchTopic(s.rootTopic, i, []));
  return results.sort((a, b) => b.score - a.score);
}

function flattenSubtree(topic: XMindTopic): XMindTopic[] {
  const result: XMindTopic[] = [];
  function collect(t: XMindTopic) { result.push(t); for (const c of t.children ?? []) collect(c); }
  for (const c of topic.children ?? []) collect(c);
  return result;
}

export function registerSearchTools(server: McpServer, env: Env): void {
  server.registerTool(
    'search_nodes',
    {
      title: 'Search XMind Nodes',
      description: 'Fuzzy search for nodes across title, notes, and/or labels in an XMind file.\n\nArgs:\n  - fileKey, query, searchIn (default ["title"]), caseSensitive (default false), maxResults (default 20)',
      inputSchema: z.object({
        fileKey: z.string().min(1),
        query: z.string().min(1),
        searchIn: z.array(z.enum(['title', 'notes', 'labels'])).default(['title']),
        caseSensitive: z.boolean().default(false),
        maxResults: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ fileKey, query, searchIn, caseSensitive, maxResults }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const results = collectSearchResults(doc, query, searchIn, caseSensitive, maxResults);
      return { content: [{ type: 'text', text: JSON.stringify({ results, totalFound: results.length }, null, 2) }] };
    }
  );

  server.registerTool(
    'extract_node',
    {
      title: 'Extract XMind Node by Path',
      description: 'Find a node by slash-separated fuzzy path and return its full subtree.\n\nArgs:\n  - fileKey, searchQuery (e.g. "Root/Project/Task")\n\nReturns: { topic, subtree, path }',
      inputSchema: z.object({ fileKey: z.string().min(1), searchQuery: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ fileKey, searchQuery }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const topic = fuzzyPath(doc, searchQuery);
      if (!topic) throw new XmindError('NODE_NOT_FOUND', `No node matching: ${searchQuery}`);
      return { content: [{ type: 'text', text: JSON.stringify({ topic, subtree: flattenSubtree(topic), path: findNodePath(doc, topic.id) }, null, 2) }] };
    }
  );

  server.registerTool(
    'extract_node_by_id',
    {
      title: 'Extract XMind Node by ID',
      description: 'Find a node by exact ID and return its full subtree.\n\nArgs:\n  - fileKey, nodeId\n\nReturns: { topic, subtree, path }',
      inputSchema: z.object({ fileKey: z.string().min(1), nodeId: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ fileKey, nodeId }) => {
      const r2 = new R2Adapter(env.XMIND_FILES);
      const doc = await loadDoc(r2, fileKey);
      const topic = findNodeById(doc, nodeId);
      if (!topic) throw new XmindError('NODE_NOT_FOUND', `Node not found: ${nodeId}`);
      return { content: [{ type: 'text', text: JSON.stringify({ topic, subtree: flattenSubtree(topic), path: findNodePath(doc, nodeId) }, null, 2) }] };
    }
  );
}
