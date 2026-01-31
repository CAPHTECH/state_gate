/**
 * MCP Server
 * Model Context Protocol サーバー実装
 * @see docs/mcp-interface.md
 */

import * as path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { RunId } from "../types/index.js";
import { StateEngine, StateEngineError } from "../engine/state-engine.js";
import { validateRunId } from "../run/validate-run-id.js";
import { loadRunConfig } from "../run/run-config.js";

import { handleGetState } from "../engine/handlers/get-state.js";
import { handleListEvents } from "../engine/handlers/list-events.js";
import { handleEmitEvent } from "../engine/handlers/emit-event.js";
import { parseProcessFile } from "../process/parser.js";
import { validateProcess } from "../process/validator.js";

/**
 * プロジェクトルートを取得
 * 環境変数 STATE_GATE_PROJECT_ROOT が設定されていればそれを使用、
 * そうでなければ process.cwd() を使用
 * 相対パスは process.cwd() を基準に解決される
 */
function getProjectRoot(): string {
  const root = process.env.STATE_GATE_PROJECT_ROOT || process.cwd();
  return path.resolve(root);
}

/**
 * MCP Server 設定
 */
export interface McpServerConfig {
  /** プロセス定義ファイルのパス */
  processFiles?: string[];
  /** Run データのディレクトリ */
  runsDir?: string;
  /** メタデータのディレクトリ */
  metadataDir?: string;
  /** Run 設定ファイルのパス */
  runConfigPath?: string;
  /** デフォルトロール */
  defaultRole?: string;
}

/**
 * State Gate MCP Server を作成
 */
export async function createMcpServer(config: McpServerConfig = {}): Promise<Server> {
  const isSilent =
    process.env.STATE_GATE_SILENT === "1" || process.env.NODE_ENV === "test";
  const logInfo = (...args: unknown[]) => {
    if (!isSilent) {
      console.error(...args);
    }
  };
  const logError = (...args: unknown[]) => {
    if (!isSilent) {
      console.error(...args);
    }
  };

  const server = new Server(
    {
      name: "state-gate",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // State Engine を初期化
  // 環境変数からプロジェクトルートを取得し、デフォルトのディレクトリパスを構築
  const projectRoot = getProjectRoot();
  const stateGateDir = path.join(projectRoot, ".state_gate");

  const engineOptions: { runsDir?: string; metadataDir?: string; processDir?: string } = {
    runsDir: config.runsDir ?? path.join(stateGateDir, "runs"),
    metadataDir: config.metadataDir ?? path.join(stateGateDir, "metadata"),
    processDir: path.join(stateGateDir, "processes"),
  };
  const engine = new StateEngine(engineOptions);

  logInfo(`Project root: ${projectRoot}`);

  // プロセス定義を読み込み
  if (config.processFiles) {
    for (const file of config.processFiles) {
      try {
        const process = await parseProcessFile(file);
        const validation = validateProcess(process);
        if (!validation.valid) {
          logError(`Invalid process file ${file}:`, validation.errors);
          continue;
        }
        engine.registerProcess(process);
        logInfo(`Loaded process: ${process.id}`);
      } catch (error) {
        logError(`Failed to load process file ${file}:`, error);
      }
    }
  }

  const defaultRole = config.defaultRole ?? "agent";
  // runConfigPath が未指定の場合はプロジェクトルートを基準に設定
  const runConfigPath = config.runConfigPath ?? path.join(stateGateDir, "state-gate.json");

  const resolveRunId = async (input?: {
    run_id?: string;
  }): Promise<RunId> => {
    if (input?.run_id) {
      return validateRunId(input.run_id);
    }
    const runConfig = await loadRunConfig(runConfigPath);
    if (runConfig?.run_id) {
      return validateRunId(runConfig.run_id);
    }
    throw new StateEngineError(
      "run_id is required (set args.run_id or .state_gate/state-gate.json)",
      "INVALID_INPUT"
    );
  };

  // ツール一覧
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "state_gate.get_state",
          description: "Get current state and related information for a run",
          inputSchema: {
            type: "object" as const,
            properties: {
              run_id: {
                type: "string",
                description:
                  "Run ID (format: run-{uuid}); optional when .state_gate/state-gate.json is present",
              },
            },
          },
        },
        {
          name: "state_gate.list_events",
          description: "List available events for the current state",
          inputSchema: {
            type: "object" as const,
            properties: {
              run_id: {
                type: "string",
                description:
                  "Run ID; optional when .state_gate/state-gate.json is present",
              },
              include_blocked: {
                type: "boolean",
                description: "Include events blocked by guards",
              },
            },
          },
        },
        {
          name: "state_gate.emit_event",
          description: "Emit an event to transition state",
          inputSchema: {
            type: "object" as const,
            properties: {
              run_id: {
                type: "string",
                description:
                  "Run ID; optional when .state_gate/state-gate.json is present",
              },
              event_name: {
                type: "string",
                description: "Event name to emit",
              },
              payload: {
                type: "object",
                description: "Event payload",
              },
              expected_revision: {
                type: "number",
                description: "Expected current revision (for optimistic locking)",
              },
              idempotency_key: {
                type: "string",
                description: "Unique key for idempotency",
              },
              artifact_paths: {
                type: "array",
                items: { type: "string" },
                description: "Paths to artifact files",
              },
            },
            required: ["event_name", "expected_revision", "idempotency_key"],
          },
        },
        {
          name: "state_gate.create_run",
          description: "Create a new run for a process",
          inputSchema: {
            type: "object" as const,
            properties: {
              process_id: {
                type: "string",
                description: "Process ID to create run for",
              },
              context: {
                type: "object",
                description: "Initial context variables",
              },
            },
            required: ["process_id"],
          },
        },
        {
          name: "state_gate.list_runs",
          description: "List all runs",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
        },
      ],
    };
  });

  // ツール実行
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "state_gate.get_state": {
          const runId = await resolveRunId(args as { run_id?: string });
          const result = await handleGetState(engine, { run_id: runId }, defaultRole);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "state_gate.list_events": {
          const listArgs = args as { run_id?: string; include_blocked?: boolean };
          const listRequest: import("../types/index.js").ListEventsRequest = {
            run_id: await resolveRunId(listArgs),
          };
          if (listArgs.include_blocked !== undefined) {
            listRequest.include_blocked = listArgs.include_blocked;
          }
          const result = await handleListEvents(engine, listRequest, defaultRole);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "state_gate.emit_event": {
          const emitArgs = args as {
            run_id?: string;
            event_name: string;
            payload?: Record<string, unknown>;
            expected_revision: number;
            idempotency_key: string;
            artifact_paths?: string[];
          };
          const emitRequest: import("../types/index.js").EmitEventRequest = {
            run_id: await resolveRunId(emitArgs),
            event_name: emitArgs.event_name,
            expected_revision: emitArgs.expected_revision,
            idempotency_key: emitArgs.idempotency_key,
          };
          if (emitArgs.payload !== undefined) {
            emitRequest.payload = emitArgs.payload;
          }
          if (emitArgs.artifact_paths !== undefined) {
            emitRequest.artifact_paths = emitArgs.artifact_paths;
          }
          const result = await handleEmitEvent(engine, emitRequest, defaultRole);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "state_gate.create_run": {
          const createArgs = args as {
            process_id: string;
            context?: Record<string, unknown>;
          };
          const createParams: import("../engine/state-engine.js").CreateRunParams = {
            processId: createArgs.process_id,
          };
          if (createArgs.context !== undefined) {
            createParams.context = createArgs.context;
          }
          const runState = await engine.createRun(createParams);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    run_id: runState.run_id,
                    initial_state: runState.current_state,
                    revision: runState.revision,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "state_gate.list_runs": {
          const runs = await engine.listRuns();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    runs: runs.map((r) => ({
                      run_id: r.run_id,
                      process_id: r.process_id,
                      current_state: r.current_state,
                      revision: r.revision,
                      created_at: r.created_at,
                      updated_at: r.updated_at,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      // StateEngineError は安全なエラーメッセージを持つ
      // その他のエラーは内部詳細を隠蔽
      let publicMessage: string;
      let errorCode: string | undefined;

      if (error instanceof StateEngineError) {
        publicMessage = error.message;
        errorCode = error.code;
      } else if (error instanceof Error && error.message.startsWith("Invalid run_id")) {
        publicMessage = error.message;
        errorCode = "INVALID_INPUT";
      } else {
        // 内部エラーの詳細は隠蔽し、ログに記録
        logError("MCP Server internal error:", error);
        publicMessage = "Internal server error";
        errorCode = "INTERNAL_ERROR";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: publicMessage,
              code: errorCode,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // リソース一覧
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const runs = await engine.listRuns();
    return {
      resources: runs.map((run) => ({
        uri: `stategate://runs/${run.run_id}/summary`,
        name: `Run ${run.run_id}`,
        mimeType: "application/json",
        description: `Summary for run ${run.run_id} (${run.process_id})`,
      })),
    };
  });

  // リソース読み取り
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // URI パターン: stategate://runs/{run_id}/summary
    const match = uri.match(/^stategate:\/\/runs\/([^/]+)\/summary$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const runId = validateRunId(match[1]!);
    const runState = await engine.getRunState(runId);
    const process = engine.getProcess(runState.process_id);

    if (!process) {
      throw new Error(`Process not found: ${runState.process_id}`);
    }

    const content = {
      run_id: runState.run_id,
      process: {
        id: process.id,
        version: process.version,
        name: process.name,
      },
      current_state: runState.current_state,
      revision: runState.revision,
      created_at: runState.created_at,
      updated_at: runState.updated_at,
    };

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * MCP Server を起動（stdio transport）
 */
export async function startMcpServer(config: McpServerConfig = {}): Promise<void> {
  const server = await createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (
    process.env.STATE_GATE_SILENT !== "1" &&
    process.env.NODE_ENV !== "test"
  ) {
    console.error("State Gate MCP server started");
  }
}
