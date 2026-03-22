# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kagi-ken-mcp is an MCP (Model Context Protocol) server that exposes Kagi search and summarization as tools for Claude Desktop/Code. It uses session tokens (not API keys) via the `kagi-ken` package. Use Bun as the runtime.

## Commands

```bash
bun install                                              # Install dependencies
bun run start                                            # Run the MCP server
bun run dev                                              # Run with inspector
bunx @modelcontextprotocol/inspector bun src/index.js    # Debug with MCP Inspector (localhost:5173)
```

There are no tests or linting configured.

## Architecture

The server uses `@modelcontextprotocol/sdk` with stdio transport. Entry point is `src/index.js` which creates a `KagiKenMcpServer` class that registers two tools:

- **`kagi_search_fetch`** (`src/tools/search.js`) — concurrent multi-query search via `Promise.allSettled()` with 10s per-query timeouts
- **`kagi_summarizer`** (`src/tools/summarizer.js`) — URL summarization with configurable summary type and language

Each tool module exports a handler function and a config object (name, description, inputSchema). Tools return MCP-compliant `{ content: [{ type: "text", text }] }` responses.

**Token resolution** (`src/utils/auth.js`): `KAGI_SESSION_TOKEN` env var > `~/.kagi_session_token` file.

**Result formatting** (`src/utils/formatting.js`): Search output format matches the official Python Kagi MCP server. Results with `t === 1` (related searches) are filtered out; only `t === 0` (actual results) are included.

## Critical: MCP Input Schema Format

Input schemas must be plain objects with Zod validators as values, **not** wrapped in `z.object()`:

```js
// Correct
export const schema = { queries: z.array(z.string()).min(1) };

// Wrong — will break MCP tool registration
export const schema = z.object({ queries: z.array(z.string()).min(1) });
```

## Dependencies

- `kagi-ken` is a GitHub dependency (`github:czottmann/kagi-ken#1.3.0`), not from npm
- Use Bun as the runtime (package.json still lists Node.js >= 22.0.0 in engines)
- ES modules (`"type": "module"` in package.json)
