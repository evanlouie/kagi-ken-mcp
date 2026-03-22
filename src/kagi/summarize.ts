import {
  USER_AGENT,
  kagiHeaders,
  checkResponse,
  rethrowAsNetworkError,
} from "./http.ts";

export const SUPPORTED_LANGUAGES = [
  "BG", "CS", "DA", "DE", "EL", "EN", "ES", "ET", "FI", "FR",
  "HU", "ID", "IT", "JA", "KO", "LT", "LV", "NB", "NL", "PL",
  "PT", "RO", "RU", "SK", "SL", "SV", "TR", "UK", "ZH", "ZH-HANT",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface SummarizeOptions {
  type?: "summary" | "takeaway";
  language?: SupportedLanguage;
  isUrl?: boolean;
}

export interface SummarizeResponse {
  data: { output: string };
}

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

  const { type = "summary", language = "EN", isUrl = false } = options || {};

  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
    const sl = SUPPORTED_LANGUAGES.join(", ");
    throw new Error(
      `Unsupported language code '${language}'. Supported languages: ${sl}`,
    );
  }

  try {
    const sharedHeaders = {
      ...kagiHeaders(token),
      Accept: "application/vnd.kagi.stream",
      Connection: "keep-alive",
      Host: "kagi.com",
      Pragma: "no-cache",
      Referer: "https://kagi.com/summarizer",
      "User-Agent": USER_AGENT,
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

    const output =
      parsedResponse.output_data?.markdown ?? parsedResponse.md ?? "";
    return { data: { output } };
  } catch (error: unknown) {
    rethrowAsNetworkError(error);
  }
}

interface StreamingSummaryResponse {
  output_data?: { markdown?: string };
  md?: string;
}

function parseStreamingSummary(streamData: string): StreamingSummaryResponse {
  try {
    const messages = streamData.split("\x00").filter((msg) => msg.trim());

    if (messages.length === 0) {
      throw new Error("No summary data received");
    }

    const lastMessage = messages[messages.length - 1]!.trim();

    const jsonString = lastMessage
      .replace(/^final:/, "")
      .replace(/^new_message\.json:/, "")
      .trim();

    if (!jsonString) {
      throw new Error("Empty summary received");
    }

    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse summary JSON response");
    }
    throw new Error("Failed to parse summary response");
  }
}
