import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResultAsync } from "neverthrow";

import pkg from "../../package.json";
import { kagiSearchFetch, searchToolConfig } from "../tools/search.ts";
import { kagiSummarizer, summarizerToolConfig } from "../tools/summarizer.ts";
import { toUnexpectedError, type AppError } from "../utils/errors.ts";

const { version } = pkg;

export class TobiraMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "tobira",
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
        console.error(`Tobira MCP Server v${version} started successfully`);
      })(),
      toUnexpectedError,
    );
  }
}

export function startMcpServer(): ResultAsync<void, AppError> {
  return new TobiraMcpServer().start();
}
