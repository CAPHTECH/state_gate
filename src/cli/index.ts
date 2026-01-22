#!/usr/bin/env node
/**
 * State Gate CLI
 * MCP Server の起動とユーティリティコマンド
 */

import { startMcpServer } from "../mcp/server.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "serve") {
    // MCP Server を起動
    const processFiles = args
      .filter((a) => a.startsWith("--process="))
      .map((a) => a.slice("--process=".length));

    const runsDir = args.find((a) => a.startsWith("--runs-dir="))?.slice("--runs-dir=".length);
    const metadataDir = args.find((a) => a.startsWith("--metadata-dir="))?.slice("--metadata-dir=".length);
    const defaultRole = args.find((a) => a.startsWith("--role="))?.slice("--role=".length);

    const config: {
      processFiles?: string[];
      runsDir?: string;
      metadataDir?: string;
      defaultRole?: string;
    } = {};

    if (processFiles.length > 0) {
      config.processFiles = processFiles;
    }
    if (runsDir !== undefined) {
      config.runsDir = runsDir;
    }
    if (metadataDir !== undefined) {
      config.metadataDir = metadataDir;
    }
    if (defaultRole !== undefined) {
      config.defaultRole = defaultRole;
    }

    await startMcpServer(config);
  } else if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${args[0]}`);
    printHelp();
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
State Gate CLI - AI Agent State Machine Orchestrator

Usage:
  state-gate [command] [options]

Commands:
  serve       Start MCP server (default)
  help        Show this help message

Options:
  --process=<file>     Process YAML file to load (can be specified multiple times)
  --runs-dir=<dir>     Directory for run CSV files (default: .state_gate/runs)
  --metadata-dir=<dir> Directory for metadata files (default: .state_gate/metadata)
  --role=<role>        Default role for operations (default: agent)

Examples:
  # Start MCP server with a process file
  state-gate --process=./process.yaml

  # Start with multiple process files
  state-gate --process=./process1.yaml --process=./process2.yaml

  # Start with custom directories
  state-gate --runs-dir=./data/runs --metadata-dir=./data/metadata
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
