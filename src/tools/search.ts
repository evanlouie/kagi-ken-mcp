import { err, ok, ResultAsync, type Result } from "neverthrow";
import { match } from "ts-pattern";
import { z } from "zod";

import { search, type SearchResponse } from "../kagi/search.ts";
import { resolveToken } from "../utils/auth.ts";
import { errorMessage, formatAppError, type AppError } from "../utils/errors.ts";
import { formatSearchResults } from "../utils/formatting.ts";
import { withTimeout } from "../utils/timeout.ts";

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

const textContent = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

function normalizeQueries(queries: string[]): Result<string[], AppError> {
  const normalizedQueries = queries.map((query) => query.trim());

  return match(normalizedQueries)
    .when(
      (queries) => queries.length === 0 || queries.some((query) => query === ""),
      () =>
        err({
          type: "ValidationError" as const,
          message: "At least one non-empty search query is required",
        }),
    )
    .when(
      (queries) => queries.length > MAX_QUERIES,
      () =>
        err({
          type: "ValidationError" as const,
          message: `At most ${MAX_QUERIES} search queries are allowed`,
        }),
    )
    .otherwise((queries) => ok(queries));
}

function searchAll({
  token,
  queries,
  limit,
}: {
  token: string;
  queries: string[];
  limit: number;
}): ResultAsync<string, AppError> {
  return new ResultAsync(
    (async () => {
      const results = await Promise.all(
        queries.map((query) =>
          withTimeout(
            (signal) => search(query, token, limit, { signal }),
            SEARCH_TIMEOUT_MS,
            "Search timeout",
          ),
        ),
      );

      const { responses, errors } = results.reduce(
        (acc, result, index) =>
          result.match(
            (response) => {
              acc.responses.push(response);
              return acc;
            },
            (error) => {
              acc.responses.push({ data: [] });
              acc.errors.push(`Query "${queries[index] ?? ""}": ${errorMessage(error)}`);
              return acc;
            },
          ),
        { responses: [] as SearchResponse[], errors: [] as string[] },
      );

      return ok(
        match(errors.length)
          .with(0, () => formatSearchResults(queries, responses))
          .otherwise(
            () =>
              `${formatSearchResults(queries, responses)}\n\nErrors encountered:\n${errors.join("\n")}`,
          ),
      );
    })(),
  );
}

export async function runSearch({
  queries,
  limit = 10,
}: {
  queries: string[];
  limit?: number;
}): Promise<Result<string, AppError>> {
  return await resolveToken()
    .andThen((token) => normalizeQueries(queries).map((queries) => ({ token, queries, limit })))
    .asyncAndThen(searchAll);
}

/** MCP tool handler that runs concurrent Kagi searches with per-query timeouts and returns formatted results. */
export async function kagiSearchFetch(args: { queries: string[]; limit?: number }) {
  const result = await runSearch(args);
  return textContent(result.match((text) => text, formatAppError));
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
