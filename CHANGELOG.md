# Changelog

## [2.0.1] - 2026-03-17

### Fixed
- **SDK 1.27.x compatibility** (`src/index.ts`): `callTool()` now passes the tool
  object (not the tool name string) to `executeToolHandler(tool, args, extra)` and
  uses `validateToolInput(tool, args, name)` for Zod parsing. The old signature
  `executeToolHandler(name, args)` was removed in SDK 1.27.x, causing every tool
  call to crash with `Cannot use 'in' operator to search for 'createTask' in
  undefined`.
- **XML parser children bug** (`src/core/xmind-parser.ts`): `fast-xml-parser` with
  `isArray: ['children']` wraps `<children>` in an array. `parseTopicXml` now
  unwraps `children[0]` before accessing `.topic`, fixing child parsing for XMind 8
  XML files.

### Added (tests)
- `test/unit/xmind-parser-xml.test.ts` — 12 tests covering the XMind 8 XML path
  (`content.xml`): children, notes, multi-sheet, fallback IDs, error cases.
- `test/unit/kv-adapter.test.ts` — 12 tests covering `KVAdapter`: putFile/getFile
  roundtrip, Uint8Array input, delete, index/get/delete metadata, list with prefix,
  listFileKeys pagination.
- `test/unit/tools-handlers.test.ts` — 28 tests exercising all 18 MCP tool handlers
  directly (bypassing HTTP), covering create, read, update, add, move, delete,
  search, tasks, export, upload, and download.

### Changed
- `vitest.e2e.config.ts`: switched from `defineWorkersConfig` (Miniflare) to plain
  `defineConfig` with `environment: 'node'`. MCP SDK pulls CJS-only `ajv` which
  crashes in the CF Workers runtime shim.
- `test/e2e/mcp-protocol.test.ts`: updated `fakeEnv` to `XMIND_STORE` (single KV
  binding) replacing the now-removed `XMIND_FILES` + `XMIND_META` pair.
- `package.json`: pinned `vitest` and `@vitest/coverage-v8` to exact version `3.1.4`
  to prevent npm deduplication from dropping them when `NODE_ENV=production`.

### Coverage (after this release)
| Layer | Statements | Functions | Target |
|---|---|---|---|
| `src/core/` | 91% | 98% | ≥90% ✅ |
| `src/tools/` | 100% | 100% | ≥80% ✅ |
| `src/storage/` | 98% | 100% | ≥80% ✅ |

**Total: 126 tests passing** (42 unit · 27 integration · 52 new unit · 5 e2e)

## [2.0.0] - 2025-01-18

### Breaking Changes
- Upgraded to MCP SDK v1.11.0 (from v0.5.0)
- Migrated from deprecated `Server` class to new `McpServer` API
- Removed `zod-to-json-schema` and `diff` dependencies (no longer needed)

### Added
- Output schemas (Zod) for structured tool responses
- Explicit type annotations for all async functions
- Better schema descriptions for tool parameters
- Comprehensive unit test suite with vitest (25 tests)
- Test helpers for creating XMind test fixtures

### Changed
- Refactored all tool registrations to use `server.tool()` method
- Improved error handling with consistent error response format
- Simplified notes handling (removed duplicate condition)
- Updated `parseContentJson` to use native throw instead of Promise.reject
- Upgraded Zod to v3.25.0 for SDK compatibility

### Fixed
- Fixed duplicate condition check in notes processing
- Added missing return type `Promise<void>` to `scanDirectory` and `searchInDirectory` functions
- Fixed `runServer` return type annotation

## [1.1.1] - 2024-01-20

### Added
- Support for node relationships
- Enhanced search with task status filtering
- Improved callouts support

### Changed
- Removed get_todo_tasks in favor of search_nodes with status filter
- Optimized file searching
- Improved tool descriptions

### Fixed
- Fixed relationship parsing in content.json
- Better file path handling

## [1.0.0] - 2024-01-19

### Added
- Initial release
- Basic XMind file support
- Node and task extraction
- File searching capabilities
