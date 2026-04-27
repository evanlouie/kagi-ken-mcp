/// <reference types="bun-types" />

import { beforeAll, describe, expect, test } from "bun:test";

import { search } from "../../src/kagi/search.ts";
import { ARTICLE_SUMMARY_LENGTHS, SUMMARY_TYPES, summarize } from "../../src/kagi/summarize.ts";
import { resolveToken } from "../../src/utils/auth.ts";
import type { AppError } from "../../src/utils/errors.ts";

const SEARCH_QUERY = "site:bun.sh Bun runtime";

function getToken(): string | null {
  const result = resolveToken();
  return result.isOk() ? result.value : null;
}

function isRateLimitError(error: AppError): boolean {
  return error.type === "RateLimitError" || /rate limit|HTTP 429/i.test(error.message);
}

const shouldRunIntegration = process.env.KAGI_INTEGRATION === "1";
const token = shouldRunIntegration ? getToken() : null;
const integrationDescribe = token === null ? describe.skip : describe;

integrationDescribe("Kagi search and summarize integration", () => {
  let firstResultUrl = "";
  let rateLimited = false;

  beforeAll(async () => {
    const result = await search(SEARCH_QUERY, token!, 1);
    if (result.isErr()) {
      if (!isRateLimitError(result.error)) {
        throw new Error(result.error.message);
      }
      rateLimited = true;
      console.warn("Skipping live Kagi integration assertions because Kagi returned a rate limit.");
      return;
    }

    expect(result.value.data.length).toBeGreaterThan(0);
    firstResultUrl = result.value.data[0]!.url;
    expect(firstResultUrl).toMatch(/^https?:\/\//);
  }, 30_000);

  async function expectSummaryOutput(options: Parameters<typeof summarize>[2]) {
    if (rateLimited) return;

    const result = await summarize(firstResultUrl, token!, options);
    if (result.isErr()) {
      if (!isRateLimitError(result.error)) {
        throw new Error(result.error.message);
      }
      rateLimited = true;
      console.warn("Skipping remaining live Kagi integration assertions because Kagi returned a rate limit.");
      return;
    }

    expect(result.value.data.output.trim().length).toBeGreaterThan(0);
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
