import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { kagiHeaders, checkResponse, rethrowAsNetworkError } from "./http.ts";

export interface SearchResult {
  t: 0;
  url: string;
  title: string;
  snippet: string;
}

export interface SearchResponse {
  data: SearchResult[];
}

export async function search(
  query: string,
  token: string,
  limit: number = 10,
): Promise<SearchResponse> {
  if (!query) {
    throw new Error("Search query is required and must be a string");
  }

  if (!token) {
    throw new Error("Session token is required and must be a string");
  }

  if (limit < 1 || !Number.isInteger(limit)) {
    throw new Error("Limit must be a positive integer");
  }

  try {
    const response = await fetch(
      `https://kagi.com/html/search?q=${encodeURIComponent(query)}`,
      { headers: kagiHeaders(token) },
    );

    checkResponse(response);

    const html = await response.text();
    const results = parseSearchResults(html, limit);
    return { data: results };
  } catch (error: unknown) {
    rethrowAsNetworkError(error);
  }
}

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  let resultCount = 0;

  try {
    $(".search-result").each((_, element) => {
      if (resultCount >= limit) return false;
      const result = extractResult($, element, ".__sri_title_link");
      if (result) {
        results.push(result);
        resultCount++;
      }
    });

    if (resultCount < limit) {
      $(".sr-group .__srgi").each((_, element) => {
        if (resultCount >= limit) return false;
        const result = extractResult($, element, ".__srgi-title a");
        if (result) {
          results.push(result);
          resultCount++;
        }
      });
    }

    return results;
  } catch {
    throw new Error(
      "Failed to parse search results - unexpected HTML structure",
    );
  }
}

function extractResult(
  $: cheerio.CheerioAPI,
  element: AnyNode,
  titleSelector: string,
): SearchResult | null {
  try {
    const $element = $(element);
    const titleLink = $element.find(titleSelector).first();
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
