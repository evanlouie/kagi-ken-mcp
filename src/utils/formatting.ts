import { resolveToken } from "./auth.ts";
import type { SearchResultItem } from "../kagi/search.ts";

interface SearchResponseLike {
  results?: SearchResultItem[];
  data?: SearchResultItem[];
}

export function formatSearchResults(
  queries: string[],
  responses: SearchResponseLike[],
): string {
  const resultTemplate = (
    resultNumber: number,
    title: string,
    url: string,
    published: string,
    snippet: string,
  ) =>
    `${resultNumber}: ${title}
${url}
Published Date: ${published}
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

    const results = (response?.results || response?.data || []).filter(
      (item) => item.t === 0,
    );

    const formattedResultsList = results.map((result, index) => {
      const resultNumber = startIndex + index;
      if (result.t !== 0) return "";
      return resultTemplate(
        resultNumber,
        result.title || "No Title",
        result.url || "",
        "Not Available",
        result.snippet || "No snippet available",
      );
    });

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

export interface EnvironmentConfig {
  token: string;
  engine: string;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const token = resolveToken();
  const engine = process.env.KAGI_SUMMARIZER_ENGINE || "default";
  return { token, engine };
}
