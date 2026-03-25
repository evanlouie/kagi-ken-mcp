/// <reference types="bun-types" />

import { beforeAll, describe, expect, test } from "bun:test";

import { ARTICLE_SUMMARY_LENGTHS, SUMMARY_TYPES, summarize } from "../../src/kagi/summarize.ts";
import { search } from "../../src/kagi/search.ts";
import { resolveToken } from "../../src/utils/auth.ts";

const SEARCH_QUERY = "site:bun.sh Bun runtime";

function getToken(): string | null {
  try {
    return resolveToken();
  } catch {
    return null;
  }
}

const token = getToken();
const integrationDescribe = token === null ? describe.skip : describe;

integrationDescribe("Kagi search and summarize integration", () => {
  let firstResultUrl = "";

  beforeAll(async () => {
    const result = await search(SEARCH_QUERY, token!, 1);
    expect(result.data.length).toBeGreaterThan(0);
    firstResultUrl = result.data[0]!.url;
    expect(firstResultUrl).toMatch(/^https?:\/\//);
  }, 30_000);

  for (const summaryType of SUMMARY_TYPES) {
    test(`summarizes the first search result as ${summaryType}`, async () => {
      const result = await summarize(firstResultUrl, token!, {
        type: summaryType,
        isUrl: true,
      });

      expect(result.data.output.trim().length).toBeGreaterThan(0);
    }, 30_000);
  }

  for (const summaryLength of ARTICLE_SUMMARY_LENGTHS) {
    test(`summarizes the first search result as article:${summaryLength}`, async () => {
      const result = await summarize(firstResultUrl, token!, {
        type: "article",
        summaryLength,
        isUrl: true,
      });

      expect(result.data.output.trim().length).toBeGreaterThan(0);
    }, 30_000);
  }
});

if (token === null) {
  test.skip("Kagi integration tests require KAGI_SESSION_TOKEN or ~/.kagi_session_token", () => {});
}
