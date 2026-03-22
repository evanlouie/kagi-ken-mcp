import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { USER_AGENT } from "./http.ts";

export interface SearchResult {
  t: 0;
  url: string;
  title: string;
  snippet: string;
}

export interface RelatedSearches {
  t: 1;
  list: string[];
}

export type SearchResultItem = SearchResult | RelatedSearches;

export interface SearchResponse {
  data: SearchResultItem[];
}

export async function search(
  query: string,
  token: string,
  limit: number = 10,
): Promise<SearchResponse> {
  if (!query || typeof query !== "string") {
    throw new Error("Search query is required and must be a string");
  }

  if (!token || typeof token !== "string") {
    throw new Error("Session token is required and must be a string");
  }

  if (typeof limit !== "number" || limit < 1 || !Number.isInteger(limit)) {
    throw new Error("Limit must be a positive integer");
  }

  try {
    const response = await fetch(
      `https://kagi.com/html/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: `kagi_session=${token}`,
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid or expired session token");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const results = parseSearchResults(html, limit);
    return { data: results };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      ((error as NodeJS.ErrnoException).code === "ENOTFOUND" ||
        (error as NodeJS.ErrnoException).code === "ECONNREFUSED")
    ) {
      throw new Error("Network error: Unable to connect to Kagi");
    }
    throw error;
  }
}

function parseSearchResults(html: string, limit: number): SearchResultItem[] {
  const $ = cheerio.load(html);
  const results: SearchResultItem[] = [];
  let resultCount = 0;

  try {
    $(".search-result").each((_, element) => {
      if (resultCount >= limit) return false;
      const result = extractSearchResult($, element);
      if (result) {
        results.push(result);
        resultCount++;
      }
    });

    if (resultCount < limit) {
      $(".sr-group .__srgi").each((_, element) => {
        if (resultCount >= limit) return false;
        const result = extractGroupedResult($, element);
        if (result) {
          results.push(result);
          resultCount++;
        }
      });
    }

    const relatedSearches = extractRelatedSearches($);
    if (relatedSearches.length > 0) {
      results.push({
        t: 1,
        list: relatedSearches,
      });
    }

    return results;
  } catch {
    throw new Error(
      "Failed to parse search results - unexpected HTML structure",
    );
  }
}

function extractSearchResult(
  $: cheerio.CheerioAPI,
  element: AnyNode,
): SearchResult | null {
  try {
    const $element = $(element);
    const titleLink = $element.find(".__sri_title_link").first();
    const title = titleLink.text().trim();
    const url = titleLink.attr("href");
    const snippet = $element.find(".__sri-desc").text().trim();

    if (!title || !url) {
      return null;
    }

    return { t: 0, url, title, snippet: snippet || "" };
  } catch {
    return null;
  }
}

function extractGroupedResult(
  $: cheerio.CheerioAPI,
  element: AnyNode,
): SearchResult | null {
  try {
    const $element = $(element);
    const titleLink = $element.find(".__srgi-title a").first();
    const title = titleLink.text().trim();
    const url = titleLink.attr("href");
    const snippet = $element.find(".__sri-desc").text().trim();

    if (!title || !url) {
      return null;
    }

    return { t: 0, url, title, snippet: snippet || "" };
  } catch {
    return null;
  }
}

function extractRelatedSearches($: cheerio.CheerioAPI): string[] {
  const relatedSearches: string[] = [];

  try {
    $(".related-searches a span").each((_, element) => {
      const term = $(element).text().trim();
      if (term) {
        relatedSearches.push(term);
      }
    });
  } catch {
    // Return empty array if parsing fails
  }

  return relatedSearches;
}
