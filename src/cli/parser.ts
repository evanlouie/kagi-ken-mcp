import { err, ok, type Result } from "neverthrow";
import { match, P } from "ts-pattern";

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

type ParseStep<State> =
  | { type: "continue"; state: State; nextIndex: number }
  | { type: "done"; command: CliCommand };

interface SearchState {
  queries: string[];
  limit?: number;
}

interface SummarizeState {
  urls: string[];
  summary_type?: SummaryType;
  summary_length?: ArticleSummaryLength;
  target_language?: SupportedLanguage;
}

const summaryTypeFlags = ["--type", "--summary-type"] as const;
const languageFlags = ["--language", "--target-language"] as const;

const usageError = (message: string): AppError => ({ type: "ValidationError", message });

const isHelpFlag = (arg: string): boolean => arg === "--help" || arg === "-h";

const continueWith = <State>(state: State, nextIndex: number): ParseStep<State> => ({
  type: "continue",
  state,
  nextIndex,
});

const doneWith = <State>(command: CliCommand): ParseStep<State> => ({
  type: "done",
  command,
});

function consumeArgs<State>(
  args: string[],
  initialState: State,
  consume: (input: {
    arg: string;
    index: number;
    state: State;
    args: string[];
  }) => Result<ParseStep<State>, AppError>,
  finalize: (state: State) => Result<CliCommand, AppError>,
): Result<CliCommand, AppError> {
  let index = 0;
  let state = initialState;

  while (true) {
    const arg = args[index];
    if (arg === undefined) return finalize(state);

    const stepResult = consume({ arg, index, state, args });
    if (stepResult.isErr()) return err(stepResult.error);

    const outcome = match(stepResult.value)
      .with({ type: "done" }, ({ command }) => ({ type: "return" as const, command }))
      .with({ type: "continue" }, ({ state, nextIndex }) => ({
        type: "next" as const,
        state,
        index: nextIndex,
      }))
      .exhaustive();

    if (outcome.type === "return") return ok(outcome.command);

    state = outcome.state;
    index = outcome.index;
  }
}

function parseInteger(value: string, flag: string): Result<number, AppError> {
  return match(value)
    .with(P.string.regex(/^\d+$/), (numericValue) => ok(Number.parseInt(numericValue, 10)))
    .otherwise(() => err(usageError(`${flag} must be an integer`)));
}

function valueForInlineFlag(arg: string, flag: string): string | undefined {
  const prefix = `${flag}=`;
  return match(arg.startsWith(prefix))
    .with(true, () => arg.slice(prefix.length))
    .with(false, () => undefined)
    .exhaustive();
}

function valueForInlineFlags(
  arg: string,
  flags: readonly string[],
): { flag: string; value: string } | undefined {
  return flags.reduce<{ flag: string; value: string } | undefined>(
    (matched, flag) =>
      matched ??
      match(valueForInlineFlag(arg, flag))
        .with(P.string, (value) => ({ flag, value }))
        .otherwise(() => undefined),
    undefined,
  );
}

function takeFlagValue(
  args: string[],
  index: number,
  flag: string,
): Result<[string, number], AppError> {
  const nextIndex = index + 1;

  return match(args[nextIndex])
    .with(P.string.startsWith("-"), () => err(usageError(`${flag} requires a value`)))
    .with(P.string, (value) => ok([value, nextIndex] as [string, number]))
    .otherwise(() => err(usageError(`${flag} requires a value`)));
}

function takeParsedFlagValue<T>(
  args: string[],
  index: number,
  flag: string,
  parse: (value: string) => Result<T, AppError>,
): Result<{ value: T; nextIndex: number }, AppError> {
  return takeFlagValue(args, index, flag).andThen(([rawValue, nextIndex]) =>
    parse(rawValue).map((value) => ({ value, nextIndex })),
  );
}

function isOneOf<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value as Values[number]);
}

const parseSearch = (args: string[]): Result<CliCommand, AppError> =>
  consumeArgs<SearchState>(
    args,
    { queries: [] },
    ({ arg, index, state, args }) =>
      match({ arg, inlineLimit: valueForInlineFlag(arg, "--limit") })
        .with({ arg: P.when(isHelpFlag) }, () =>
          ok(doneWith<SearchState>({ type: "help", topic: "search", exitCode: 0 })),
        )
        .with({ arg: "--" }, () =>
          ok(
            continueWith(
              { ...state, queries: [...state.queries, ...args.slice(index + 1)] },
              args.length,
            ),
          ),
        )
        .with({ inlineLimit: P.string }, ({ inlineLimit }) =>
          parseInteger(inlineLimit, "--limit").map((limit) =>
            continueWith({ ...state, limit }, index + 1),
          ),
        )
        .with({ arg: "--limit" }, () =>
          takeParsedFlagValue(args, index, "--limit", (value) =>
            parseInteger(value, "--limit"),
          ).map(({ value: limit, nextIndex }) => continueWith({ ...state, limit }, nextIndex + 1)),
        )
        .when(
          ({ arg }) => arg.startsWith("-"),
          ({ arg }) => err(usageError(`Unknown search option: ${arg}`)),
        )
        .otherwise(({ arg: query }) =>
          ok(continueWith({ ...state, queries: [...state.queries, query] }, index + 1)),
        ),
    (state) =>
      match(state)
        .when(
          ({ queries }) => queries.length === 0,
          () => err(usageError("At least one search query is required")),
        )
        .when(
          ({ queries }) => queries.some((query) => query.trim() === ""),
          () => err(usageError("Search queries cannot be empty")),
        )
        .when(
          ({ queries }) => queries.length > 10,
          () => err(usageError("At most 10 search queries are allowed")),
        )
        .when(
          ({ limit }) => limit !== undefined && (limit < 1 || limit > 50),
          () => err(usageError("--limit must be between 1 and 50")),
        )
        .otherwise(({ queries, limit }) => ok({ type: "search", queries, limit })),
  );

function parseSummaryType(value: string): Result<SummaryType, AppError> {
  return match(value)
    .with(
      P.when((value): value is SummaryType => isOneOf(SUMMARY_TYPES, value)),
      (summaryType) => ok(summaryType),
    )
    .otherwise(() => err(usageError(`--type must be one of: ${SUMMARY_TYPES.join(", ")}`)));
}

function parseSummaryLength(value: string): Result<ArticleSummaryLength, AppError> {
  return match(value)
    .with(
      P.when((value): value is ArticleSummaryLength => isOneOf(ARTICLE_SUMMARY_LENGTHS, value)),
      (summaryLength) => ok(summaryLength),
    )
    .otherwise(() =>
      err(usageError(`--length must be one of: ${ARTICLE_SUMMARY_LENGTHS.join(", ")}`)),
    );
}

function parseSupportedLanguage(value: string): Result<SupportedLanguage, AppError> {
  return match(value)
    .with(
      P.when((value): value is SupportedLanguage => isOneOf(SUPPORTED_LANGUAGES, value)),
      (language) => ok(language),
    )
    .otherwise(() =>
      err(usageError(`--language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`)),
    );
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

const parseSummarize = (args: string[]): Result<CliCommand, AppError> =>
  consumeArgs<SummarizeState>(
    args,
    { urls: [] },
    ({ arg, index, state, args }) =>
      match({
        arg,
        inlineType: valueForInlineFlags(arg, summaryTypeFlags)?.value,
        inlineLength: valueForInlineFlag(arg, "--length"),
        inlineLanguage: valueForInlineFlags(arg, languageFlags)?.value,
      })
        .with({ arg: P.when(isHelpFlag) }, () =>
          ok(doneWith<SummarizeState>({ type: "help", topic: "summarize", exitCode: 0 })),
        )
        .with({ arg: "--" }, () =>
          ok(
            continueWith(
              { ...state, urls: [...state.urls, ...args.slice(index + 1)] },
              args.length,
            ),
          ),
        )
        .with({ inlineType: P.string }, ({ inlineType }) =>
          parseSummaryType(inlineType).map((summary_type) =>
            continueWith({ ...state, summary_type }, index + 1),
          ),
        )
        .with({ inlineLength: P.string }, ({ inlineLength }) =>
          parseSummaryLength(inlineLength).map((summary_length) =>
            continueWith({ ...state, summary_length }, index + 1),
          ),
        )
        .with({ inlineLanguage: P.string }, ({ inlineLanguage }) =>
          parseSupportedLanguage(inlineLanguage).map((target_language) =>
            continueWith({ ...state, target_language }, index + 1),
          ),
        )
        .when(
          ({ arg }) => summaryTypeFlags.includes(arg as (typeof summaryTypeFlags)[number]),
          ({ arg }) =>
            takeParsedFlagValue(args, index, arg, parseSummaryType).map(({ value, nextIndex }) =>
              continueWith({ ...state, summary_type: value }, nextIndex + 1),
            ),
        )
        .with({ arg: "--length" }, () =>
          takeParsedFlagValue(args, index, "--length", parseSummaryLength).map(
            ({ value, nextIndex }) =>
              continueWith({ ...state, summary_length: value }, nextIndex + 1),
          ),
        )
        .when(
          ({ arg }) => languageFlags.includes(arg as (typeof languageFlags)[number]),
          ({ arg }) =>
            takeParsedFlagValue(args, index, arg, parseSupportedLanguage).map(
              ({ value, nextIndex }) =>
                continueWith({ ...state, target_language: value }, nextIndex + 1),
            ),
        )
        .when(
          ({ arg }) => arg.startsWith("-"),
          ({ arg }) => err(usageError(`Unknown summarize option: ${arg}`)),
        )
        .otherwise(({ arg: url }) =>
          ok(continueWith({ ...state, urls: [...state.urls, url] }, index + 1)),
        ),
    (state) =>
      match(state)
        .when(
          ({ urls }) => urls.length !== 1,
          () => err(usageError("Exactly one URL is required")),
        )
        .otherwise(({ urls, summary_type, summary_length, target_language }) =>
          parseUrl(urls[0]!).andThen((url) =>
            match({ url, summary_type, summary_length, target_language })
              .when(
                ({ summary_length, summary_type }) =>
                  summary_length !== undefined &&
                  summary_type !== undefined &&
                  summary_type !== "article",
                () => err(usageError("--length is only supported when --type is article")),
              )
              .otherwise(({ url, summary_type, summary_length, target_language }) =>
                ok({
                  type: "summarize" as const,
                  url,
                  summary_type,
                  summary_length,
                  target_language,
                }),
              ),
          ),
        ),
  );

function parseMcp(args: string[]): Result<CliCommand, AppError> {
  return match(args)
    .with([], () => ok({ type: "mcp" as const }))
    .with([P.when(isHelpFlag)], () => ok({ type: "help" as const, topic: "mcp", exitCode: 0 }))
    .otherwise(([arg = ""]) => err(usageError(`Unknown mcp option: ${arg}`)));
}

export function parseCliArgs(args: string[]): Result<CliCommand, AppError> {
  const [command, ...rest] = args;

  return match(command)
    .with(P.nullish, () => ok({ type: "help" as const, exitCode: 2 }))
    .with(P.union("--help", "-h"), () => ok({ type: "help" as const, exitCode: 0 }))
    .with(P.union("--version", "-v"), () => ok({ type: "version" as const }))
    .with("search", () => parseSearch(rest))
    .with(P.union("summarize", "summary"), () => parseSummarize(rest))
    .with("mcp", () => parseMcp(rest))
    .otherwise((command) => err(usageError(`Unknown command: ${command}`)));
}
