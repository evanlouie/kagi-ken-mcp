#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResultAsync } from "neverthrow";

import pkg from "../package.json";
import { kagiSearchFetch, searchToolConfig } from "./tools/search.ts";
import { kagiSummarizer, summarizerToolConfig } from "./tools/summarizer.ts";
import { formatAppError, toUnexpectedError, type AppError } from "./utils/errors.ts";

const { version } = pkg;

class KagiKenMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "kagi-ken-mcp",
      version,
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.registerTool(
      searchToolConfig.name,
      {
        title: "Kagi Search",
        description: searchToolConfig.description,
        inputSchema: searchToolConfig.inputSchema,
      },
      (args) => kagiSearchFetch(args as Parameters<typeof kagiSearchFetch>[0]),
    );

    this.server.registerTool(
      summarizerToolConfig.name,
      {
        title: "Kagi Summarizer",
        description: summarizerToolConfig.description,
        inputSchema: summarizerToolConfig.inputSchema,
      },
      (args) => kagiSummarizer(args as Parameters<typeof kagiSummarizer>[0]),
    );
  }

  start(): ResultAsync<void, AppError> {
    return ResultAsync.fromPromise(
      (async () => {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error(`Kagi Ken MCP Server v${version} started successfully`);
      })(),
      toUnexpectedError,
    );
  }
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

const server = new KagiKenMcpServer();
const startResult = await server.start();
if (startResult.isErr()) {
  console.error(
    `Failed to start Kagi Ken MCP Server v${version}:`,
    formatAppError(startResult.error),
  );
  process.exit(1);
}
