import { summarize } from "../kagi/summarize.ts";
import { formatError, getToken } from "../utils/formatting.ts";
import { z } from "zod";

export const summarizerInputSchema = {
  url: z.string().url().describe("A URL to a document to summarize."),
  summary_type: z
    .enum(["summary", "takeaway"])
    .default("summary")
    .describe(
      "Type of summary to produce. Options are 'summary' for paragraph prose and 'takeaway' for a bulleted list of key points.",
    ),
  target_language: z
    .string()
    .optional()
    .describe(
      "Desired output language using language codes (e.g., 'EN' for English). If not specified, the document's original language influences the output.",
    ),
};

export async function kagiSummarizer({
  url,
  summary_type = "summary",
  target_language,
}: {
  url: string;
  summary_type?: "summary" | "takeaway";
  target_language?: string;
}) {
  try {
    const token = getToken();

    const result = await summarize(url, token, {
      type: summary_type,
      language: (target_language || "EN") as any,
      isUrl: true,
    });

    return {
      content: [{ type: "text" as const, text: result.data.output }],
    };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: formatError(error) }],
    };
  }
}

export const summarizerToolConfig = {
  name: "kagi_summarizer",
  description: `
    Summarize content from a URL using the Kagi.com Summarizer API. The Summarizer can summarize any
    document type (text webpage, video, audio, etc.)
    `
    .replace(/\s+/gs, " ")
    .trim(),
  inputSchema: summarizerInputSchema,
};
