# mcp-xmind — Cloudflare Workers Edition

A Cloudflare Workers MCP server for reading, creating, editing, and exporting XMind mind maps.
All files and metadata are stored in a **single Cloudflare KV namespace** — no R2 required, works on the free plan.

Live endpoint: **https://xmind.tuongbeo.workers.dev**

## Features

19 tools across 7 categories:

| Category | Tools |
|---|---|
| Read | `read_xmind`, `read_multiple_xmind_files`, `list_xmind_directory` |
| Write | `create_xmind`, `update_node`, `add_node`, `move_node`, `delete_node`, `delete_sheet` |
| Search | `search_nodes`, `extract_node`, `extract_node_by_id` |
| Tasks | `get_todo_tasks` |
| Export | `export_to_markdown`, `export_to_json`, `export_to_html` |
| Storage | `upload_xmind`, `get_file_url` |
| **Render** | **`render_xmind`** — interactive markmap inline in Claude Chat / Cowork |

### render_xmind — Inline Mindmap

`render_xmind` returns a self-contained HTML artifact with:
- Interactive markmap (zoom, pan, click to collapse/expand)
- Task status icons: ☐ todo · ◑ in-progress · ☑ done
- **Download .xmind button** (base64 embedded, works offline)
- 4 themes: `default`, `colorful`, `dark`, `forest`

Uses `markmap-lib` + `markmap-view` with explicit JS init — **not** `markmap-autoloader`
(autoloader fails in Claude's sandboxed artifact iframe with a YAML worker CSP error).

## Quick Start

```bash
npm install --legacy-peer-deps
npm run typecheck
npm test
```

## Deploy

```bash
# 1. Create KV namespace
wrangler kv:namespace create XMIND_STORE

# 2. Update wrangler.toml with the ID returned above

# 3. Deploy
wrangler deploy

# 4. Smoke test
curl https://<worker>.workers.dev/health
```

## wrangler.toml

```toml
name = "xmind"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "XMIND_STORE"
id = "<your-kv-id>"

[vars]
MCP_AUTH_TOKEN = ""
MAX_FILE_SIZE_MB = "10"
```

## Claude Desktop / Claude.ai Config

```json
{
  "mcpServers": {
    "xmind": {
      "type": "http",
      "url": "https://<worker>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Language | TypeScript (strict) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| ZIP | `fflate` (edge-compatible, no Node.js fs) |
| XML | `fast-xml-parser` |
| Storage | Cloudflare KV (files as base64 + metadata) |
| Tests | Vitest + `@cloudflare/vitest-pool-workers` |

## Storage Design

KV keys follow a two-prefix convention inside a single namespace (`XMIND_STORE`):

| Key pattern | Content |
|---|---|
| `file:<uuid>/<name>.xmind` | Base64-encoded .xmind ZIP |
| `meta:<uuid>/<name>.xmind` | JSON metadata (fileSize, sheetCount, nodeCount, timestamps) |

Max value size is 25 MB per KV entry — sufficient for text-heavy mind maps up to ~10 MB.
For files with heavy embedded images, increase `MAX_FILE_SIZE_MB` and verify your KV plan limits.

## Architecture

```
POST /mcp → Cloudflare Worker (src/index.ts)
                │
                ├── McpServer (inline JSON-RPC handler)
                │       ├── tools/read.ts
                │       ├── tools/create.ts
                │       ├── tools/update.ts
                │       ├── tools/delete.ts
                │       ├── tools/search.ts
                │       ├── tools/tasks.ts
                │       ├── tools/export.ts
                │       ├── tools/storage.ts
                │       └── tools/render.ts
                │
                └── KVAdapter (src/storage/kv-adapter.ts)
                        └── XMIND_STORE (single KV namespace)
```

## Limitations

- **No presigned URLs**: `get_file_url` returns base64-encoded content directly (no R2 presigned URL).
- **No image export**: Rendering visual mind maps requires a DOM/canvas, unavailable in CF Workers.
- **KV value limit**: 25 MB per entry. Very large files with embedded images may exceed this.
- **No XMind.com cloud sync**: XMind's cloud API is not publicly documented.

## Fork

Based on [apeyroux/mcp-xmind](https://github.com/apeyroux/mcp-xmind), rewritten for Cloudflare Workers.
