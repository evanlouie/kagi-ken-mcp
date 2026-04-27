import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";

import type { AppError } from "../utils/errors.ts";
import {
  checkNotAuthOrChallengeResponse,
  checkResponseStatus,
  kagiHeaders,
  mapFetchError,
  safeFetch,
  type RequestOptions,
} from "./http.ts";

const MAX_SEARCH_LIMIT = 50;

export interface SearchResult {
  t: 0;
  url: string;
  title: string;
  snippet: string;
}

export interface SearchResponse {
  data: SearchResult[];
}

type SearchPageKind = "results" | "no-results" | "unexpected";

/** Performs a Kagi web search by scraping the HTML results page and parsing structured results. */
export function search(
  query: string,
  token: string,
  limit: number = 10,
  options: RequestOptions = {},
): ResultAsync<SearchResponse, AppError> {
  if (typeof query !== "string" || query.trim() === "") {
    return errAsync({
      type: "ValidationError",
      message: "Search query is required and must be a string",
    });
  }

  if (typeof token !== "string" || token.trim() === "") {
    return errAsync({
      type: "ValidationError",
      message: "Session token is required and must be a string",
    });
  }

  if (limit < 1 || limit > MAX_SEARCH_LIMIT || !Number.isInteger(limit)) {
    return errAsync({
      type: "ValidationError",
      message: `Limit must be an integer between 1 and ${MAX_SEARCH_LIMIT}`,
    });
  }

  return safeFetch(`https://kagi.com/html/search?q=${encodeURIComponent(query)}`, {
    headers: kagiHeaders(token),
    signal: options.signal,
  }).andThen((response) =>
    checkResponseStatus(response).asyncAndThen(() =>
      ResultAsync.fromPromise(response.text(), mapFetchError).andThen((html) =>
        checkNotAuthOrChallengeResponse(response, html)
          .andThen(() => parseSearchResults(html, limit))
          .map((results) => ({ data: results })),
      ),
    ),
  );
}

function classifySearchPage($: cheerio.CheerioAPI): SearchPageKind {
  if ($(".search-result").length > 0 || $(".sr-group .__srgi").length > 0) {
    return "results";
  }

  const bodyText = $("body").text().replaceAll(/\s+/g, " ").toLowerCase();
  if (
    bodyText.includes("no results") ||
    bodyText.includes("couldn't find any results") ||
    bodyText.includes("did not match any")
  ) {
    return "no-results";
  }

  return "unexpected";
}

function parseSearchResults(html: string, limit: number): Result<SearchResult[], AppError> {
  const $ = cheerio.load(html);
  const pageKind = classifySearchPage($);

  if (pageKind === "no-results") {
    return ok([]);
  }

  if (pageKind === "unexpected") {
    return err({
      type: "ParseError",
      message: "Failed to parse search results - unexpected HTML structure",
    });
  }

  const results: SearchResult[] = [];
  let resultCount = 0;

  try {
    $(".search-result").each((_, element) => {
      if (resultCount >= limit) return false;
      const $el = $(element);
      const result = extractResult($el, $el.find(".__sri_title_link").first());
      if (result) {
        results.push(result);
        resultCount++;
      }
    });

    if (resultCount < limit) {
      $(".sr-group .__srgi").each((_, element) => {
        if (resultCount >= limit) return false;
        const $el = $(element);
        const result = extractResult($el, $el.find(".__srgi-title a").first());
        if (result) {
          results.push(result);
          resultCount++;
        }
      });
    }

    return ok(results);
  } catch (cause) {
    return err({
      type: "ParseError",
      message: "Failed to parse search results - unexpected HTML structure",
      cause,
    });
  }
}

function extractResult(
  $element: cheerio.Cheerio<AnyNode>,
  titleLink: cheerio.Cheerio<AnyNode>,
): SearchResult | null {
  try {
    const title = titleLink.text().trim();
    const url = titleLink.attr("href");
    const snippet = $element.find(".__sri-desc").text().trim();

    if (title === "" || url === undefined || url === "") {
      return null;
    }

    return { t: 0, url, title, snippet: snippet || "" };
  } catch {
    return null;
  }
}

export const __testing = { parseSearchResults };
