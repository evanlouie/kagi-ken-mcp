import type { SearchResponse } from "../kagi/search.ts";

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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatError(error: unknown): string {
  return `Error: ${errorMessage(error) || "Unknown error occurred"}`;
}
