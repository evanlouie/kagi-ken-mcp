import { err, ok, type Result } from "neverthrow";

import {
  ARTICLE_SUMMARY_LENGTHS,
  SUMMARY_TYPES,
  SUPPORTED_LANGUAGES,
  type ArticleSummaryLength,
  type SummaryType,
  type SupportedLanguage,
} from "../kagi/summarize.ts";
import type { AppError } from "../utils/errors.ts";

export type CliCommand =
  | { type: "help"; topic?: string; exitCode: number }
  | { type: "version" }
  | { type: "search"; queries: string[]; limit?: number }
  | {
      type: "summarize";
      url: string;
      summary_type?: SummaryType;
      summary_length?: ArticleSummaryLength;
      target_language?: SupportedLanguage;
    }
  | { type: "mcp" };

function usageError(message: string): AppError {
  return { type: "ValidationError", message };
}

function isHelpFlag(arg: string): boolean {
  return arg === "--help" || arg === "-h";
}

function isVersionFlag(arg: string): boolean {
  return arg === "--version" || arg === "-v";
}

function parseInteger(value: string, flag: string): Result<number, AppError> {
  if (!/^\d+$/.test(value)) {
    return err(usageError(`${flag} must be an integer`));
  }

  return ok(Number.parseInt(value, 10));
}

function valueForInlineFlag(arg: string, flag: string): string | undefined {
  const prefix = `${flag}=`;
  return arg.startsWith(prefix) ? arg.slice(prefix.length) : undefined;
}

function takeFlagValue(
  args: string[],
  index: number,
  flag: string,
): Result<[string, number], AppError> {
  const nextIndex = index + 1;
  const value = args[nextIndex];
  if (value === undefined || value.startsWith("-")) {
    return err(usageError(`${flag} requires a value`));
  }

  return ok([value, nextIndex]);
}

function isOneOf<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value as Values[number]);
}

function parseSearch(args: string[]): Result<CliCommand, AppError> {
  const queries: string[] = [];
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (isHelpFlag(arg)) {
      return ok({ type: "help", topic: "search", exitCode: 0 });
    }

    if (arg === "--") {
      queries.push(...args.slice(i + 1));
      break;
    }

    const inlineLimit = valueForInlineFlag(arg, "--limit");
    if (inlineLimit !== undefined) {
      const parsed = parseInteger(inlineLimit, "--limit");
      if (parsed.isErr()) return err(parsed.error);
      limit = parsed.value;
      continue;
    }

    if (arg === "--limit") {
      const taken = takeFlagValue(args, i, "--limit");
      if (taken.isErr()) return err(taken.error);
      const [value, nextIndex] = taken.value;
      const parsed = parseInteger(value, "--limit");
      if (parsed.isErr()) return err(parsed.error);
      limit = parsed.value;
      i = nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      return err(usageError(`Unknown search option: ${arg}`));
    }

    queries.push(arg);
  }

  if (queries.length === 0) {
    return err(usageError("At least one search query is required"));
  }

  if (queries.some((query) => query.trim() === "")) {
    return err(usageError("Search queries cannot be empty"));
  }

  if (queries.length > 10) {
    return err(usageError("At most 10 search queries are allowed"));
  }

  if (limit !== undefined && (limit < 1 || limit > 50)) {
    return err(usageError("--limit must be between 1 and 50"));
  }

  return ok({ type: "search", queries, limit });
}

function parseSummaryType(value: string): Result<SummaryType, AppError> {
  if (!isOneOf(SUMMARY_TYPES, value)) {
    return err(usageError(`--type must be one of: ${SUMMARY_TYPES.join(", ")}`));
  }

  return ok(value);
}

function parseSummaryLength(value: string): Result<ArticleSummaryLength, AppError> {
  if (!isOneOf(ARTICLE_SUMMARY_LENGTHS, value)) {
    return err(usageError(`--length must be one of: ${ARTICLE_SUMMARY_LENGTHS.join(", ")}`));
  }

  return ok(value);
}

function parseSupportedLanguage(value: string): Result<SupportedLanguage, AppError> {
  if (!isOneOf(SUPPORTED_LANGUAGES, value)) {
    return err(usageError(`--language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`));
  }

  return ok(value);
}

function parseUrl(value: string): Result<string, AppError> {
  try {
    new URL(value);
    return ok(value);
  } catch (cause) {
    return err({
      type: "ValidationError",
      message: "URL must be a valid URL",
      cause,
    });
  }
}

function parseSummarize(args: string[]): Result<CliCommand, AppError> {
  const urls: string[] = [];
  let summary_type: SummaryType | undefined;
  let summary_length: ArticleSummaryLength | undefined;
  let target_language: SupportedLanguage | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (isHelpFlag(arg)) {
      return ok({ type: "help", topic: "summarize", exitCode: 0 });
    }

    if (arg === "--") {
      urls.push(...args.slice(i + 1));
      break;
    }

    const inlineType =
      valueForInlineFlag(arg, "--type") ?? valueForInlineFlag(arg, "--summary-type");
    if (inlineType !== undefined) {
      const parsed = parseSummaryType(inlineType);
      if (parsed.isErr()) return err(parsed.error);
      summary_type = parsed.value;
      continue;
    }

    const inlineLength = valueForInlineFlag(arg, "--length");
    if (inlineLength !== undefined) {
      const parsed = parseSummaryLength(inlineLength);
      if (parsed.isErr()) return err(parsed.error);
      summary_length = parsed.value;
      continue;
    }

    const inlineLanguage =
      valueForInlineFlag(arg, "--language") ?? valueForInlineFlag(arg, "--target-language");
    if (inlineLanguage !== undefined) {
      const parsed = parseSupportedLanguage(inlineLanguage);
      if (parsed.isErr()) return err(parsed.error);
      target_language = parsed.value;
      continue;
    }

    if (arg === "--type" || arg === "--summary-type") {
      const taken = takeFlagValue(args, i, arg);
      if (taken.isErr()) return err(taken.error);
      const [value, nextIndex] = taken.value;
      const parsed = parseSummaryType(value);
      if (parsed.isErr()) return err(parsed.error);
      summary_type = parsed.value;
      i = nextIndex;
      continue;
    }

    if (arg === "--length") {
      const taken = takeFlagValue(args, i, arg);
      if (taken.isErr()) return err(taken.error);
      const [value, nextIndex] = taken.value;
      const parsed = parseSummaryLength(value);
      if (parsed.isErr()) return err(parsed.error);
      summary_length = parsed.value;
      i = nextIndex;
      continue;
    }

    if (arg === "--language" || arg === "--target-language") {
      const taken = takeFlagValue(args, i, arg);
      if (taken.isErr()) return err(taken.error);
      const [value, nextIndex] = taken.value;
      const parsed = parseSupportedLanguage(value);
      if (parsed.isErr()) return err(parsed.error);
      target_language = parsed.value;
      i = nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      return err(usageError(`Unknown summarize option: ${arg}`));
    }

    urls.push(arg);
  }

  if (urls.length !== 1) {
    return err(usageError("Exactly one URL is required"));
  }

  const parsedUrl = parseUrl(urls[0]!);
  if (parsedUrl.isErr()) return err(parsedUrl.error);

  if (summary_length !== undefined && summary_type !== undefined && summary_type !== "article") {
    return err(usageError("--length is only supported when --type is article"));
  }

  return ok({
    type: "summarize",
    url: parsedUrl.value,
    summary_type,
    summary_length,
    target_language,
  });
}

function parseMcp(args: string[]): Result<CliCommand, AppError> {
  if (args.length === 0) {
    return ok({ type: "mcp" });
  }

  if (args.length === 1 && isHelpFlag(args[0]!)) {
    return ok({ type: "help", topic: "mcp", exitCode: 0 });
  }

  return err(usageError(`Unknown mcp option: ${args[0] ?? ""}`));
}

export function parseCliArgs(args: string[]): Result<CliCommand, AppError> {
  const [command, ...rest] = args;

  if (command === undefined) {
    return ok({ type: "help", exitCode: 2 });
  }

  if (isHelpFlag(command)) {
    return ok({ type: "help", exitCode: 0 });
  }

  if (isVersionFlag(command)) {
    return ok({ type: "version" });
  }

  switch (command) {
    case "search":
      return parseSearch(rest);
    case "summarize":
    case "summary":
      return parseSummarize(rest);
    case "mcp":
      return parseMcp(rest);
    default:
      return err(usageError(`Unknown command: ${command}`));
  }
}
