import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  assertNotAuthOrChallengeResponse,
  checkResponseStatus,
  kagiHeaders,
  rethrowAsNetworkError,
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
export async function search(
  query: string,
  token: string,
  limit: number = 10,
  options: RequestOptions = {},
): Promise<SearchResponse> {
  if (!query) {
    throw new Error("Search query is required and must be a string");
  }

  if (!token) {
    throw new Error("Session token is required and must be a string");
  }

  if (limit < 1 || limit > MAX_SEARCH_LIMIT || !Number.isInteger(limit)) {
    throw new Error(`Limit must be an integer between 1 and ${MAX_SEARCH_LIMIT}`);
  }

  try {
    const response = await fetch(`https://kagi.com/html/search?q=${encodeURIComponent(query)}`, {
      headers: kagiHeaders(token),
      signal: options.signal,
    });

    checkResponseStatus(response);

    const html = await response.text();
    assertNotAuthOrChallengeResponse(response, html);

    const results = parseSearchResults(html, limit);
    return { data: results };
  } catch (error: unknown) {
    rethrowAsNetworkError(error);
  }
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

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const pageKind = classifySearchPage($);

  if (pageKind === "no-results") {
    return [];
  }

  if (pageKind === "unexpected") {
    throw new Error("Failed to parse search results - unexpected HTML structure");
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

    return results;
  } catch (error) {
    throw new Error("Failed to parse search results - unexpected HTML structure", { cause: error });
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
