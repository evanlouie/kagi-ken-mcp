import { match } from "ts-pattern";

import pkg from "../../package.json";

const { version } = pkg;

export function generalHelp(): string {
  return `tobira v${version}

Usage:
  tobira <command> [options]

Commands:
  search <query...>       Search Kagi. Accepts one or more queries.
  summarize <url>         Summarize a URL using Kagi Summarizer.
  mcp                     Start the MCP stdio server.

Global options:
  -h, --help              Show help.
  -v, --version           Show version.

Run "tobira <command> --help" for command-specific help.`;
}

export function searchHelp(): string {
  return `Usage:
  tobira search <query...> [options]

Search Kagi for one to ten queries. Each positional argument is treated as one complete query.

Options:
  --limit <number>        Maximum results per query. Default: 10, max: 50.
  -h, --help              Show help for this command.

Examples:
  tobira search "time person of the year 2024"
  tobira search "bun cli parser" "kagi search examples" --limit 5`;
}

export function summarizeHelp(): string {
  return `Usage:
  tobira summarize <url> [options]

Summarize a URL using Kagi Summarizer.

Options:
  --type <type>           Summary type: article, keypoints, or eli5. Default: article.
  --summary-type <type>   Alias for --type.
  --length <length>       Article summary length: headline, overview, digest, medium, or long.
  --language <code>       Target language code, e.g. EN, DE, FR.
  --target-language <code>
                           Alias for --language.
  -h, --help              Show help for this command.

Examples:
  tobira summarize https://example.com/article
  tobira summarize https://example.com/article --type keypoints --language EN
  tobira summarize https://example.com/article --type article --length digest --language EN`;
}

export function mcpHelp(): string {
  return `Usage:
  tobira mcp

Start the Tobira MCP stdio server.

The server exposes the MCP tools:
  kagi_search_fetch
  kagi_summarizer`;
}

export function commandHelp(topic?: string): string {
  return match(topic)
    .with("search", () => searchHelp())
    .with("summarize", "summary", () => summarizeHelp())
    .with("mcp", () => mcpHelp())
    .otherwise(() => generalHelp());
}
