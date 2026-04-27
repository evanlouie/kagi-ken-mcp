import { describe, expect, test } from "bun:test";

import { search, __testing as searchTesting } from "../../src/kagi/search.ts";
import { __testing as summarizeTesting } from "../../src/kagi/summarize.ts";
import { searchInputSchema } from "../../src/tools/search.ts";
import { z } from "zod";

const searchSchema = z.object(searchInputSchema);

describe("search parser", () => {
  test("parses organic search results", () => {
    const results = searchTesting.parseSearchResults(
      `<html><body>
        <div class="search-result">
          <a class="__sri_title_link" href="https://example.com/a">Example A</a>
          <div class="__sri-desc">Snippet A</div>
        </div>
        <div class="search-result">
          <a class="__sri_title_link" href="https://example.com/b">Example B</a>
          <div class="__sri-desc">Snippet B</div>
        </div>
      </body></html>`,
      1,
    );

    expect(results).toEqual([
      { t: 0, url: "https://example.com/a", title: "Example A", snippet: "Snippet A" },
    ]);
  });

  test("parses valid no-results pages as empty results", () => {
    const results = searchTesting.parseSearchResults(
      "<html><body>No results found for this search.</body></html>",
      10,
    );

    expect(results).toEqual([]);
  });

  test("throws on unexpected HTML", () => {
    expect(() => searchTesting.parseSearchResults("<html><body>login shell</body></html>", 10)).toThrow(
      "Failed to parse search results - unexpected HTML structure",
    );
  });

  test("enforces direct search limit bounds before fetching", async () => {
    await expect(search("test", "token", 51)).rejects.toThrow("Limit must be an integer between 1 and 50");
  });
});

describe("summarizer stream parser", () => {
  test("parses final output_data markdown", () => {
    const result = summarizeTesting.parseStreamingSummary(
      'new_message.json:{"state":"generating"}\u0000final:{"output_data":{"markdown":"Summary"}}',
    );

    expect(result).toEqual({ output: "Summary" });
  });

  test("uses latest summary frame even with trailing metadata", () => {
    const result = summarizeTesting.parseStreamingSummary(
      '{"md":"Draft"}\u0000{"output_data":{"markdown":"Final summary"}}\u0000{"state":"done"}',
    );

    expect(result).toEqual({ output: "Final summary" });
  });

  test("parses md field", () => {
    const result = summarizeTesting.parseStreamingSummary('{"md":"Markdown summary"}');

    expect(result).toEqual({ output: "Markdown summary" });
  });

  test("returns Kagi error frames", () => {
    const result = summarizeTesting.parseStreamingSummary(
      '{"state":"error","reply":"Could not summarize"}',
    );

    expect(result).toEqual({ error: "Could not summarize", output: "" });
  });

  test("throws on empty stream", () => {
    expect(() => summarizeTesting.parseStreamingSummary("\u0000")).toThrow("No summary data received");
  });
});

describe("search input schema", () => {
  test("trims and accepts non-empty queries", () => {
    const result = searchSchema.parse({ queries: ["  kagi search  "], limit: 1 });
    expect(result.queries).toEqual(["kagi search"]);
  });

  test("rejects whitespace-only and excessive query arrays", () => {
    expect(searchSchema.safeParse({ queries: ["   "] }).success).toBe(false);
    expect(searchSchema.safeParse({ queries: Array.from({ length: 11 }, (_, i) => `q${i}`) }).success).toBe(
      false,
    );
    expect(searchSchema.safeParse({ queries: ["ok"], limit: 51 }).success).toBe(false);
  });
});
