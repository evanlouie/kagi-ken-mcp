import { err, ok, ResultAsync, type Result } from "neverthrow";
import { match, P } from "ts-pattern";
import { z } from "zod";

import type { AppError } from "../utils/errors.ts";
import { isNonEmptyString } from "../utils/strings.ts";
import {
  checkNotAuthOrChallengeResponse,
  checkResponseStatus,
  isHtmlDocument,
  kagiHeaders,
  mapFetchError,
  safeFetch,
  type RequestOptions,
} from "./http.ts";

export const SUPPORTED_LANGUAGES = [
  "BG",
  "CS",
  "DA",
  "DE",
  "EL",
  "EN",
  "ES",
  "ET",
  "FI",
  "FR",
  "HU",
  "ID",
  "IT",
  "JA",
  "KO",
  "LT",
  "LV",
  "NB",
  "NL",
  "PL",
  "PT",
  "RO",
  "RU",
  "SK",
  "SL",
  "SV",
  "TR",
  "UK",
  "ZH",
  "ZH-HANT",
] as const;

export const supportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;

export const SUMMARY_TYPES = ["keypoints", "eli5", "article"] as const;
export const summaryTypeSchema = z.enum(SUMMARY_TYPES);
export type SummaryType = z.infer<typeof summaryTypeSchema>;

export const ARTICLE_SUMMARY_LENGTHS = [
  "headline",
  "overview",
  "digest",
  "medium",
  "long",
] as const;
export const articleSummaryLengthSchema = z.enum(ARTICLE_SUMMARY_LENGTHS);
export type ArticleSummaryLength = z.infer<typeof articleSummaryLengthSchema>;

export interface SummarizeOptions {
  type?: SummaryType;
  summaryLength?: ArticleSummaryLength;
  language?: SupportedLanguage;
  isUrl?: boolean;
}

export interface SummarizeResponse {
  data: { output: string };
}

interface ParsedSummaryOutput {
  output: string;
}

interface SummaryRequest {
  input: string;
  init: Parameters<typeof fetch>[1];
}

type SummarySource = { kind: "url"; input: string } | { kind: "text"; input: string };

const validateSummarizeInput = (
  input: string,
  token: string,
  type: SummaryType,
  summaryLength?: ArticleSummaryLength,
): Result<void, AppError> =>
  match({ input, token, type, summaryLength })
    .when(
      ({ input }) => !isNonEmptyString(input),
      () =>
        err({
          type: "ValidationError" as const,
          message: "Input is required and must be a string",
        }),
    )
    .when(
      ({ token }) => !isNonEmptyString(token),
      () =>
        err({
          type: "ValidationError" as const,
          message: "Session token is required and must be a string",
        }),
    )
    .when(
      ({ type, summaryLength }) => summaryLength !== undefined && type !== "article",
      () =>
        err({
          type: "ValidationError" as const,
          message: "summaryLength is only supported when type is 'article'",
        }),
    )
    .otherwise(() => ok(undefined));

const setOptionalParam = (
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): URLSearchParams =>
  match(value)
    .with(P.string, (value) => {
      params.set(key, value);
      return params;
    })
    .otherwise(() => params);

const summaryParams = ({
  input,
  type,
  summaryLength,
  language,
  inputKey,
}: {
  input: string;
  type: SummaryType;
  summaryLength?: ArticleSummaryLength;
  language: SupportedLanguage;
  inputKey: "url" | "text";
}): URLSearchParams => {
  const params = new URLSearchParams();
  params.set(inputKey, input);
  params.set("stream", "1");
  params.set("target_language", language);
  params.set("summary_type", type);
  return setOptionalParam(params, "summary_length", summaryLength);
};

const buildSummaryRequest = ({
  source,
  type,
  summaryLength,
  language,
  headers,
  signal,
}: {
  source: SummarySource;
  type: SummaryType;
  summaryLength?: ArticleSummaryLength;
  language: SupportedLanguage;
  headers: Record<string, string>;
  signal?: AbortSignal;
}): SummaryRequest =>
  match(source)
    .with({ kind: "url" }, ({ input }) => {
      const url = new URL("https://kagi.com/mother/summary_labs");
      summaryParams({ input, type, summaryLength, language, inputKey: "url" }).forEach(
        (value, key) => url.searchParams.set(key, value),
      );

      return {
        input: url.toString(),
        init: { method: "GET", headers, signal },
      };
    })
    .with({ kind: "text" }, ({ input }) => ({
      input: "https://kagi.com/mother/summary_labs/",
      init: {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: summaryParams({ input, type, summaryLength, language, inputKey: "text" }),
        signal,
      },
    }))
    .exhaustive();

/** Summarizes a URL or text input using Kagi's streaming summarization endpoint. */
export function summarize(
  input: string,
  token: string,
  options?: SummarizeOptions,
  requestOptions: RequestOptions = {},
): ResultAsync<SummarizeResponse, AppError> {
  const { type = "article", summaryLength, language = "EN", isUrl = false } = options ?? {};

  return validateSummarizeInput(input, token, type, summaryLength)
    .map(() =>
      buildSummaryRequest({
        source: isUrl ? { kind: "url", input } : { kind: "text", input },
        type,
        summaryLength,
        language,
        headers: {
          ...kagiHeaders(token),
          Accept: "application/vnd.kagi.stream",
          Connection: "keep-alive",
          Host: "kagi.com",
          Pragma: "no-cache",
          Referer: "https://kagi.com/summarizer",
        },
        signal: requestOptions.signal,
      }),
    )
    .asyncAndThen(({ input, init }) => safeFetch(input, init))
    .andThen((response) =>
      checkResponseStatus(response).asyncAndThen(() =>
        ResultAsync.fromPromise(response.text(), mapFetchError).andThen((streamData) =>
          checkNotAuthOrChallengeResponse(response, streamData).andThen(() =>
            match(isHtmlDocument(streamData))
              .with(true, () =>
                err({
                  type: "ParseError" as const,
                  message: "Unexpected HTML response from Kagi summarizer",
                }),
              )
              .with(false, () =>
                parseStreamingSummary(streamData).map((parsedResponse) => ({
                  data: { output: parsedResponse.output },
                })),
              )
              .exhaustive(),
          ),
        ),
      ),
    );
}

const streamingSummarySchema = z.object({
  state: z.string().optional(),
  reply: z.string().optional(),
  output_data: z.object({ markdown: z.string().optional() }).optional(),
  md: z.string().optional(),
});

type StreamingSummaryMessage = z.infer<typeof streamingSummarySchema>;

function stripStreamPrefix(message: string): string {
  return message
    .replace(/^final:/, "")
    .replace(/^new_message\.json:/, "")
    .trim();
}

function parseStreamingMessage(jsonString: string): Result<StreamingSummaryMessage, unknown> {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const result = streamingSummarySchema.safeParse(parsed);

    return match(result)
      .with({ success: true }, ({ data }) => ok(data))
      .with({ success: false }, ({ error }) => err(error))
      .exhaustive();
  } catch (cause) {
    return err(cause);
  }
}

function parseStreamingSummary(streamData: string): Result<ParsedSummaryOutput, AppError> {
  const rawMessages = streamData
    .split("\u0000")
    .map((message) => stripStreamPrefix(message.trim()))
    .filter(Boolean);

  return match(rawMessages)
    .with([], () => err({ type: "ParseError" as const, message: "No summary data received" }))
    .otherwise((rawMessages) => {
      const parsed = rawMessages.map(parseStreamingMessage).reduce(
        (acc, result) =>
          result.match(
            (message) => ({ ...acc, messages: [...acc.messages, message] }),
            (error) => ({ ...acc, errors: [...acc.errors, error] }),
          ),
        { messages: [] as StreamingSummaryMessage[], errors: [] as unknown[] },
      );

      return match(parsed.messages)
        .with([], () =>
          err({
            type: "ParseError" as const,
            message: "Failed to parse summary response",
            cause: parsed.errors.at(-1),
          }),
        )
        .otherwise((messages) => {
          const kagiErrorMessage = messages
            .find((message) => message.state === "error")
            ?.reply?.trim();
          const latestOutput = messages
            .toReversed()
            .map((message) => message.output_data?.markdown ?? message.md ?? "")
            .find((output) => output.trim());

          return match({ kagiErrorMessage, latestOutput })
            .with({ kagiErrorMessage: P.string.minLength(1) }, ({ kagiErrorMessage }) =>
              err({ type: "HttpError" as const, message: kagiErrorMessage }),
            )
            .with({ latestOutput: P.string.minLength(1) }, ({ latestOutput }) =>
              ok({ output: latestOutput }),
            )
            .otherwise(() =>
              err({ type: "ParseError" as const, message: "Empty summary received" }),
            );
        });
    });
}

export const __testing = { parseStreamingSummary };
