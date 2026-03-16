// src/index.ts — Cloudflare Workers entrypoint + MCP HTTP handler
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerReadTools } from './tools/read.js';
import { registerCreateTool } from './tools/create.js';
import { registerUpdateTools } from './tools/update.js';
import { registerDeleteTools } from './tools/delete.js';
import { registerSearchTools } from './tools/search.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerExportTools } from './tools/export.js';
import { registerStorageTools } from './tools/storage.js';

export interface Env {
  XMIND_FILES: R2Bucket;
  XMIND_META: KVNamespace;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.MCP_AUTH_TOKEN) {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`)
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return Response.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
    if (url.pathname === '/mcp') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const server = createMcpServer(env);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      let body: unknown;
      try { body = await request.json(); }
      catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
      const chunks: string[] = []; let statusCode = 200; const resHeaders: Record<string, string> = {};
      const resShim = { setHeader: (n: string, v: string) => { resHeaders[n] = v; }, writeHead: (c: number) => { statusCode = c; }, write: (s: string) => { chunks.push(s); }, end: (s?: string) => { if (s) chunks.push(s); }, json: (d: unknown) => { chunks.push(JSON.stringify(d)); }, headersSent: false, on: () => resShim };
      await transport.handleRequest(reqShim as never, resShim as never, body);
      return new Response(chunks.join(''), { status: statusCode, headers: { 'Content-Type': 'application/json', ...resHeaders } });
    }
    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    function reqShim() {} // placeholder
  },
};
