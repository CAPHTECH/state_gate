/**
 * Hook Adapter - PreToolUse handler
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HookContext, PreToolUseInput, PreToolUseOutput, PostToolUseInput, PostToolUseOutput, Process, RunId } from "../types/index.js";
import { StateEngine } from "../engine/state-engine.js";
import { handleGetState } from "../engine/handlers/get-state.js";
import { MetadataStore } from "../run/metadata-store.js";
import { isValidRunId } from "../run/validate-run-id.js";
import { parseProcessFile } from "../process/parser.js";
import { validateProcess } from "../process/validator.js";
import {
  evaluateHookPolicy,
  loadHookPolicy,
  type HookPolicy,
} from "./policy.js";

export interface HookAdapterOptions {
  processDir: string;
  runsDir: string;
  metadataDir: string;
  role: string;
  policyPath?: string;
}

export async function handlePreToolUse(
  input: PreToolUseInput,
  options: HookAdapterOptions
): Promise<PreToolUseOutput> {
  const toolName = input.tool_name?.trim() || "unknown";
  let policy: HookPolicy | null = null;

  try {
    policy = await loadHookPolicy(options.policyPath);
  } catch (error) {
    return buildErrorDecision(policy, toolName, error);
  }

  if (!input.run_id) {
    return { decision: "allow" };
  }

  if (!isValidRunId(input.run_id)) {
    return {
      decision: "deny",
      reason: `Invalid run_id format: ${input.run_id}`,
    };
  }

  try {
    const runId = input.run_id as RunId;
    const context = await loadHookContext(runId, options);

    // 1. プロセス定義から tool_permissions を取得
    const currentState = context.processDefinition.states.find(
      (s) => s.name === context.current_state
    );
    const toolPermissions = currentState?.tool_permissions;

    // 2. tool_permissions が定義されている場合はそれを使用
    if (toolPermissions) {
      const decision = evaluateToolPermissions(toolName, toolPermissions);
      const hookContext: HookContext = {
        current_state: context.current_state,
      };
      if (context.missing_requirements) {
        hookContext.missing_requirements = context.missing_requirements;
      }
      if (decision.decision !== "allow") {
        return {
          ...decision,
          context: hookContext,
        };
      }
      return {
        decision: "allow",
        context: hookContext,
      };
    }

    // 3. tool_permissions がない場合は hook-policy.yaml にフォールバック
    const hookContext: HookContext = {
      current_state: context.current_state,
    };
    if (context.missing_requirements) {
      hookContext.missing_requirements = context.missing_requirements;
    }

    const toolInputText = formatToolInputText(input.tool_input ?? {});
    const policyDecision = evaluateHookPolicy(policy, {
      toolName,
      toolInputText,
      currentState: context.current_state,
    });

    if (policyDecision) {
      if (policyDecision.decision === "deny") {
        return {
          decision: "deny",
          reason: policyDecision.reason ?? "Denied by policy",
          context: hookContext,
        };
      }
      if (policyDecision.decision === "ask") {
        return {
          decision: "ask",
          question: policyDecision.question ?? "Confirmation required",
          context: hookContext,
        };
      }
      return {
        decision: "allow",
        context: hookContext,
      };
    }

    return {
      decision: "allow",
      context: hookContext,
    };
  } catch (error) {
    return buildErrorDecision(policy, toolName, error);
  }
}

/**
 * プロセス定義の tool_permissions からツール実行の可否を判定
 */
function evaluateToolPermissions(
  toolName: string,
  permissions: import("../types/index.js").ToolPermissions
): PreToolUseOutput {
  // denied が最優先
  if (permissions.denied && permissions.denied.includes(toolName)) {
    return {
      decision: "deny",
      reason: `Tool '${toolName}' is denied in this state`,
    };
  }

  // ask が次
  if (permissions.ask && permissions.ask.includes(toolName)) {
    return {
      decision: "ask",
      question: `Tool '${toolName}' requires confirmation in this state. Proceed?`,
    };
  }

  // allowed があればチェック
  if (permissions.allowed && permissions.allowed.length > 0) {
    if (permissions.allowed.includes(toolName)) {
      return { decision: "allow" };
    }
    // allowed リストにないツールは拒否
    return {
      decision: "deny",
      reason: `Tool '${toolName}' is not in the allowed list for this state`,
    };
  }

  // allowed リストが空または undefined の場合はデフォルトで許可
  return { decision: "allow" };
}

interface ExtendedHookContext extends HookContext {
  processDefinition: Process;
}

async function loadHookContext(
  runId: RunId,
  options: HookAdapterOptions
): Promise<ExtendedHookContext> {
  const metadataStore = new MetadataStore({ baseDir: options.metadataDir });
  const metadata = await metadataStore.load(runId);
  if (!metadata) {
    throw new Error(`Run '${runId}' not found`);
  }

  const processDefinition = await loadProcess(options.processDir, metadata.process_id);
  const engine = new StateEngine({
    runsDir: options.runsDir,
    metadataDir: options.metadataDir,
  });
  engine.registerProcess(processDefinition);

  const state = await handleGetState(engine, { run_id: runId }, options.role);
  const missingRequirements = state.missing_guards
    .map((guard) => guard.current_status)
    .filter((status) => status.length > 0);

  const context: ExtendedHookContext = {
    current_state: state.current_state,
    processDefinition,
  };
  if (missingRequirements.length > 0) {
    context.missing_requirements = missingRequirements;
  }

  return context;
}

async function loadProcess(processDir: string, processId: string): Promise<Process> {
  if (processId.includes("..") || processId.includes("/") || processId.includes("\\")) {
    throw new Error("Invalid process_id");
  }

  const filePath = await resolveProcessFile(processDir, processId);
  const process = await parseProcessFile(filePath);
  const validation = validateProcess(process);
  if (!validation.valid) {
    throw new Error(`Invalid process definition: ${processId}`);
  }
  return process;
}

async function resolveProcessFile(
  processDir: string,
  processId: string
): Promise<string> {
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
    throw new Error(`Process file not found for '${processId}'`);
  }
}

function formatToolInputText(toolInput: Record<string, unknown>): string {
  const commandValue = toolInput.command;
  if (typeof commandValue === "string") {
    return commandValue;
  }
  try {
    return JSON.stringify(toolInput);
  } catch {
    return String(toolInput);
  }
}

function buildErrorDecision(
  policy: HookPolicy | null,
  toolName: string,
  error: unknown
): PreToolUseOutput {
  const decision = resolveErrorDecision(policy, toolName);
  if (decision === "deny") {
    const message = error instanceof Error ? error.message : "Hook adapter error";
    return {
      decision: "deny",
      reason: message,
    };
  }
  return { decision: "allow" };
}

function resolveErrorDecision(
  policy: HookPolicy | null,
  toolName: string
): "allow" | "deny" {
  const defaultDecision = policy?.connection_error?.default_decision;
  if (defaultDecision === "allow" || defaultDecision === "deny") {
    return defaultDecision;
  }

  const mode = policy?.error_handling?.mode ?? "fail-open";
  if (mode === "fail-close") {
    return "deny";
  }

  const strictTools = policy?.error_handling?.strict_tools ?? [];
  if (strictTools.includes(toolName)) {
    return "deny";
  }

  return "allow";
}

/**
 * PostToolUse handler
 * emit_event 実行後に new_state_prompt を検出してプロンプトに挿入
 */
export async function handlePostToolUse(
  input: PostToolUseInput
): Promise<PostToolUseOutput> {
  // mcp__state-gate__state_gate_emit_event の場合のみ処理
  if (input.tool_name !== "mcp__state-gate__state_gate_emit_event") {
    return {};
  }

  // tool_result から new_state_prompt を抽出
  try {
    const result = input.tool_result as { result?: { new_state_prompt?: string } };
    const newStatePrompt = result?.result?.new_state_prompt;

    if (newStatePrompt && typeof newStatePrompt === "string") {
      return {
        insertPrompt: `\n\n---\n**Next State Guidance:**\n${newStatePrompt}\n---\n`,
      };
    }
  } catch {
    // エラーは無視して空のレスポンスを返す
  }

  return {};
}
