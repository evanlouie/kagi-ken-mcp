import { err, ok, type Result } from "neverthrow";
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
import { formatAppError, type AppError } from "../utils/errors.ts";
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

export async function runSummarizer({
  url,
  summary_type,
  summary_length,
  target_language,
}: {
  url: string;
  summary_type?: SummaryType;
  summary_length?: ArticleSummaryLength;
  target_language?: SupportedLanguage;
}): Promise<Result<string, AppError>> {
  const tokenResult = resolveToken();
  if (tokenResult.isErr()) {
    return err(tokenResult.error);
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
    (summary) => ok(summary.data.output),
    (error) => err(error),
  );
}

/** MCP tool handler that summarizes a URL using Kagi's summarizer with configurable type and language. */
export async function kagiSummarizer(args: {
  url: string;
  summary_type?: SummaryType;
  summary_length?: ArticleSummaryLength;
  target_language?: SupportedLanguage;
}) {
  const result = await runSummarizer(args);
  return textContent(result.match((text) => text, formatAppError));
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
