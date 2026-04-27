# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kagi-ken-mcp is an MCP (Model Context Protocol) server that exposes Kagi search and summarization as tools for Claude Desktop/Code. It uses session tokens (not API keys) with an inlined Kagi client under `src/kagi/`. Use Bun as the runtime.

## Commands

```bash
bun install                                              # Install dependencies
bun run start                                            # Run the MCP server
bun run dev                                              # Run with inspector
bun run typecheck                                        # Type-check with tsgo
bun run lint                                             # Lint with oxlint
bun run fmt                                              # Format with oxfmt
bun test                                                 # Run unit tests; live integrations skip by default
bun run test:integration                                 # Run live Kagi integration tests with KAGI_INTEGRATION=1
bunx @modelcontextprotocol/inspector bun src/index.ts    # Debug with MCP Inspector (localhost:5173)
```

## Architecture

The server uses `@modelcontextprotocol/sdk` with stdio transport. Entry point is `src/index.ts` which creates a `KagiKenMcpServer` class that registers two tools:

- **`kagi_search_fetch`** (`src/tools/search.ts`) — concurrent multi-query search via `Promise.allSettled()` with abortable 10s per-query timeouts and a max of 10 queries
- **`kagi_summarizer`** (`src/tools/summarizer.ts`) — URL summarization with configurable summary type/language and an abortable 60s timeout

Each tool module exports a handler function and a config object (name, description, inputSchema). Tools return MCP-compliant `{ content: [{ type: "text", text }] }` responses.

**Kagi API client** (`src/kagi/`): Inlined HTTP client (originally from the external `kagi-ken` package). Contains `http.ts` (request handling, response validation, auth/challenge detection), `search.ts`, and `summarize.ts`.

**Token resolution** (`src/utils/auth.ts`): `KAGI_SESSION_TOKEN` env var > `~/.kagi_session_token` file.

**Result formatting** (`src/utils/formatting.ts`): Search output format matches the official Python Kagi MCP server. Results with `t === 1` (related searches) are filtered out; only `t === 0` (actual results) are included.

## Critical: MCP Input Schema Format

Input schemas must be plain objects with Zod validators as values, **not** wrapped in `z.object()`:

```js
// Correct
export const schema = { queries: z.array(z.string()).min(1) };

// Wrong — will break MCP tool registration
export const schema = z.object({ queries: z.array(z.string()).min(1) });
```

## Dependencies

- Kagi API client is inlined in `src/kagi/` (originally from the `kagi-ken` package)
- Use Bun as the runtime
- ES modules (`"type": "module"` in package.json)
