import { z } from "zod";

import {
  articleSummaryLengthSchema,
  summarize,
  summaryTypeSchema,
  supportedLanguageSchema,
  type ArticleSummaryLength,
  type SummaryType,
  type SupportedLanguage,
} from "../kagi/summarize.ts";
import { resolveToken } from "../utils/auth.ts";
import { formatAppError } from "../utils/errors.ts";
import { withTimeout } from "../utils/timeout.ts";

const SUMMARY_TIMEOUT_MS = 60_000;

export const summarizerInputSchema = {
  url: z.string().url().describe("A URL to a document to summarize."),
  summary_type: summaryTypeSchema
    .default("article")
    .describe(
      "Type of summary to produce. Options are 'keypoints' for concise bullets, 'eli5' for a simplified explanation, and 'article' for a prose summary.",
    ),
  summary_length: articleSummaryLengthSchema
    .optional()
    .describe(
      "Optional length for 'article' summaries. Options are 'headline', 'overview', 'digest', 'medium', and 'long'.",
    ),
  target_language: supportedLanguageSchema
    .optional()
    .describe(
      "Desired output language using language codes (e.g., 'EN' for English). If not specified, the document's original language influences the output.",
    ),
};

function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** MCP tool handler that summarizes a URL using Kagi's summarizer with configurable type and language. */
export async function kagiSummarizer({
  url,
  summary_type,
  summary_length,
  target_language,
}: {
  url: string;
  summary_type?: SummaryType;
  summary_length?: ArticleSummaryLength;
  target_language?: SupportedLanguage;
}) {
  const tokenResult = resolveToken();
  if (tokenResult.isErr()) {
    return textContent(formatAppError(tokenResult.error));
  }

  const result = await withTimeout(
    (signal) =>
      summarize(
        url,
        tokenResult.value,
        {
          type: summary_type,
          summaryLength: summary_length,
          language: target_language,
          isUrl: true,
        },
        { signal },
      ),
    SUMMARY_TIMEOUT_MS,
    "Summarizer timeout",
  );

  return result.match(
    (summary) => textContent(summary.data.output),
    (error) => textContent(formatAppError(error)),
  );
}

export const summarizerToolConfig = {
  name: "kagi_summarizer",
  description: `
    Summarize content from a URL using the Kagi.com Summarizer API. The Summarizer can summarize any
    document type (text webpage, video, audio, etc.)
    `
    .replaceAll(/\s+/gs, " ")
    .trim(),
  inputSchema: summarizerInputSchema,
};
