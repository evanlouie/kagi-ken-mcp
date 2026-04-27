import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { z } from "zod";

import type { AppError } from "../utils/errors.ts";
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

/** Summarizes a URL or text input using Kagi's streaming summarization endpoint. */
export function summarize(
  input: string,
  token: string,
  options?: SummarizeOptions,
  requestOptions: RequestOptions = {},
): ResultAsync<SummarizeResponse, AppError> {
  if (typeof input !== "string" || input.trim() === "") {
    return errAsync({ type: "ValidationError", message: "Input is required and must be a string" });
  }

  if (typeof token !== "string" || token.trim() === "") {
    return errAsync({
      type: "ValidationError",
      message: "Session token is required and must be a string",
    });
  }

  const { type = "article", summaryLength, language = "EN", isUrl = false } = options ?? {};

  if (summaryLength && type !== "article") {
    return errAsync({
      type: "ValidationError",
      message: "summaryLength is only supported when type is 'article'",
    });
  }

  const sharedHeaders = {
    ...kagiHeaders(token),
    Accept: "application/vnd.kagi.stream",
    Connection: "keep-alive",
    Host: "kagi.com",
    Pragma: "no-cache",
    Referer: "https://kagi.com/summarizer",
  };

  let responseResult: ResultAsync<Response, AppError>;

  if (isUrl) {
    const url = new URL("https://kagi.com/mother/summary_labs");
    url.searchParams.set("url", input);
    url.searchParams.set("stream", "1");
    url.searchParams.set("target_language", language);
    url.searchParams.set("summary_type", type);
    if (summaryLength) {
      url.searchParams.set("summary_length", summaryLength);
    }

    responseResult = safeFetch(url.toString(), {
      method: "GET",
      headers: sharedHeaders,
      signal: requestOptions.signal,
    });
  } else {
    const formData = new URLSearchParams();
    formData.set("text", input);
    formData.set("stream", "1");
    formData.set("target_language", language);
    formData.set("summary_type", type);
    if (summaryLength) {
      formData.set("summary_length", summaryLength);
    }

    responseResult = safeFetch("https://kagi.com/mother/summary_labs/", {
      method: "POST",
      headers: {
        ...sharedHeaders,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: formData,
      signal: requestOptions.signal,
    });
  }

  return responseResult.andThen((response) =>
    checkResponseStatus(response).asyncAndThen(() =>
      ResultAsync.fromPromise(response.text(), mapFetchError).andThen((streamData) =>
        checkNotAuthOrChallengeResponse(response, streamData).andThen(() => {
          if (isHtmlDocument(streamData)) {
            return err({
              type: "ParseError" as const,
              message: "Unexpected HTML response from Kagi summarizer",
            });
          }

          return parseStreamingSummary(streamData).map((parsedResponse) => ({
            data: { output: parsedResponse.output },
          }));
        }),
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

function parseStreamingSummary(streamData: string): Result<ParsedSummaryOutput, AppError> {
  const rawMessages = streamData
    .split("\u0000")
    .map((message) => stripStreamPrefix(message.trim()))
    .filter(Boolean);

  if (rawMessages.length === 0) {
    return err({ type: "ParseError", message: "No summary data received" });
  }

  const parsedMessages: StreamingSummaryMessage[] = [];
  const parseErrors: unknown[] = [];

  for (const jsonString of rawMessages) {
    try {
      const parsed: unknown = JSON.parse(jsonString);
      const result = streamingSummarySchema.safeParse(parsed);
      if (result.success) {
        parsedMessages.push(result.data);
      } else {
        parseErrors.push(result.error);
      }
    } catch (error) {
      parseErrors.push(error);
    }
  }

  if (parsedMessages.length === 0) {
    return err({
      type: "ParseError",
      message: "Failed to parse summary response",
      cause: parseErrors.at(-1),
    });
  }

  const kagiErrorMessage = parsedMessages
    .find((message) => message.state === "error")
    ?.reply?.trim();
  if (kagiErrorMessage) {
    return err({ type: "HttpError", message: kagiErrorMessage });
  }

  for (const message of parsedMessages.toReversed()) {
    const output = message.output_data?.markdown ?? message.md ?? "";
    if (output.trim()) {
      return ok({ output });
    }
  }

  return err({ type: "ParseError", message: "Empty summary received" });
}

export const __testing = { parseStreamingSummary };
