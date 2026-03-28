// test/unit/tools-handlers.test.ts
// Directly exercises src/tools/*.ts handlers with a mock Env+KV
// This is the fastest path to tool-layer coverage without needing Miniflare.
import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCreateTool } from '../../src/tools/create.js';
import { registerReadTools } from '../../src/tools/read.js';
import { registerUpdateTools } from '../../src/tools/update.js';
import { registerDeleteTools } from '../../src/tools/delete.js';
import { registerSearchTools } from '../../src/tools/search.js';
import { registerTaskTools } from '../../src/tools/tasks.js';
import { registerExportTools } from '../../src/tools/export.js';
import { registerStorageTools } from '../../src/tools/storage.js';
import type { Env } from '../../src/index.js';

// ── Mock KV ────────────────────────────────────────────────────────────────
function makeMockKV() {
  const store = new Map<string, string>();
  return {
    async put(key: string, value: string) { store.set(key, value); },
    async get(key: string) { return store.get(key) ?? null; },
    async delete(key: string) { store.delete(key); },
    async list(opts?: { prefix?: string }) {
      const prefix = opts?.prefix ?? '';
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

function makeMockEnv(): Env {
  return {
    XMIND_STORE: makeMockKV() as never,
    MCP_AUTH_TOKEN: '',
    MAX_FILE_SIZE_MB: '10',
  };
}

// ── Tool call helper ────────────────────────────────────────────────────────
type AnyRecord = Record<string, unknown>;

async function callRegisteredTool(
  server: McpServer,
  name: string,
  args: AnyRecord
): Promise<AnyRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rt = (server as any)._registeredTools as Record<string, any>;
  const tool = rt[name];
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  const validated = await s.validateToolInput(tool, args, name);
  const result = await s.executeToolHandler(tool, validated, {});
  return JSON.parse((result as { content: { text: string }[] }).content[0].text) as AnyRecord;
}

// ── create_xmind ────────────────────────────────────────────────────────────
describe('tool: create_xmind', () => {
  let server: McpServer;
  let env: Env;

  beforeEach(() => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
  });

  it('creates a file and returns fileKey + counts', async () => {
    const result = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'test.xmind',
      sheets: [{ title: 'S1', rootTopic: { title: 'Root', children: [{ title: 'Child' }] } }],
    });
    expect(result.fileKey).toMatch(/\.xmind$/);
    expect(result.sheetCount).toBe(1);
    expect(result.nodeCount).toBe(2);
    expect(typeof result.fileSize).toBe('number');
  });

  it('auto-appends .xmind if missing', async () => {
    const result = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'no-ext',
      sheets: [{ title: 'S', rootTopic: { title: 'R' } }],
    });
    expect(result.fileKey).toMatch(/no-ext\.xmind$/);
  });
});

// ── read_xmind + list_xmind_directory ──────────────────────────────────────
describe('tool: read_xmind / list_xmind_directory', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerReadTools(server, env);
    const r = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'read-test.xmind',
      sheets: [{ title: 'S', rootTopic: { title: 'Root', children: [{ title: 'A' }, { title: 'B' }] } }],
    });
    fileKey = r.fileKey as string;
  });

  it('read_xmind returns parsed document', async () => {
    const doc = await callRegisteredTool(server, 'read_xmind', { fileKey }) as { sheets: { rootTopic: { title: string; children: unknown[] } }[] };
    expect(doc.sheets[0].rootTopic.title).toBe('Root');
    expect(doc.sheets[0].rootTopic.children).toHaveLength(2);
  });

  it('read_xmind throws FILE_NOT_FOUND for bad key', async () => {
    await expect(callRegisteredTool(server, 'read_xmind', { fileKey: 'bad/key.xmind' }))
      .rejects.toThrow('File not found:');
  });

  it('list_xmind_directory returns file metadata', async () => {
    const result = await callRegisteredTool(server, 'list_xmind_directory', {}) as { files: { fileKey: string }[] };
    expect(result.files.some(f => f.fileKey === fileKey)).toBe(true);
  });

  it('read_multiple_xmind_files loads in parallel', async () => {
    const r2 = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'second.xmind',
      sheets: [{ title: 'S2', rootTopic: { title: 'Root2' } }],
    });
    const result = await callRegisteredTool(server, 'read_multiple_xmind_files', {
      fileKeys: [fileKey, r2.fileKey],
    }) as { documents: Record<string, unknown> };
    expect(Object.keys(result.documents)).toHaveLength(2);
  });
});

// ── update / add / move / delete node ──────────────────────────────────────
describe('tool: update_node / add_node / move_node / delete_node', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;
  let rootId: string;
  let child1Id: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerReadTools(server, env);
    registerUpdateTools(server, env);
    registerDeleteTools(server, env);
    const created = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'mut.xmind',
      sheets: [{ title: 'S', rootTopic: { title: 'Root', children: [{ title: 'Child1' }, { title: 'Child2' }] } }],
    });
    fileKey = created.fileKey as string;
    const doc = await callRegisteredTool(server, 'read_xmind', { fileKey }) as { sheets: { rootTopic: { id: string; children: { id: string }[] } }[] };
    rootId = doc.sheets[0].rootTopic.id;
    child1Id = doc.sheets[0].rootTopic.children[0].id;
  });

  it('update_node changes title and notes', async () => {
    const r = await callRegisteredTool(server, 'update_node', {
      fileKey, nodeId: child1Id,
      updates: { title: 'Updated', notes: { plain: 'A note' } },
    }) as { updatedNode: { title: string; notes: { plain: string } } };
    expect(r.updatedNode.title).toBe('Updated');
    expect(r.updatedNode.notes.plain).toBe('A note');
  });

  it('add_node appends a new child', async () => {
    const r = await callRegisteredTool(server, 'add_node', {
      fileKey, parentId: rootId,
      topic: { title: 'NewChild', labels: ['new'] },
    }) as { newNodeId: string; topic: { title: string } };
    expect(r.topic.title).toBe('NewChild');
    expect(typeof r.newNodeId).toBe('string');
  });

  it('move_node re-parents correctly', async () => {
    const child2Id = (await callRegisteredTool(server, 'read_xmind', { fileKey }) as { sheets: { rootTopic: { children: { id: string }[] } }[] }).sheets[0].rootTopic.children[1].id;
    const r = await callRegisteredTool(server, 'move_node', {
      fileKey, nodeId: child2Id, newParentId: child1Id,
    }) as { movedNode: { title: string } };
    expect(r.movedNode.title).toBe('Child2');
  });

  it('delete_node removes a leaf', async () => {
    const r = await callRegisteredTool(server, 'delete_node', {
      fileKey, nodeId: child1Id,
    }) as { deletedCount: number };
    expect(r.deletedCount).toBe(1);
  });

  it('delete_sheet reduces sheet count', async () => {
    const twoSheet = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'two.xmind',
      sheets: [
        { title: 'S1', rootTopic: { title: 'R1' } },
        { title: 'S2', rootTopic: { title: 'R2' } },
      ],
    });
    const r = await callRegisteredTool(server, 'delete_sheet', {
      fileKey: twoSheet.fileKey, sheetIndex: 1,
    }) as { remainingSheets: number };
    expect(r.remainingSheets).toBe(1);
  });
});

// ── search / extract ─────────────────────────────────────────────────────
describe('tool: search_nodes / extract_node / extract_node_by_id', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;
  let rootId: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerReadTools(server, env);
    registerSearchTools(server, env);
    const r = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'search.xmind',
      sheets: [{ title: 'S', rootTopic: { title: 'ProjectRoot', children: [
        { title: 'Authentication', notes: { plain: 'OAuth flow' } },
        { title: 'Dashboard', labels: ['ui'] },
      ] } }],
    });
    fileKey = r.fileKey as string;
    const doc = await callRegisteredTool(server, 'read_xmind', { fileKey }) as { sheets: { rootTopic: { id: string } }[] };
    rootId = doc.sheets[0].rootTopic.id;
  });

  it('search_nodes finds by title', async () => {
    const r = await callRegisteredTool(server, 'search_nodes', { fileKey, query: 'auth' }) as { results: { topic: { title: string } }[] };
    expect(r.results.some(x => x.topic.title === 'Authentication')).toBe(true);
  });

  it('search_nodes searches notes', async () => {
    const r = await callRegisteredTool(server, 'search_nodes', { fileKey, query: 'OAuth', searchIn: ['notes'] }) as { results: unknown[] };
    expect(r.results.length).toBeGreaterThan(0);
  });

  it('extract_node_by_id returns correct node', async () => {
    const r = await callRegisteredTool(server, 'extract_node_by_id', { fileKey, nodeId: rootId }) as { topic: { title: string } };
    expect(r.topic.title).toBe('ProjectRoot');
  });

  it('extract_node finds by path query', async () => {
    const r = await callRegisteredTool(server, 'extract_node', { fileKey, searchQuery: 'ProjectRoot/Dashboard' }) as { topic: { title: string } };
    expect(r.topic.title).toBe('Dashboard');
  });
});

// ── get_todo_tasks ───────────────────────────────────────────────────────
describe('tool: get_todo_tasks', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerTaskTools(server, env);
    const r = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'tasks.xmind',
      sheets: [{ title: 'S', rootTopic: { title: 'Root', children: [
        { title: 'Todo item', tasks: { status: 'todo', priority: 1 } },
        { title: 'Done item', tasks: { status: 'done' } },
        { title: 'WIP item', tasks: { status: 'in-progress', assignee: 'Alice', progress: 50 } },
      ] } }],
    });
    fileKey = r.fileKey as string;
  });

  it('returns all tasks with correct counts', async () => {
    const r = await callRegisteredTool(server, 'get_todo_tasks', { fileKey }) as { totalCount: number; byStatus: Record<string, number> };
    expect(r.totalCount).toBe(3);
    expect(r.byStatus['todo']).toBe(1);
    expect(r.byStatus['done']).toBe(1);
    expect(r.byStatus['in-progress']).toBe(1);
  });

  it('filters by statusFilter', async () => {
    const r = await callRegisteredTool(server, 'get_todo_tasks', { fileKey, statusFilter: ['todo'] }) as { totalCount: number };
    expect(r.totalCount).toBe(1);
  });

  it('filters by sheetIndex', async () => {
    const r = await callRegisteredTool(server, 'get_todo_tasks', { fileKey, sheetIndex: 0 }) as { totalCount: number };
    expect(r.totalCount).toBe(3);
  });
});

// ── export tools ─────────────────────────────────────────────────────────
describe('tool: export_to_markdown / export_to_json / export_to_html', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerExportTools(server, env);
    const r = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'export.xmind',
      sheets: [{ title: 'Sheet1', rootTopic: { title: 'Root', notes: { plain: 'Root note' }, children: [
        { title: 'Alpha' }, { title: 'Beta' },
      ] } }],
    });
    fileKey = r.fileKey as string;
  });

  it('export_to_markdown returns markdown string', async () => {
    const r = await callRegisteredTool(server, 'export_to_markdown', { fileKey, includeNotes: true }) as { markdown: string; charCount: number };
    expect(r.markdown).toContain('# ');
    expect(r.markdown).toContain('Root');
    expect(r.markdown).toContain('Alpha');
    expect(r.charCount).toBeGreaterThan(10);
  });

  it('export_to_markdown respects depth', async () => {
    const r = await callRegisteredTool(server, 'export_to_markdown', { fileKey, depth: 1 }) as { markdown: string };
    expect(r.markdown).toContain('Root');
  });

  it('export_to_json returns valid JSON with nodeCount', async () => {
    const r = await callRegisteredTool(server, 'export_to_json', { fileKey, pretty: true }) as { json: string; nodeCount: number };
    expect(() => JSON.parse(r.json)).not.toThrow();
    expect(r.nodeCount).toBe(3);
  });

  it('export_to_html returns self-contained HTML', async () => {
    const r = await callRegisteredTool(server, 'export_to_html', { fileKey, style: 'tree' }) as { html: string };
    expect(r.html).toContain('<!DOCTYPE html>');
    expect(r.html).toContain('Root');
  });

  it('export_to_html outline style works', async () => {
    const r = await callRegisteredTool(server, 'export_to_html', { fileKey, style: 'outline' }) as { html: string };
    expect(r.html).toContain('Root');
  });

  it('export_to_html table style works', async () => {
    const r = await callRegisteredTool(server, 'export_to_html', { fileKey, style: 'table' }) as { html: string };
    expect(r.html).toContain('Root');
  });
});

// ── upload_xmind + get_file_url ───────────────────────────────────────────
describe('tool: upload_xmind / get_file_url', () => {
  let server: McpServer;
  let env: Env;

  beforeEach(() => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCreateTool(server, env);
    registerStorageTools(server, env);
  });

  it('upload_xmind stores a valid .xmind and returns metadata', async () => {
    // Build a minimal .xmind in-memory to upload
    const { buildXmindFile } = await import('../../src/core/xmind-builder.js');
    const built = buildXmindFile({ sheets: [{ id: 's1', title: 'T', rootTopic: { id: 'r1', title: 'R' } }] });
    const b64 = Buffer.from(built).toString('base64');
    const r = await callRegisteredTool(server, 'upload_xmind', {
      fileName: 'uploaded.xmind', fileBase64: b64,
    }) as { fileKey: string; sheetCount: number; nodeCount: number };
    expect(r.fileKey).toMatch(/uploaded\.xmind$/);
    expect(r.sheetCount).toBe(1);
    expect(r.nodeCount).toBe(1);
  });

  it('get_file_url returns base64 for an existing file', async () => {
    const created = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'dl.xmind',
      sheets: [{ title: 'S', rootTopic: { title: 'R' } }],
    });
    const r = await callRegisteredTool(server, 'get_file_url', { fileKey: created.fileKey }) as { fileBase64: string; fileName: string };
    expect(r.fileBase64.length).toBeGreaterThan(0);
    expect(r.fileName).toBe('dl.xmind');
    // Verify it decodes to a valid ZIP (PK magic bytes)
    const bytes = Buffer.from(r.fileBase64, 'base64');
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
  });

  it('get_file_url throws FILE_NOT_FOUND for missing key', async () => {
    await expect(callRegisteredTool(server, 'get_file_url', { fileKey: 'ghost/x.xmind' }))
      .rejects.toThrow('File not found:');
  });

  it('upload_xmind throws CORRUPT_FILE for bad base64 content', async () => {
    await expect(callRegisteredTool(server, 'upload_xmind', {
      fileName: 'bad.xmind', fileBase64: btoa('not a zip file at all'),
    })).rejects.toThrow();
  });
});

// ── render_xmind ─────────────────────────────────────────────────────────────
describe('tool: render_xmind', () => {
  let server: McpServer;
  let env: Env;
  let fileKey: string;

  beforeEach(async () => {
    env = makeMockEnv();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    // render_xmind depends on create (to seed KV) + render tool itself
    registerCreateTool(server, env);
    const { registerRenderTools } = await import('../../src/tools/render.js');
    registerRenderTools(server, env);
    const r = await callRegisteredTool(server, 'create_xmind', {
      fileName: 'render-handler-test.xmind',
      sheets: [{
        title: 'Handler Test',
        rootTopic: {
          title: 'Root',
          children: [
            { title: 'Alpha', children: [{ title: 'A1' }, { title: 'A2' }] },
            { title: 'Beta',  tasks: { status: 'done' } },
            { title: 'Gamma', tasks: { status: 'in-progress' } },
          ],
        },
      }],
    });
    fileKey = r.fileKey as string;
  });

  it('returns html, nodeCount and sheetTitle', async () => {
    const r = await callRegisteredTool(server, 'render_xmind', { fileKey }) as {
      html: string; nodeCount: number; sheetTitle: string; sheetIndex: number;
    };
    expect(typeof r.html).toBe('string');
    expect(r.html.length).toBeGreaterThan(200);
    expect(r.nodeCount).toBe(6);
    expect(r.sheetTitle).toBe('Handler Test');
    expect(r.sheetIndex).toBe(0);
  });

  it('html is zero-dep: no CDN, no markmap, no external scripts', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey }) as { html: string };
    expect(html).not.toContain('markmap');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('import(');
  });

  it('html contains self-contained SVG renderer', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey }) as { html: string };
    expect(html).toContain('<svg');
    expect(html).toContain('function parse(');
    expect(html).toContain('function render(');
  });

  it('html includes download button with base64 payload', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey }) as { html: string };
    expect(html).toContain('Download .xmind');
    expect(html).toContain('atob(');
    expect(html).toContain('atob(');
  });

  it('task status icons appear for done and in-progress', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey, includeTasks: true }) as { html: string };
    expect(html).toContain('☑');
    expect(html).toContain('◑');
  });

  it('respects maxDepth — no h3 when maxDepth=2', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey, maxDepth: 2 }) as { html: string };
    expect(html).toContain('## Alpha');
    expect(html).not.toContain('### A1');
  });

  it('applies theme — colorful palette', async () => {
    const { html } = await callRegisteredTool(server, 'render_xmind', { fileKey, theme: 'colorful' }) as { html: string };
    expect(html).toContain('#E24B4A');
  });

  it('throws NODE_NOT_FOUND for invalid sheetIndex', async () => {
    await expect(callRegisteredTool(server, 'render_xmind', { fileKey, sheetIndex: 99 }))
      .rejects.toThrow('does not exist');
  });

  it('throws FILE_NOT_FOUND for missing file', async () => {
    await expect(callRegisteredTool(server, 'render_xmind', { fileKey: 'no/file.xmind' }))
      .rejects.toThrow('File not found:');
  });
});
