#!/usr/bin/env node
import { createClient } from "@gotomemory/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";

const client = createClient({
  baseUrl: process.env.GOTOMEMORY_URL ?? "http://localhost:8787/v1",
  token: process.env.GOTOMEMORY_TOKEN ?? "t1:u1",
});

const server = new McpServer({ name: "gotomemory", version: "0.1.0" });
registerTools(server, client);

await server.connect(new StdioServerTransport());
