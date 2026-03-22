import { search } from "../kagi/search.ts";
import {
  formatError,
  formatSearchResults,
  getEnvironmentConfig,
} from "../utils/formatting.ts";
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
    .describe(
      "Maximum number of search results per query (default: 10, max: 50)",
    ),
};

export async function kagiSearchFetch({
  queries,
  limit = 10,
}: {
  queries: string[];
  limit?: number;
}) {
  try {
    if (!queries || queries.length === 0) {
      throw new Error("Search called with no queries.");
    }

    const { token } = getEnvironmentConfig();

    const searchPromises = queries.map((query) => {
      if (typeof query !== "string" || query.trim() === "") {
        throw new Error("All queries must be non-empty strings");
      }
      return search(query.trim(), token, limit);
    });

    const results = await Promise.allSettled(
      searchPromises.map((promise) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Search timeout")), 10000),
          ),
        ]),
      ),
    );

    const responses: { results?: never[]; data?: unknown[] }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        responses.push(result.value as { data?: unknown[] });
      } else {
        errors.push(
          `Query "${queries[i]}": ${result.reason?.message || result.reason}`,
        );
        responses.push({ results: [] });
      }
    }

    const formattedResults = formatSearchResults(queries, responses as any);

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
    .replace(/\s+/gs, " ")
    .trim(),
  inputSchema: searchInputSchema,
};
