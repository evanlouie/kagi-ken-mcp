import { resolveToken } from "./auth.ts";
import type { SearchResult } from "../kagi/search.ts";

interface SearchResponseLike {
  results?: SearchResult[];
  data?: SearchResult[];
}

export function formatSearchResults(
  queries: string[],
  responses: SearchResponseLike[],
): string {
  const resultTemplate = (
    resultNumber: number,
    title: string,
    url: string,
    snippet: string,
  ) =>
    `${resultNumber}: ${title}
${url}
Published Date: Not Available
${snippet}`;

  const queryResponseTemplate = (
    query: string,
    formattedSearchResults: string,
  ) =>
    `-----
Results for search query "${query}":
-----
${formattedSearchResults}`;

  const perQueryResponseStrs: string[] = [];
  let startIndex = 1;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!;
    const response = responses[i];

    const results = response?.results || response?.data || [];

    const formattedResultsList = results.map((result, index) =>
      resultTemplate(
        startIndex + index,
        result.title || "No Title",
        result.url || "",
        result.snippet || "No snippet available",
      ),
    );

    startIndex += results.length;

    const formattedResultsStr = formattedResultsList.join("\n\n");
    const queryResponseStr = queryResponseTemplate(query, formattedResultsStr);
    perQueryResponseStrs.push(queryResponseStr);
  }

  return perQueryResponseStrs.join("\n\n");
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message || error.toString()}`;
  }
  return `Error: ${error || "Unknown error occurred"}`;
}

export function getToken(): string {
  return resolveToken();
}
