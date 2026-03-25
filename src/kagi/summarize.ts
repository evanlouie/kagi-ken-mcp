import { kagiHeaders, checkResponse, rethrowAsNetworkError } from "./http.ts";
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

export interface SummarizeOptions {
  type?: "summary" | "takeaway";
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
): Promise<SummarizeResponse> {
  if (!input) {
    throw new Error("Input is required and must be a string");
  }

  if (!token) {
    throw new Error("Session token is required and must be a string");
  }

  const { type = "summary", language = "EN", isUrl = false } = options ?? {};

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

      response = await fetch(url.toString(), {
        method: "GET",
        headers: sharedHeaders,
      });
    } else {
      const formData = new URLSearchParams();
      formData.set("text", input);
      formData.set("stream", "1");
      formData.set("target_language", language);
      formData.set("summary_type", type);

      response = await fetch("https://kagi.com/mother/summary_labs/", {
        method: "POST",
        headers: {
          ...sharedHeaders,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: formData,
      });
    }

    checkResponse(response);

    const streamData = await response.text();
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

function parseStreamingSummary(streamData: string): ParsedSummaryOutput {
  const messages = streamData
    .split("\u0000")
    .map((message) => message.trim())
    .filter(Boolean);

  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    throw new Error("No summary data received");
  }

  const jsonString = lastMessage
    .replace(/^final:/, "")
    .replace(/^new_message\.json:/, "")
    .trim();

  if (!jsonString) {
    throw new Error("Empty summary received");
  }

  const parsed: unknown = JSON.parse(jsonString);
  const result = streamingSummarySchema.safeParse(parsed);
  if (!result.success) {
    throw new TypeError("Failed to parse summary response", { cause: result.error });
  }

  if (result.data.state === "error") {
    return { error: result.data.reply?.trim() || "Kagi could not generate a summary", output: "" };
  }

  const output = result.data.output_data?.markdown ?? result.data.md ?? "";
  if (!output.trim()) {
    throw new Error("Empty summary received");
  }

  return { output };
}
