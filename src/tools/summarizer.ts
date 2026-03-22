import { summarize, SUPPORTED_LANGUAGES } from "../kagi/summarize.ts";
import { formatError, getEnvironmentConfig } from "../utils/formatting.ts";
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
    if (!url) {
      throw new Error("Summarizer called with no URL.");
    }

    const { token, engine } = getEnvironmentConfig();

    if (!["summary", "takeaway"].includes(summary_type)) {
      throw new Error(
        `Invalid summary_type: ${summary_type}. Must be 'summary' or 'takeaway'.`,
      );
    }

    const language = target_language || "EN";

    if (
      target_language &&
      !(SUPPORTED_LANGUAGES as readonly string[]).includes(language)
    ) {
      console.warn(
        `Warning: Language '${language}' may not be supported. Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`,
      );
    }

    if (engine && engine !== "default") {
      console.warn(
        `Note: Engine selection (${engine}) from KAGI_SUMMARIZER_ENGINE may not be supported. Using default behavior.`,
      );
    }

    const options = {
      type: summary_type as "summary" | "takeaway",
      language,
      isUrl: true,
    };

    const result = await summarize(url, token, options);

    let summaryText: string;
    if (typeof result === "string") {
      summaryText = result;
    } else if (result?.data?.output) {
      summaryText = result.data.output;
    } else {
      summaryText = JSON.stringify(result, null, 2);
    }

    return {
      content: [{ type: "text" as const, text: summaryText }],
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
