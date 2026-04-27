/// <reference types="bun-types" />

import { beforeAll, describe, expect, test } from "bun:test";

import { search } from "../../src/kagi/search.ts";
import { ARTICLE_SUMMARY_LENGTHS, SUMMARY_TYPES, summarize } from "../../src/kagi/summarize.ts";
import { resolveToken } from "../../src/utils/auth.ts";

const SEARCH_QUERY = "site:bun.sh Bun runtime";

function getToken(): string | null {
  try {
    return resolveToken();
  } catch {
    return null;
  }
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /rate limit|HTTP 429/i.test(error.message);
}

const shouldRunIntegration = process.env.KAGI_INTEGRATION === "1";
const token = shouldRunIntegration ? getToken() : null;
const integrationDescribe = token === null ? describe.skip : describe;

integrationDescribe("Kagi search and summarize integration", () => {
  let firstResultUrl = "";
  let rateLimited = false;

  beforeAll(async () => {
    try {
      const result = await search(SEARCH_QUERY, token!, 1);
      expect(result.data.length).toBeGreaterThan(0);
      firstResultUrl = result.data[0]!.url;
      expect(firstResultUrl).toMatch(/^https?:\/\//);
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }
      rateLimited = true;
      console.warn("Skipping live Kagi integration assertions because Kagi returned a rate limit.");
    }
  }, 30_000);

  async function expectSummaryOutput(options: Parameters<typeof summarize>[2]) {
    if (rateLimited) return;

    try {
      const result = await summarize(firstResultUrl, token!, options);
      expect(result.data.output.trim().length).toBeGreaterThan(0);
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }
      rateLimited = true;
      console.warn("Skipping remaining live Kagi integration assertions because Kagi returned a rate limit.");
    }
  }

  for (const summaryType of SUMMARY_TYPES) {
    test(`summarizes the first search result as ${summaryType}`, async () => {
      await expectSummaryOutput({
        type: summaryType,
        isUrl: true,
      });
    }, 30_000);
  }

  for (const summaryLength of ARTICLE_SUMMARY_LENGTHS) {
    test(`summarizes the first search result as article:${summaryLength}`, async () => {
      await expectSummaryOutput({
        type: "article",
        summaryLength,
        isUrl: true,
      });
    }, 30_000);
  }
});

if (token === null) {
  test.skip(
    "Kagi integration tests require KAGI_INTEGRATION=1 and KAGI_SESSION_TOKEN or ~/.kagi_session_token",
    () => {},
  );
}
