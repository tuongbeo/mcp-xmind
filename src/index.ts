// src/index.ts — Cloudflare Workers entrypoint
// Direct JSON-RPC handler — compatible with Claude.ai custom connector
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { registerReadTools } from './tools/read.js';
import { registerCreateTool } from './tools/create.js';
import { registerUpdateTools } from './tools/update.js';
import { registerDeleteTools } from './tools/delete.js';
import { registerSearchTools } from './tools/search.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerExportTools } from './tools/export.js';
import { registerStorageTools } from './tools/storage.js';

export interface Env {
  XMIND_STORE: KVNamespace;
  MCP_AUTH_TOKEN: string;
  MAX_FILE_SIZE_MB: string;
}

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: 'mcp-xmind', version: '2.0.0' });
  registerReadTools(server, env);
  registerCreateTool(server, env);
  registerUpdateTools(server, env);
  registerDeleteTools(server, env);
  registerSearchTools(server, env);
  registerTaskTools(server, env);
  registerExportTools(server, env);
  registerStorageTools(server, env);
  return server;
}

// Access internal registry via double-cast (private field access)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTools(server: McpServer): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools ?? {};
}

function buildToolsList(server: McpServer) {
  const rt = getTools(server);
  return Object.entries(rt).map(([name, tool]) => {
    let inputSchema: Record<string, unknown> = { type: 'object', properties: {} };
    try {
      const schema = zodToJsonSchema(tool.inputSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
      }) as Record<string, unknown>;
      delete schema.$schema;
      inputSchema = schema;
    } catch { /* fallback */ }
    return {
      name,
      description: (tool.description ?? tool.title ?? name) as string,
      inputSchema,
    };
  });
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  const rt = getTools(server);
  const tool = rt[name];
  if (!tool) throw { code: -32601, message: `Tool not found: ${name}` };

  // SDK 1.27.x changed the internal API:
  //   - executeToolHandler(tool, args, extra)  ← takes the tool OBJECT, not the name
  //   - validateToolInput(tool, args, name)    ← validates + parses via Zod
  // Using these private methods keeps us aligned with SDK internals.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as unknown as {
    validateToolInput: (tool: unknown, args: unknown, name: string) => Promise<unknown>;
    executeToolHandler: (tool: unknown, args: unknown, extra: Record<string, unknown>) => Promise<unknown>;
  };
  const validatedArgs = await s.validateToolInput(tool, args, name);
  return s.executeToolHandler(tool, validatedArgs, {});
}

type JsonRpcRequest = { jsonrpc: string; id?: unknown; method: string; params?: unknown };

async function handleRequest(req: JsonRpcRequest, env: Env): Promise<unknown> {
  const id = req.id ?? null;
  const params = (req.params ?? {}) as Record<string, unknown>;
  try {
    switch (req.method) {
      case 'initialize':
        return { jsonrpc: '2.0', id, result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mcp-xmind', version: '2.0.0' },
        }};
      case 'notifications/initialized':
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: buildToolsList(createServer(env)) } };
      case 'tools/call': {
        const result = await callTool(createServer(env), params.name as string, (params.arguments ?? {}) as Record<string, unknown>);
        return { jsonrpc: '2.0', id, result };
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${req.method}` } };
    }
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    return { jsonrpc: '2.0', id, error: { code: e?.code ?? -32603, message: e?.message ?? String(err) } };
  }
}

const SESSION_ID = 'xmind-public-server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });

    if (env.MCP_AUTH_TOKEN) {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`)
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/health')
      return Response.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() }, { headers: { ...CORS, 'Mcp-Session-Id': SESSION_ID } });

    if (pathname !== '/mcp')
      return Response.json({ error: 'Not Found' }, { status: 404, headers: CORS });

    if (request.method !== 'POST')
      return new Response('Method Not Allowed', { status: 405, headers: CORS });

    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }); }

    const reqs: JsonRpcRequest[] = Array.isArray(body) ? body : [body as JsonRpcRequest];
    const responses = await Promise.all(reqs.map(r => handleRequest(r, env)));
    const out = Array.isArray(body) ? responses : responses[0];

    return Response.json(out, { headers: { ...CORS, 'Content-Type': 'application/json', 'Mcp-Session-Id': SESSION_ID } });
  },
};
