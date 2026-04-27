#!/usr/bin/env bun

import { match } from "ts-pattern";

import pkg from "../package.json";
import { commandHelp, generalHelp } from "./cli/help.ts";
import { parseCliArgs, type CliCommand } from "./cli/parser.ts";
import { startMcpServer } from "./mcp/server.ts";
import { runSearch } from "./tools/search.ts";
import { runSummarizer } from "./tools/summarizer.ts";
import { formatAppError, formatUnknownError } from "./utils/errors.ts";

const { version } = pkg;

const printStdout = (text: string) => process.stdout.write(`${text}\n`);

const printStderr = (text: string) => process.stderr.write(`${text}\n`);

async function runCommand(command: CliCommand): Promise<number> {
  return await match<CliCommand, Promise<number>>(command)
    .with({ type: "help" }, async ({ topic, exitCode }) => {
      printStdout(commandHelp(topic));
      return exitCode;
    })
    .with({ type: "version" }, async () => {
      printStdout(version);
      return 0;
    })
    .with({ type: "search" }, async ({ queries, limit }) => {
      const result = await runSearch({ queries, limit });
      return result.match(
        (text) => {
          printStdout(text);
          return 0;
        },
        (error) => {
          printStderr(formatAppError(error));
          return 1;
        },
      );
    })
    .with({ type: "summarize" }, async ({ url, summary_type, summary_length, target_language }) => {
      const result = await runSummarizer({
        url,
        summary_type,
        summary_length,
        target_language,
      });
      return result.match(
        (text) => {
          printStdout(text);
          return 0;
        },
        (error) => {
          printStderr(formatAppError(error));
          return 1;
        },
      );
    })
    .with({ type: "mcp" }, async () => {
      const result = await startMcpServer();
      return result.match(
        () => 0,
        (error) => {
          printStderr(`Failed to start Tobira MCP Server v${version}: ${formatAppError(error)}`);
          return 1;
        },
      );
    })
    .exhaustive();
}

async function main(args: string[]): Promise<number> {
  return await parseCliArgs(args).match(
    (command) => runCommand(command),
    (error) => {
      printStderr(formatAppError(error));
      printStderr("");
      printStderr(generalHelp());
      return 2;
    },
  );
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", formatUnknownError(reason));
  process.exit(1);
});

process.exitCode = await main(process.argv.slice(2));
