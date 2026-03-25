import type { SearchResponse } from "../kagi/search.ts";

/** Type guard that checks if an error is an ErrnoException-style error (has a `code` property). */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

const resultTemplate = (resultNumber: number, title: string, url: string, snippet: string) =>
  `${resultNumber}: ${title}
${url}
Published Date: Not Available
${snippet}`;

const queryResponseTemplate = (query: string, formattedSearchResults: string) =>
  `-----
Results for search query "${query}":
-----
${formattedSearchResults}`;

/** Formats search results from multiple queries into numbered, human-readable text matching the Kagi MCP output format. */
export function formatSearchResults(queries: string[], responses: SearchResponse[]): string {
  const perQueryResponseStrs: string[] = [];
  let startIndex = 1;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!;
    const results = responses[i]?.data ?? [];

    const base = startIndex;
    const formattedResultsList = results.map((result, index) =>
      resultTemplate(
        base + index,
        result.title ?? "No Title",
        result.url ?? "",
        result.snippet ?? "No snippet available",
      ),
    );

    startIndex += results.length;

    const formattedResultsStr = formattedResultsList.join("\n\n");
    const queryResponseStr = queryResponseTemplate(query, formattedResultsStr);
    perQueryResponseStrs.push(queryResponseStr);
  }

  return perQueryResponseStrs.join("\n\n");
}

/** Extracts a message string from an unknown error, falling back to `String()` for non-Error values. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Formats an unknown error into a user-facing "Error: ..." string. */
export function formatError(error: unknown): string {
  return `Error: ${errorMessage(error) || "Unknown error occurred"}`;
}
