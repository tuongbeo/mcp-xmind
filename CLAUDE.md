# CLAUDE.md — mcp-xmind Cloudflare Workers Edition

## Project Overview

Fork of [apeyroux/mcp-xmind](https://github.com/apeyroux/mcp-xmind), upgraded to:

1. Deploy as a **Cloudflare Workers** HTTP MCP server (replacing the original stdio/Node.js model)
2. Add **missing CRUD operations**: `update_node`, `delete_node`, `add_node`, `move_node`
3. Add **export capabilities**: Markdown / JSON / HTML from XMind files
4. **KV-only storage**: single `XMIND_STORE` KV namespace for both file content (base64) and metadata
5. Full **TypeScript strict** codebase
6. Test suite using **Vitest + `@cloudflare/vitest-pool-workers`**

---

## Build & Test

```bash
npm install --legacy-peer-deps
npm run build          # tsc compile
npm run typecheck      # type check only
npm test               # vitest run (all)
npm run test:unit      # unit tests only
npm run test:integration
npm run test:e2e
npm run lint
npm run validate       # lint + typecheck + test
```

---

## Repository Structure

```
src/
├── index.ts                  # CF Workers entrypoint + inline JSON-RPC MCP handler
├── core/
│   ├── types.ts              # All shared TypeScript interfaces
│   ├── xmind-parser.ts       # Parse .xmind ZIP → XMindDocument
│   ├── xmind-builder.ts      # XMindDocument → .xmind ZIP
│   ├── xmind-mutator.ts      # Pure in-memory CRUD on XMindDocument
│   └── xmind-exporter.ts     # Render XMindDocument → Markdown/JSON/HTML
├── storage/
│   └── kv-adapter.ts         # KV read/write/list wrapper (file + metadata)
├── tools/
│   ├── _shared.ts            # readDoc / persistDoc / outputKey helpers
│   ├── read.ts               # read_xmind, read_multiple_xmind_files, list_xmind_directory
│   ├── create.ts             # create_xmind
│   ├── update.ts             # update_node, add_node, move_node
│   ├── delete.ts             # delete_node, delete_sheet
│   ├── search.ts             # search_nodes, extract_node, extract_node_by_id
│   ├── tasks.ts              # get_todo_tasks
│   ├── export.ts             # export_to_markdown, export_to_json, export_to_html
│   └── storage.ts            # upload_xmind, get_file_url
└── utils/
    ├── zip.ts                # fflate-based ZIP helpers
    ├── fuzzy.ts              # Fuzzy search helper
    └── errors.ts             # Typed XmindError with error codes
test/
├── fixtures/                 # Sample .xmind files (deterministic IDs)
├── unit/                     # Core layer tests (no CF bindings)
├── integration/              # Tool-level tests (Miniflare bindings)
└── e2e/                      # Full MCP protocol tests
```

---

## Architecture

### Transport: Stateless HTTP JSON-RPC

```
MCP Client (Claude Desktop / Claude.ai)
        │  POST /mcp  (JSON-RPC 2.0)
        ▼
Cloudflare Workers (src/index.ts)
        │  inline JSON-RPC handler (no StreamableHTTPServerTransport)
        │
        ├── McpServer tools → src/tools/*.ts
        └── KVAdapter → XMIND_STORE (single KV namespace)
```

### KV Storage Convention

Single namespace `XMIND_STORE` with two key prefixes:

| Key | Value |
|---|---|
| `file:<uuid>/<name>.xmind` | Base64-encoded .xmind ZIP |
| `meta:<uuid>/<name>.xmind` | JSON `FileMetadata` |

All file access goes through `KVAdapter` in `src/storage/kv-adapter.ts`.
**Never call `env.XMIND_STORE` directly in tool files** — always use `KVAdapter`.

### wrangler.toml Bindings

```toml
[[kv_namespaces]]
binding = "XMIND_STORE"
id = "<your-kv-id>"

[vars]
MCP_AUTH_TOKEN = ""   # Optional Bearer token
MAX_FILE_SIZE_MB = "10"
```

---

## Internal Data Model (src/core/types.ts)

All XMind XML/JSON is parsed into a normalized internal model.
**Never manipulate raw XML/ZIP strings directly** — always go through parser → model → builder.

```typescript
interface XMindDocument {
  sheets: XMindSheet[];
}

interface XMindSheet {
  id: string;
  title: string;
  rootTopic: XMindTopic;
  relationships?: XMindRelationship[];
  theme?: string;
  layout?: LayoutType;
}

interface XMindTopic {
  id: string;
  title: string;
  children?: XMindTopic[];
  notes?: { plain?: string; html?: string };
  labels?: string[];
  markers?: string[];          // Format: "Category.name" e.g. "Task.done"
  callout?: string;
  href?: string;               // Internal link: "xmind:#<topicId>"
  tasks?: XMindTask;
  branch?: "folded" | "open";
  structureClass?: string;
}

interface XMindTask {
  due?: string;       // ISO date
  assignee?: string;
  priority?: 1 | 2 | 3;
  progress?: number;  // 0-100
  status?: "todo" | "in-progress" | "done";
}

type LayoutType = "map" | "org-chart" | "fishbone" | "timeline" | "tree-table";
```

---

## Coding Standards

- All functions have explicit return type annotations
- Zod validation on every tool input before processing
- Never use `any` — use `unknown` and narrow
- Never throw raw `Error` — use `XmindError` with typed error codes
- `Promise.all()` for independent async operations (never sequential awaits)
- ESM only — no `require()`, no `fs`, no `path`, no `Buffer`
- Use `Uint8Array` / `ArrayBuffer`, use `TextDecoder` (not `.toString()` on buffers)
- IDs generated via `crypto.randomUUID()` truncated to 26 chars, no dashes

### Error Codes (src/utils/errors.ts)

```typescript
type ErrorCode =
  | 'FILE_NOT_FOUND' | 'NODE_NOT_FOUND' | 'CANNOT_DELETE_ROOT'
  | 'CIRCULAR_REFERENCE' | 'LAST_SHEET' | 'INVALID_UPDATES'
  | 'CORRUPT_FILE' | 'FILE_TOO_LARGE' | 'PARSE_ERROR';
```

---

## XMind Format Notes

- `.xmind` = ZIP containing `content.json` (XMind 2023+) or `content.xml` (XMind 8)
- Topics require `class: "topic"`, sheets require `class: "sheet"` + `theme: {}`
- Planned tasks need `extensions` with `org.xmind.ui.working-day-settings` at sheet level
- `topicOverlapping: "overlap"` required at sheet level
- Notes HTML: `realHTML.content` (supported tags: `<strong>`, `<u>`, `<ul>`, `<ol>`, `<li>`, `<br>`) — `<code>` not supported by XMind
- Internal topic links: `href: "xmind:#<topicId>"`

---

## Tool Reference (18 tools)

| Tool | Category | Description |
|---|---|---|
| `read_xmind` | Read | Parse and return full document |
| `read_multiple_xmind_files` | Read | Load multiple files in parallel |
| `list_xmind_directory` | Read | List files with metadata |
| `get_todo_tasks` | Read | Extract all task items with path |
| `search_nodes` | Search | Fuzzy search title/notes/labels |
| `extract_node` | Search | Find node by path query |
| `extract_node_by_id` | Search | Find node by exact ID |
| `create_xmind` | Write | Create new .xmind from structure |
| `update_node` | Write | Modify existing node fields |
| `add_node` | Write | Add child node to parent |
| `move_node` | Write | Re-parent a node |
| `delete_node` | Write | Remove node (with/without children) |
| `delete_sheet` | Write | Remove entire sheet |
| `upload_xmind` | Storage | Upload base64-encoded .xmind |
| `get_file_url` | Storage | Retrieve file as base64 for download |
| `export_to_markdown` | Export | Render map as Markdown outline |
| `export_to_json` | Export | Serialize document to JSON |
| `export_to_html` | Export | Render as collapsible HTML tree |

---

## Known Limitations

- **No presigned URLs**: `get_file_url` returns base64 content directly (KV doesn't support signed URLs).
- **No R2**: All content stored in KV as base64. KV value limit is 25 MB per key.
- **No Durable Objects**: Server is fully stateless — each tool call reads from KV, mutates in memory, writes back. No session caching.
- **No image export**: CF Workers has no DOM/canvas for visual rendering.
- **No XMind.com sync**: Cloud API not publicly documented.
