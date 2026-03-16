# mcp-xmind — Cloudflare Workers Edition

A Cloudflare Workers MCP server for reading, creating, editing, and exporting XMind mind maps via R2 + KV storage.

## Features

18 tools across 6 categories:

| Category | Tools |
|---|---|
| Read | `read_xmind`, `read_multiple_xmind_files`, `list_xmind_directory` |
| Write | `create_xmind`, `update_node`, `add_node`, `move_node`, `delete_node`, `delete_sheet` |
| Search | `search_nodes`, `extract_node`, `extract_node_by_id` |
| Tasks | `get_todo_tasks` |
| Export | `export_to_markdown`, `export_to_json`, `export_to_html` |
| Storage | `upload_xmind`, `get_file_url` |

## Quick Start

```bash
npm install --legacy-peer-deps
npm run typecheck
npm test
```

## Deploy

```bash
wrangler r2 bucket create xmind-files
wrangler kv:namespace create XMIND_META
# Update wrangler.toml with the IDs returned above
wrangler deploy
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "xmind": {
      "type": "http",
      "url": "https://mcp-xmind.<subdomain>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript (strict)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **ZIP**: `fflate` (edge-compatible)
- **XML**: `fast-xml-parser`
- **Storage**: Cloudflare R2 + KV
- **Tests**: Vitest + `@cloudflare/vitest-pool-workers`

## Architecture

```
POST /mcp → Cloudflare Worker → McpServer
                                 ├── tools/read.ts
                                 ├── tools/create.ts
                                 ├── tools/update.ts
                                 ├── tools/delete.ts
                                 ├── tools/search.ts
                                 ├── tools/tasks.ts
                                 ├── tools/export.ts
                                 └── tools/storage.ts
```

## Fork

Based on [apeyroux/mcp-xmind](https://github.com/apeyroux/mcp-xmind), rewritten for Cloudflare Workers.
