// src/index.ts — Cloudflare Workers entrypoint
// Uses a custom stateless JSON-RPC handler instead of StreamableHTTPServerTransport
// because that transport requires Node.js req/res objects.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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

function createMcpServer(env: Env): McpServer {
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

// Check if InMemoryTransport is available, otherwise use direct JSON-RPC
async function handleMcpRequest(body: unknown, env: Env): Promise<unknown> {
  const req = body as { jsonrpc: string; id: unknown; method: string; params?: unknown };

  // Handle JSON-RPC batch
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(r => handleMcpRequest(r, env)));
    return results;
  }

  const server = createMcpServer(env);

  // Use InMemoryTransport to bridge CF Workers ↔ McpServer
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  return new Promise((resolve) => {
    // Listen for the response
    clientTransport.onmessage = (msg) => {
      resolve(msg);
    };

    // Send the request
    clientTransport.send(req as Parameters<typeof clientTransport.send>[0]).catch((err: unknown) => {
      resolve({
        jsonrpc: '2.0',
        id: req.id ?? null,
        error: { code: -32603, message: String(err) },
      });
    });
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Auth
    if (env.MCP_AUTH_TOKEN) {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`)
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health')
      return Response.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });

    if (url.pathname !== '/mcp')
      return Response.json({ error: 'Not Found' }, { status: 404 });

    if (request.method !== 'POST')
      return new Response('Method Not Allowed', { status: 405 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    try {
      const result = await handleMcpRequest(body, env);
      return Response.json(result);
    } catch (err) {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: String(err) } }, { status: 500 });
    }
  },
};
