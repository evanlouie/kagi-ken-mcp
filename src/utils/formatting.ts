import type { SearchResponse } from "../kagi/search.ts";

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
  const { chunks } = queries.reduce(
    (acc, query, queryIndex) => {
      const results = responses[queryIndex]?.data ?? [];
      const base = acc.nextResultNumber;
      const formattedResults = results
        .map((result, index) =>
          resultTemplate(
            base + index,
            result.title ?? "No Title",
            result.url ?? "",
            result.snippet ?? "No snippet available",
          ),
        )
        .join("\n\n");

      acc.nextResultNumber += results.length;
      acc.chunks.push(queryResponseTemplate(query, formattedResults));
      return acc;
    },
    { nextResultNumber: 1, chunks: [] as string[] },
  );

  return chunks.join("\n\n");
}
