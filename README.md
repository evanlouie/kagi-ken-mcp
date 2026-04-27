# kagi-ken-mcp

A lightweight Bun MCP server with an inlined Kagi session-token client, providing access to Kagi.com services using Kagi session tokens:

- **Search**: Searches Kagi
- **Summarizer**: Uses Kagi's Summarizer to create summaries from URLs or text content

Unlike the official Kagi API which requires API access, this MCP server uses your existing Kagi session to access both search and summarization features.

_"Kagi-ken"_ is a portmanteau of _"Kagi"_ (the service) and _"token"_.

## Why?

The [Kagi API](https://help.kagi.com/kagi/api/overview.html) requires a separate API key, which are invite-only at the moment. If you already have a Kagi subscription but no API access, yet want to programmatically access Kagi's services from LLMs or agents like Claude, this MCP server provides an alternative.

## Features

- **Search**: Fetch web results using Kagi Search with concurrent query processing
- **Summarization**: Summarize content from URLs with customizable output types and languages

The server supports two methods for using your Kagi session token (see [Installation](#installation)), in this order:

1. `KAGI_SESSION_TOKEN` environment variable
2. `~/.kagi_session_token` file containing the token string

It includes comprehensive error handling:

- Abortable timeouts (10 seconds per search query, 60 seconds per summarization)
- Invalid input validation
- Environment variable validation
- Explicit invalid-token and browser-verification detection
- Graceful error formatting

<a href="https://glama.ai/mcp/servers/@evanlouie/kagi-ken-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@evanlouie/kagi-ken-mcp/badge" alt="kagi-kan-mcp MCP server" />
</a>

## Installation

Bun is required.

### 1. Get Kagi Session Token

1. Visit [Kagi Settings](https://kagi.com/settings/user_details) in your browser
2. Copy the **Session Link**
3. Extract the `token` value from the link
4. Use that value as your session token: save to `~/.kagi_session_token` (recommended), alternatively pass as `KAGI_SESSION_TOKEN` env variable

The server will automatically try the environment variable first, then fall back to the token file.

> [!WARNING]
> **Security Note**: Keep your session token private. It provides access to your Kagi account.

### 2.a. Add MCP server to Claude Desktop

Add kagi-ken-mcp to your `claude_desktop_config.json` which you can open from the Claude Desktop app via Settings → Developer → Local MCP Servers → Edit Config.

#### Option 1: Using token file (recommended)

```json
{
  "mcpServers": {
    "kagi-ken-mcp": {
      "command": "bunx",
      "args": ["github:evanlouie/kagi-ken-mcp"]
    }
  }
}
```

#### Option 2: Using environment variable

```json
{
  "mcpServers": {
    "kagi-ken-mcp": {
      "command": "bunx",
      "args": ["github:evanlouie/kagi-ken-mcp"],
      "env": {
        "KAGI_SESSION_TOKEN": "YOUR_SESSION_TOKEN_HERE"
      }
    }
  }
}
```

#### Post-install

[Disable Claude Desktop's built-in websearch](assets/claude-desktop-disable-websearch.png) so it'll use this here MCP server. And maybe add this to your "Personal preferences" (i.e., system prompt) in Settings:

```
For web searches, use kagi-ken-mcp MCP server's `kagi_search_fetch` tool.
For summarizing a URL, use the kagi-ken-mcp MCP server's `kagi_summarizer` tool.
```

### 2.b. Add MCP server to Claude Code

#### Option 1: Using token file (recommended)

```bash
claude mcp add kagi-ken-mcp --scope user -- bunx github:evanlouie/kagi-ken-mcp
```

#### Option 2: Using environment variable

```bash
claude mcp add kagi-ken-mcp \
  --scope user \
  --env KAGI_SESSION_TOKEN="YOUR_SESSION_TOKEN_HERE" -- \
  bunx github:evanlouie/kagi-ken-mcp
```

#### Post-install

Disable Claude Code's built-in web search (optional) by setting the permission in the relevant `.claude/settings*.json` file:

```json
{
  "permissions": {
    "deny": ["WebSearch"],
    "allow": [
      "mcp__kagi-ken-mcp__kagi_search_fetch",
      "mcp__kagi-ken-mcp__kagi_summarizer"
    ]
  }
}
```

## Usage: Pose query that requires use of a tool

e.g. _"Who was time's 2024 person of the year?"_ for search, or "summarize this video: https://www.youtube.com/watch?v=sczwaYyaevY" for summarizer.

## Tools

### `kagi_search_fetch`

Fetch web results based on one or more queries using Kagi Search. Results are numbered continuously for easy reference.

**Parameters:**

- `queries` (array of strings): One to ten non-empty search queries
- `limit` (number, optional): Maximum number of results per query (default: 10, max: 50)

### `kagi_summarizer`

Summarize content from URLs using the Kagi Summarizer API. Supports various document types including webpages, videos, and audio.

**Parameters:**

- `url` (string): URL to summarize
- `summary_type` (enum): `"keypoints"` for concise bullets, `"eli5"` for a simplified explanation, or `"article"` for a prose summary (default: `"article"`)
- `summary_length` (enum, optional): Only used with `"article"`; one of `"headline"`, `"overview"`, `"digest"`, `"medium"`, or `"long"`
- `target_language` (string, optional): Language code (e.g., `"EN"` for English, default: `"EN"`)

## Development

### Project Structure

```
kagi-ken-mcp/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── kagi/
│   │   ├── http.ts           # Kagi HTTP helpers and response validation
│   │   ├── search.ts         # Inlined Kagi search client/parser
│   │   └── summarize.ts      # Inlined Kagi summarizer client/parser
│   ├── tools/
│   │   ├── search.ts         # Search tool implementation
│   │   └── summarizer.ts     # Summarizer tool implementation
│   └── utils/
│       ├── auth.ts           # Session token resolution
│       ├── formatting.ts     # Output/error formatting helpers
│       └── timeout.ts        # Abortable timeout helper
├── package.json
└── README.md
```

### Installation

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd kagi-ken-mcp
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

### Running in Development Mode

```bash
bun run dev
```

### Testing

```bash
bun test                 # Unit tests; live integration tests are skipped by default
bun run test:integration # Opt into live Kagi integration tests
```

### Debugging

Use the MCP Inspector to debug:

```bash
bunx @modelcontextprotocol/inspector bun ./src/index.ts
```

Then access the inspector at `http://localhost:5173`. If using environment variables, add your `KAGI_SESSION_TOKEN` in the environment variables section of the inspector.

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with the MCP Inspector
5. Submit a pull request

## Author

Carlo Zottmann, <carlo@zottmann.dev>, https://c.zottmann.dev, https://github.com/czottmann.

This project is neither affiliated with nor endorsed by Kagi. I'm just a very happy customer.

> [!TIP]
> I make Shortcuts-related macOS & iOS productivity apps like [Actions For Obsidian](https://actions.work/actions-for-obsidian), [Browser Actions](https://actions.work/browser-actions) (which adds Shortcuts support for several major browsers), and [BarCuts](https://actions.work/barcuts) (a surprisingly useful contextual Shortcuts launcher). Check them out!

## Related Projects

- [czottmann/kagi-ken](https://github.com/czottmann/kagi-ken) - Unofficial session token-based Kagi client, Node
- [czottmann/kagi-ken-cli](https://github.com/czottmann/kagi-ken-cli) - Unofficial Node session token-based CLI tool, Node
- [Official Kagi MCP Server](https://github.com/kagisearch/kagimcp) - Python
- [Model Context Protocol](https://modelcontextprotocol.io/)
