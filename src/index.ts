#!/usr/bin/env bun

import pkg from "../package.json";
import { commandHelp, generalHelp } from "./cli/help.ts";
import { parseCliArgs, type CliCommand } from "./cli/parser.ts";
import { startMcpServer } from "./mcp/server.ts";
import { runSearch } from "./tools/search.ts";
import { runSummarizer } from "./tools/summarizer.ts";
import { formatAppError, formatUnknownError } from "./utils/errors.ts";

const { version } = pkg;

function printStdout(text: string) {
  process.stdout.write(`${text}\n`);
}

function printStderr(text: string) {
  process.stderr.write(`${text}\n`);
}

async function runCommand(command: CliCommand): Promise<number> {
  switch (command.type) {
    case "help":
      printStdout(commandHelp(command.topic));
      return command.exitCode;
    case "version":
      printStdout(version);
      return 0;
    case "search": {
      const result = await runSearch({ queries: command.queries, limit: command.limit });
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
    }
    case "summarize": {
      const result = await runSummarizer({
        url: command.url,
        summary_type: command.summary_type,
        summary_length: command.summary_length,
        target_language: command.target_language,
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
    }
    case "mcp": {
      const result = await startMcpServer();
      return result.match(
        () => 0,
        (error) => {
          printStderr(`Failed to start Tobira MCP Server v${version}: ${formatAppError(error)}`);
          return 1;
        },
      );
    }
  }
}

async function main(args: string[]): Promise<number> {
  const commandResult = parseCliArgs(args);
  if (commandResult.isErr()) {
    printStderr(formatAppError(commandResult.error));
    printStderr("");
    printStderr(generalHelp());
    return 2;
  }

  return runCommand(commandResult.value);
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
