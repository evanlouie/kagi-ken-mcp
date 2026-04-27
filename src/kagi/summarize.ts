import {
  assertNotAuthOrChallengeResponse,
  checkResponseStatus,
  isHtmlDocument,
  kagiHeaders,
  rethrowAsNetworkError,
  type RequestOptions,
} from "./http.ts";
import { z } from "zod";

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
  error?: string;
}

/** Summarizes a URL or text input using Kagi's streaming summarization endpoint. */
export async function summarize(
  input: string,
  token: string,
  options?: SummarizeOptions,
  requestOptions: RequestOptions = {},
): Promise<SummarizeResponse> {
  if (!input) {
    throw new Error("Input is required and must be a string");
  }

  if (!token) {
    throw new Error("Session token is required and must be a string");
  }

  const { type = "article", summaryLength, language = "EN", isUrl = false } = options ?? {};

  if (summaryLength && type !== "article") {
    throw new Error("summaryLength is only supported when type is 'article'");
  }

  try {
    const sharedHeaders = {
      ...kagiHeaders(token),
      Accept: "application/vnd.kagi.stream",
      Connection: "keep-alive",
      Host: "kagi.com",
      Pragma: "no-cache",
      Referer: "https://kagi.com/summarizer",
    };

    let response: Response;

    if (isUrl) {
      const url = new URL("https://kagi.com/mother/summary_labs");
      url.searchParams.set("url", input);
      url.searchParams.set("stream", "1");
      url.searchParams.set("target_language", language);
      url.searchParams.set("summary_type", type);
      if (summaryLength) {
        url.searchParams.set("summary_length", summaryLength);
      }

      response = await fetch(url.toString(), {
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

      response = await fetch("https://kagi.com/mother/summary_labs/", {
        method: "POST",
        headers: {
          ...sharedHeaders,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: formData,
        signal: requestOptions.signal,
      });
    }

    checkResponseStatus(response);

    const streamData = await response.text();
    assertNotAuthOrChallengeResponse(response, streamData);

    if (isHtmlDocument(streamData)) {
      throw new Error("Unexpected HTML response from Kagi summarizer");
    }

    const parsedResponse = parseStreamingSummary(streamData);

    if (parsedResponse.error) {
      throw new Error(parsedResponse.error);
    }

    const output = parsedResponse.output;
    return { data: { output } };
  } catch (error: unknown) {
    rethrowAsNetworkError(error);
  }
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

function parseStreamingSummary(streamData: string): ParsedSummaryOutput {
  const rawMessages = streamData
    .split("\u0000")
    .map((message) => stripStreamPrefix(message.trim()))
    .filter(Boolean);

  if (rawMessages.length === 0) {
    throw new Error("No summary data received");
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
    throw new TypeError("Failed to parse summary response", { cause: parseErrors.at(-1) });
  }

  const errorMessage = parsedMessages.find((message) => message.state === "error")?.reply?.trim();
  if (errorMessage) {
    return { error: errorMessage, output: "" };
  }

  for (const message of parsedMessages.toReversed()) {
    const output = message.output_data?.markdown ?? message.md ?? "";
    if (output.trim()) {
      return { output };
    }
  }

  throw new Error("Empty summary received");
}

export const __testing = { parseStreamingSummary };
