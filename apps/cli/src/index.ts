#!/usr/bin/env node
import { buildContextPrompt } from "@gotomemory/sdk";

export function runCli(argv: string[]): string {
  const [command, ...args] = argv;
  if (command === "build-context") {
    return buildContextPrompt(args.map((content) => ({ content })));
  }

  return ["gotomemory", "", "Commands:", "  build-context <memory...>"].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(runCli(process.argv.slice(2)));
}
