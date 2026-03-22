import { search, type SearchResponse } from "../kagi/search.ts";
import { errorMessage, formatError, formatSearchResults } from "../utils/formatting.ts";
import { resolveToken } from "../utils/auth.ts";
import { z } from "zod";

export const searchInputSchema = {
  queries: z
    .array(z.string())
    .min(1)
    .describe(
      "One or more concise, keyword-focused search queries. Include essential context within each query for standalone use.",
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

    const searchPromises = queries.map((query) => search(query.trim(), token, limit));

    const results = await Promise.allSettled(
      searchPromises.map((promise) =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            const id = setTimeout(() => { reject(new Error("Search timeout")); }, 10_000);
            void promise.finally(() => { clearTimeout(id); });
          }),
        ]),
      ),
    );

    const responses: SearchResponse[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        errors.push(`Query "${queries[i]}": ${errorMessage(result.reason)}`);
        responses.push({ data: [] });
      }
    }

    const formattedResults = formatSearchResults(queries, responses);

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
