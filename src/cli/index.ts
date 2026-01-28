#!/usr/bin/env node
/**
 * State Gate CLI
 * MCP Server の起動と Run 操作
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { startMcpServer } from "../mcp/server.js";
import { StateEngine, StateEngineError } from "../engine/state-engine.js";
import { handleGetState } from "../engine/handlers/get-state.js";
import { handleListEvents } from "../engine/handlers/list-events.js";
import { handleEmitEvent } from "../engine/handlers/emit-event.js";
import { parseProcessFile } from "../process/parser.js";
import { validateProcess } from "../process/validator.js";
import { CsvStore } from "../run/csv-store.js";
import { MetadataStore } from "../run/metadata-store.js";
import { isValidRunId } from "../run/validate-run-id.js";
import { loadRunConfig, writeRunConfig } from "../run/run-config.js";
import { handlePreToolUse, handlePostToolUse } from "../hook/adapter.js";
import type {
  EmitEventRequest,
  ListEventsRequest,
  Process,
  PreToolUseInput,
  PreToolUseOutput,
  PostToolUseInput,
  PostToolUseOutput,
  RunId,
  RunSummary,
} from "../types/index.js";

type OptionValue = string | boolean | string[];

interface ParsedArgs {
  command?: string;
  options: Record<string, OptionValue>;
  positionals: string[];
}

class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CliError";
  }
}

const DEFAULT_PROCESS_DIR = ".state_gate/processes";
const DEFAULT_RUNS_DIR = ".state_gate/runs";
const DEFAULT_METADATA_DIR = ".state_gate/metadata";
const DEFAULT_ROLE = "agent";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.command === "serve") {
    await startServer(parsed.options);
    return;
  }

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    outputHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case "create-run":
        await commandCreateRun(parsed.options);
        break;
      case "get-state":
        await commandGetState(parsed.options);
        break;
      case "list-events":
        await commandListEvents(parsed.options);
        break;
      case "emit-event":
        await commandEmitEvent(parsed.options);
        break;
      case "list-runs":
        await commandListRuns(parsed.options);
        break;
      case "pre-tool-use":
        await commandPreToolUse(parsed.options, parsed.positionals);
        break;
      case "post-tool-use":
        await commandPostToolUse(parsed.options, parsed.positionals);
        break;
      default:
        throw new CliError("INVALID_INPUT", `Unknown command: ${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof CliError) {
      outputError(error.code, error.message, error.details);
      process.exitCode = 1;
      return;
    }
    if (error instanceof StateEngineError) {
      outputError(error.code, error.message, error.details);
      process.exitCode = 1;
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    outputError("INTERNAL_ERROR", message);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const options: Record<string, OptionValue> = {};
  const positionals: string[] = [];
  let command: string | undefined;

  let i = 0;
  if (args[0] && !args[0].startsWith("-")) {
    command = args[0];
    i = 1;
  }

  for (; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      const key = arg.slice(2, eqIndex);
      const value = arg.slice(eqIndex + 1);
      addOption(options, key, value);
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      addOption(options, key, next);
      i++;
      continue;
    }

    addOption(options, key, true);
  }

  const parsed: ParsedArgs = {
    options,
    positionals,
    ...(command !== undefined && { command }),
  };
  return parsed;
}

function addOption(
  options: Record<string, OptionValue>,
  key: string,
  value: string | boolean
): void {
  const existing = options[key];
  if (existing === undefined) {
    options[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    if (typeof value === "string") {
      existing.push(value);
    }
    return;
  }
  if (typeof existing === "string" && typeof value === "string") {
    options[key] = [existing, value];
    return;
  }
  options[key] = value;
}

function outputJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function outputError(code: string, message: string, details?: unknown): void {
  const errorPayload: { error: { code: string; message: string; details?: unknown } } = {
    error: { code, message },
  };
  if (details !== undefined) {
    errorPayload.error.details = details;
  }
  outputJson(errorPayload);
}

function outputHelp(): void {
  outputJson({
    commands: {
      "create-run": "Create a new run for a process",
      "get-state": "Get current state for a run",
      "list-events": "List available events for a run",
      "emit-event": "Emit an event for a run",
      "list-runs": "List all runs",
      "pre-tool-use": "Hook adapter decision for PreToolUse",
      "serve": "Start MCP server",
    },
    options: {
      common: ["--runs-dir", "--metadata-dir", "--process-dir", "--role"],
      "create-run": ["--process-id", "--context", "--write-config", "--config-path"],
      "get-state": ["--run-id"],
      "list-events": ["--run-id", "--include-blocked"],
      "emit-event": [
        "--run-id",
        "--event",
        "--expected-revision",
        "--idempotency-key",
        "--payload",
        "--artifact-paths",
      ],
      "pre-tool-use": [
        "--tool-name",
        "--tool-input",
        "--run-id",
        "--policy-path",
        "--config-path",
      ],
    },
    stdin: {
      "pre-tool-use": "Accepts JSON via stdin with { tool_name, tool_input, run_id }",
    },
  });
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const content = Buffer.concat(chunks).toString("utf-8").trim();
  return content.length > 0 ? content : null;
}

function normalizeToolInput(
  toolName: string,
  toolInput: unknown,
  fallbackRaw?: string
): Record<string, unknown> {
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    return toolInput as Record<string, unknown>;
  }
  if (typeof toolInput === "string") {
    return wrapRawToolInput(toolName, toolInput);
  }
  if (toolInput !== undefined) {
    return { value: toolInput };
  }
  if (fallbackRaw) {
    return normalizeToolInputFromString(toolName, fallbackRaw);
  }
  return {};
}

function normalizeToolInputFromString(
  toolName: string,
  raw: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      return wrapRawToolInput(toolName, parsed);
    }
    return { value: parsed };
  } catch {
    return wrapRawToolInput(toolName, raw);
  }
}

function wrapRawToolInput(toolName: string, raw: string): Record<string, unknown> {
  if (toolName === "Bash") {
    return { command: raw };
  }
  return { raw };
}

function resolveRole(options: Record<string, OptionValue>): string {
  const optionRole = getStringOption(options, ["role"]);
  return optionRole ?? process.env.STATE_GATE_ROLE ?? DEFAULT_ROLE;
}

function resolvePaths(options: Record<string, OptionValue>): {
  processDir: string;
  runsDir: string;
  metadataDir: string;
} {
  const processDir =
    getStringOption(options, ["process-dir"]) ??
    process.env.STATE_GATE_PROCESS_DIR ??
    DEFAULT_PROCESS_DIR;
  const runsDir =
    getStringOption(options, ["runs-dir"]) ??
    process.env.STATE_GATE_RUNS_DIR ??
    DEFAULT_RUNS_DIR;
  const metadataDir =
    getStringOption(options, ["metadata-dir"]) ??
    process.env.STATE_GATE_METADATA_DIR ??
    DEFAULT_METADATA_DIR;

  return { processDir, runsDir, metadataDir };
}

function getStringOption(
  options: Record<string, OptionValue>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (typeof last === "string") {
        return last;
      }
    }
  }
  return undefined;
}

function requireStringOption(
  options: Record<string, OptionValue>,
  keys: string[],
  label: string
): string {
  const value = getStringOption(options, keys);
  if (!value) {
    throw new CliError("INVALID_INPUT", `${label} is required`);
  }
  return value;
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new CliError(
      "INVALID_INPUT",
      `${label} must be valid JSON`,
      error instanceof Error ? { reason: error.message } : undefined
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("INVALID_INPUT", `${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseBooleanOption(value: OptionValue | undefined, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new CliError("INVALID_INPUT", `${label} must be a boolean`);
  }
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw new CliError("INVALID_INPUT", `${label} must be a boolean`);
}

function parseNumberOption(value: OptionValue | undefined, label: string): number {
  if (typeof value !== "string") {
    throw new CliError("INVALID_INPUT", `${label} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliError("INVALID_INPUT", `${label} must be a number`);
  }
  return parsed;
}

function parseArtifactPaths(value: OptionValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new CliError("INVALID_INPUT", "artifact_paths must be a string");
  }
  if (typeof value !== "string") {
    throw new CliError("INVALID_INPUT", "artifact_paths must be a string");
  }
  const paths = value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return paths.length > 0 ? paths : [];
}

function validateProcessId(processId: string): void {
  if (processId.includes("..") || processId.includes("/") || processId.includes("\\")) {
    throw new CliError("INVALID_INPUT", "process_id must not contain path separators");
  }
}

function validateRunIdInput(runId: string): RunId {
  if (!isValidRunId(runId)) {
    throw new CliError("INVALID_INPUT", `Invalid run_id format: ${runId}`);
  }
  return runId as RunId;
}

async function resolveProcessFile(processDir: string, processId: string): Promise<string> {
  const yamlPath = path.join(processDir, `${processId}.yaml`);
  try {
    await fs.access(yamlPath);
    return yamlPath;
  } catch {
    // continue
  }

  const ymlPath = path.join(processDir, `${processId}.yml`);
  try {
    await fs.access(ymlPath);
    return ymlPath;
  } catch {
    throw new CliError("PROCESS_NOT_FOUND", `Process file not found for '${processId}'`);
  }
}

async function loadProcess(processDir: string, processId: string): Promise<Process> {
  validateProcessId(processId);
  const filePath = await resolveProcessFile(processDir, processId);
  const process = await parseProcessFile(filePath);
  const validation = validateProcess(process);
  if (!validation.valid) {
    throw new CliError("INVALID_PROCESS", `Invalid process definition: ${processId}`, {
      errors: validation.errors,
    });
  }
  return process;
}

async function startServer(options: Record<string, OptionValue>): Promise<void> {
  const processFiles: string[] = [];
  const processOption = options.process;
  if (typeof processOption === "string") {
    processFiles.push(processOption);
  } else if (Array.isArray(processOption)) {
    for (const entry of processOption) {
      if (typeof entry === "string") {
        processFiles.push(entry);
      }
    }
  }

  // --process オプションなしの場合、デフォルトディレクトリから自動読み込み
  if (processFiles.length === 0) {
    try {
      const defaultDir = DEFAULT_PROCESS_DIR;
      const entries = await fs.readdir(defaultDir);
      for (const entry of entries) {
        if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
          processFiles.push(path.join(defaultDir, entry));
        }
      }
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  }

  const runsDir = getStringOption(options, ["runs-dir"]);
  const metadataDir = getStringOption(options, ["metadata-dir"]);
  const defaultRole = getStringOption(options, ["role"]);

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
}

async function commandCreateRun(options: Record<string, OptionValue>): Promise<void> {
  const processId = requireStringOption(options, ["process-id"], "process_id");
  const contextValue = getStringOption(options, ["context"]);
  const context = contextValue ? parseJsonObject(contextValue, "context") : undefined;
  const writeConfig = parseBooleanOption(options["write-config"], "write_config") ?? false;
  const configPath = getStringOption(options, ["config-path"]);
  const { processDir, runsDir, metadataDir } = resolvePaths(options);

  const processDefinition = await loadProcess(processDir, processId);

  const engine = new StateEngine({ runsDir, metadataDir });
  engine.registerProcess(processDefinition);

  const runState = await engine.createRun({
    processId,
    ...(context !== undefined && { context }),
  });
  if (writeConfig) {
    await writeRunConfig({ run_id: runState.run_id }, configPath);
  }
  outputJson({
    run_id: runState.run_id,
    initial_state: runState.current_state,
    revision: runState.revision,
  });
}

async function commandGetState(options: Record<string, OptionValue>): Promise<void> {
  const runId = validateRunIdInput(requireStringOption(options, ["run-id"], "run_id"));
  const { processDir, runsDir, metadataDir } = resolvePaths(options);
  const role = resolveRole(options);

  const metadataStore = new MetadataStore({ baseDir: metadataDir });
  const metadata = await metadataStore.load(runId);
  if (!metadata) {
    throw new CliError("RUN_NOT_FOUND", `Run '${runId}' not found`);
  }

  const processDefinition = await loadProcess(processDir, metadata.process_id);

  const engine = new StateEngine({ runsDir, metadataDir });
  engine.registerProcess(processDefinition);

  const response = await handleGetState(
    engine,
    { run_id: runId },
    role
  );
  outputJson(response);
}

async function commandListEvents(options: Record<string, OptionValue>): Promise<void> {
  const runId = validateRunIdInput(requireStringOption(options, ["run-id"], "run_id"));
  const includeBlocked = parseBooleanOption(options["include-blocked"], "include_blocked");
  const { processDir, runsDir, metadataDir } = resolvePaths(options);
  const role = resolveRole(options);

  const metadataStore = new MetadataStore({ baseDir: metadataDir });
  const metadata = await metadataStore.load(runId);
  if (!metadata) {
    throw new CliError("RUN_NOT_FOUND", `Run '${runId}' not found`);
  }

  const processDefinition = await loadProcess(processDir, metadata.process_id);

  const engine = new StateEngine({ runsDir, metadataDir });
  engine.registerProcess(processDefinition);

  const request: ListEventsRequest = {
    run_id: runId,
  };
  if (includeBlocked !== undefined) {
    request.include_blocked = includeBlocked;
  }

  const response = await handleListEvents(engine, request, role);
  outputJson(response);
}

async function commandEmitEvent(options: Record<string, OptionValue>): Promise<void> {
  const runId = validateRunIdInput(requireStringOption(options, ["run-id"], "run_id"));
  const eventName = requireStringOption(options, ["event", "event-name"], "event");
  const expectedRevision = parseNumberOption(options["expected-revision"], "expected_revision");
  const idempotencyKey = requireStringOption(options, ["idempotency-key"], "idempotency_key");
  const payloadValue = getStringOption(options, ["payload"]);
  const artifactPaths = parseArtifactPaths(options["artifact-paths"]);
  const { processDir, runsDir, metadataDir } = resolvePaths(options);
  const role = resolveRole(options);

  let payload: Record<string, unknown> | undefined;
  if (payloadValue) {
    payload = parseJsonObject(payloadValue, "payload");
  }

  const metadataStore = new MetadataStore({ baseDir: metadataDir });
  const metadata = await metadataStore.load(runId);
  if (!metadata) {
    outputJson({
      success: false,
      error: {
        code: "RUN_NOT_FOUND",
        message: `Run '${runId}' not found`,
      },
    });
    process.exitCode = 1;
    return;
  }

  const processDefinition = await loadProcess(processDir, metadata.process_id);

  const engine = new StateEngine({ runsDir, metadataDir });
  engine.registerProcess(processDefinition);

  const request: EmitEventRequest = {
    run_id: runId,
    event_name: eventName,
    expected_revision: expectedRevision,
    idempotency_key: idempotencyKey,
  };
  if (payload !== undefined) {
    request.payload = payload;
  }
  if (artifactPaths !== undefined) {
    request.artifact_paths = artifactPaths;
  }

  const response = await handleEmitEvent(engine, request, role);
  outputJson(response);
  if (!response.success) {
    process.exitCode = 1;
  }
}

async function commandListRuns(options: Record<string, OptionValue>): Promise<void> {
  const { runsDir, metadataDir } = resolvePaths(options);
  const metadataStore = new MetadataStore({ baseDir: metadataDir });
  const csvStore = new CsvStore({ baseDir: runsDir });

  const metadataList = await metadataStore.listAll();
  const runs: RunSummary[] = [];

  for (const metadata of metadataList) {
    try {
      const latestEntry = await csvStore.getLatestEntry(metadata.run_id);
      if (!latestEntry) continue;

      runs.push({
        run_id: metadata.run_id,
        process_id: metadata.process_id,
        current_state: latestEntry.state,
        revision: latestEntry.revision,
        created_at: metadata.created_at,
        updated_at: latestEntry.timestamp,
      });
    } catch {
      // Skip runs with missing CSV data
    }
  }

  outputJson({ runs });
}

async function commandPreToolUse(
  options: Record<string, OptionValue>,
  positionals: string[]
): Promise<void> {
  const stdinPayload = await readStdin();
  let inputFromStdin: PreToolUseInput | null = null;
  let stdinToolInputRaw: string | undefined;

  if (stdinPayload) {
    try {
      const parsed = JSON.parse(stdinPayload) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        inputFromStdin = parsed as PreToolUseInput;
      } else {
        stdinToolInputRaw = stdinPayload;
      }
    } catch {
      stdinToolInputRaw = stdinPayload;
    }
  }

  const toolName =
    (typeof inputFromStdin?.tool_name === "string" ? inputFromStdin.tool_name : undefined) ??
    getStringOption(options, ["tool-name"]) ??
    positionals[0];

  if (!toolName) {
    outputJson({ decision: "allow" });
    return;
  }

  const toolInputRaw =
    getStringOption(options, ["tool-input"]) ?? positionals[1] ?? stdinToolInputRaw;
  const toolInput = normalizeToolInput(
    toolName,
    inputFromStdin?.tool_input,
    toolInputRaw
  );

  let runId =
    (typeof inputFromStdin?.run_id === "string" ? inputFromStdin.run_id : undefined) ??
    getStringOption(options, ["run-id"]);
  const configPath = getStringOption(options, ["config-path"]);
  if (!runId) {
    const config = await loadRunConfig(configPath);
    if (config?.run_id) {
      runId = config.run_id;
    }
  }

  const role = resolveRole(options);
  const policyPath = getStringOption(options, ["policy-path", "policy"]);
  const { processDir, runsDir, metadataDir } = resolvePaths(options);

  if (runId && !isValidRunId(runId)) {
    outputJson({ decision: "deny", reason: `Invalid run_id format: ${runId}` });
    process.exitCode = 1;
    return;
  }

  const request: PreToolUseInput = {
    tool_name: toolName,
    tool_input: toolInput,
  };
  if (runId) {
    request.run_id = runId as RunId;
  }

  const response = await handlePreToolUse(request, {
    processDir,
    runsDir,
    metadataDir,
    role,
    ...(policyPath !== undefined && { policyPath }),
  });

  outputJson(formatPreToolUseHookOutput(response));
}

async function commandPostToolUse(
  options: Record<string, OptionValue>,
  positionals: string[]
): Promise<void> {
  const stdinPayload = await readStdin();
  let inputFromStdin: PostToolUseInput | null = null;

  if (stdinPayload) {
    try {
      const parsed = JSON.parse(stdinPayload) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        inputFromStdin = parsed as PostToolUseInput;
      }
    } catch {
      // パースエラーは無視
    }
  }

  const toolName =
    (typeof inputFromStdin?.tool_name === "string" ? inputFromStdin.tool_name : undefined) ??
    getStringOption(options, ["tool-name"]) ??
    positionals[0];

  if (!toolName) {
    outputJson(formatPostToolUseHookOutput({}));
    return;
  }

  const toolInputRaw = getStringOption(options, ["tool-input"]) ?? positionals[1];
  const toolInput = normalizeToolInput(
    toolName,
    inputFromStdin?.tool_input,
    toolInputRaw
  );

  const toolResultRaw = getStringOption(options, ["tool-result"]) ?? positionals[2];
  let toolResult: unknown;
  if (inputFromStdin?.tool_result !== undefined) {
    toolResult = inputFromStdin.tool_result;
  } else if (toolResultRaw) {
    try {
      toolResult = JSON.parse(toolResultRaw);
    } catch {
      toolResult = toolResultRaw;
    }
  }

  const request: PostToolUseInput = {
    tool_name: toolName,
    tool_input: toolInput,
    tool_result: toolResult,
  };

  const response = await handlePostToolUse(request);
  outputJson(formatPostToolUseHookOutput(response));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  outputError("INTERNAL_ERROR", message);
  process.exit(1);
});

function formatPreToolUseHookOutput(
  response: PreToolUseOutput
): Record<string, unknown> {
  const hookOutput: {
    hookSpecificOutput: {
      hookEventName: "PreToolUse";
      permissionDecision?: "allow" | "deny" | "ask";
      permissionDecisionReason?: string;
    };
  } = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
    },
  };

  if (response.decision === "allow") {
    hookOutput.hookSpecificOutput.permissionDecision = "allow";
    return hookOutput;
  }

  if (response.decision === "deny") {
    hookOutput.hookSpecificOutput.permissionDecision = "deny";
    hookOutput.hookSpecificOutput.permissionDecisionReason =
      response.reason ?? "Denied by policy";
    return hookOutput;
  }

  hookOutput.hookSpecificOutput.permissionDecision = "ask";
  hookOutput.hookSpecificOutput.permissionDecisionReason =
    response.question ?? "Confirmation required";
  return hookOutput;
}

function formatPostToolUseHookOutput(
  response: PostToolUseOutput
): Record<string, unknown> {
  const hookOutput: {
    hookSpecificOutput: {
      hookEventName: "PostToolUse";
      insertPrompt?: string;
    };
  } = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
    },
  };

  if (response.insertPrompt) {
    hookOutput.hookSpecificOutput.insertPrompt = response.insertPrompt;
  }

  return hookOutput;
}
