import { search, type SearchResponse } from "../kagi/search.ts";
import { resolveToken } from "../utils/auth.ts";
import { errorMessage, formatError, formatSearchResults } from "../utils/formatting.ts";
import { withTimeout } from "../utils/timeout.ts";
import { z } from "zod";

const SEARCH_TIMEOUT_MS = 10_000;
const MAX_QUERIES = 10;

export const searchInputSchema = {
  queries: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_QUERIES)
    .describe(
      "One to ten concise, keyword-focused search queries. Include essential context within each query for standalone use.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of search results per query (default: 10, max: 50)"),
};

/** MCP tool handler that runs concurrent Kagi searches with per-query timeouts and returns formatted results. */
export async function kagiSearchFetch({
  queries,
  limit = 10,
}: {
  queries: string[];
  limit?: number;
}) {
  try {
    const token = resolveToken();
    const normalizedQueries = queries.map((query) => query.trim());

    if (normalizedQueries.length === 0 || normalizedQueries.some((query) => query === "")) {
      throw new Error("At least one non-empty search query is required");
    }

    if (normalizedQueries.length > MAX_QUERIES) {
      throw new Error(`At most ${MAX_QUERIES} search queries are allowed`);
    }

    const results = await Promise.allSettled(
      normalizedQueries.map((query) =>
        withTimeout(
          (signal) => search(query, token, limit, { signal }),
          SEARCH_TIMEOUT_MS,
          "Search timeout",
        ),
      ),
    );

    const responses: SearchResponse[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        errors.push(`Query "${normalizedQueries[i]}": ${errorMessage(result.reason)}`);
        responses.push({ data: [] });
      }
    }

    const formattedResults = formatSearchResults(normalizedQueries, responses);

    let finalResponse = formattedResults;
    if (errors.length > 0) {
      finalResponse += "\n\nErrors encountered:\n" + errors.join("\n");
    }

    return {
      content: [{ type: "text" as const, text: finalResponse }],
    };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: formatError(error) }],
    };
  }
}

export const searchToolConfig = {
  name: "kagi_search_fetch",
  description: `
    Fetch web results based on one or more queries using the Kagi.com web search engine. Use for
    general search and when the user explicitly tells you to 'fetch' results/information. Results are
    from all queries given. They are numbered continuously, so that a user may be able to refer to a
    result by a specific number. Supports optional limit parameter to control results per query.
    `
    .replaceAll(/\s+/gs, " ")
    .trim(),
  inputSchema: searchInputSchema,
};
