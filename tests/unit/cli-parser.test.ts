import { describe, expect, test } from "bun:test";

import { parseCliArgs } from "../../src/cli/parser.ts";

describe("CLI parser", () => {
  test("parses global help and version", () => {
    const help = parseCliArgs(["--help"]);
    expect(help.isOk()).toBe(true);
    expect(help._unsafeUnwrap()).toEqual({ type: "help", exitCode: 0 });

    const version = parseCliArgs(["--version"]);
    expect(version.isOk()).toBe(true);
    expect(version._unsafeUnwrap()).toEqual({ type: "version" });
  });

  test("parses search queries and limit", () => {
    const result = parseCliArgs(["search", "bun cli parser", "kagi examples", "--limit", "5"]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      type: "search",
      queries: ["bun cli parser", "kagi examples"],
      limit: 5,
    });
  });

  test("rejects invalid search invocations", () => {
    const missingQuery = parseCliArgs(["search"]);
    expect(missingQuery.isErr()).toBe(true);
    expect(missingQuery._unsafeUnwrapErr()).toMatchObject({
      type: "ValidationError",
      message: "At least one search query is required",
    });

    const badLimit = parseCliArgs(["search", "query", "--limit", "0"]);
    expect(badLimit.isErr()).toBe(true);
    expect(badLimit._unsafeUnwrapErr()).toMatchObject({
      type: "ValidationError",
      message: "--limit must be between 1 and 50",
    });
  });

  test("parses summarize options", () => {
    const result = parseCliArgs([
      "summarize",
      "https://example.com/article",
      "--type",
      "article",
      "--length=digest",
      "--language",
      "EN",
    ]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      type: "summarize",
      url: "https://example.com/article",
      summary_type: "article",
      summary_length: "digest",
      target_language: "EN",
    });
  });

  test("rejects invalid summarize invocations", () => {
    const missingUrl = parseCliArgs(["summarize"]);
    expect(missingUrl.isErr()).toBe(true);
    expect(missingUrl._unsafeUnwrapErr()).toMatchObject({
      type: "ValidationError",
      message: "Exactly one URL is required",
    });

    const badType = parseCliArgs(["summarize", "https://example.com", "--type", "nope"]);
    expect(badType.isErr()).toBe(true);
    expect(badType._unsafeUnwrapErr()).toMatchObject({
      type: "ValidationError",
      message: "--type must be one of: keypoints, eli5, article",
    });

    const badLength = parseCliArgs(["summarize", "https://example.com", "--type", "eli5", "--length", "digest"]);
    expect(badLength.isErr()).toBe(true);
    expect(badLength._unsafeUnwrapErr()).toMatchObject({
      type: "ValidationError",
      message: "--length is only supported when --type is article",
    });
  });

  test("parses mcp command", () => {
    const result = parseCliArgs(["mcp"]);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: "mcp" });
  });
});
