#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { kagiSearchFetch, searchToolConfig } from "./tools/search.ts";
import { kagiSummarizer, summarizerToolConfig } from "./tools/summarizer.ts";

import pkg from "../package.json";
const { version } = pkg;

class KagiKenMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "kagi-ken-mcp",
      version: "1.0.0",
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
      async (args) => await kagiSearchFetch(args as any),
    );

    this.server.registerTool(
      summarizerToolConfig.name,
      {
        title: "Kagi Summarizer",
        description: summarizerToolConfig.description,
        inputSchema: summarizerToolConfig.inputSchema,
      },
      async (args) => await kagiSummarizer(args as any),
    );
  }

  async start() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error(`Kagi Ken MCP Server v${version} started successfully`);
    } catch (error) {
      console.error(
        `Failed to start Kagi Ken MCP Server v${version}:`,
        error,
      );
      process.exit(1);
    }
  }
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const server = new KagiKenMcpServer();
await server.start();
