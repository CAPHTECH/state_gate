/**
 * Hook Adapter - PreToolUse handler
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HookContext, PreToolUseInput, PreToolUseOutput, Process, RunId } from "../types/index.js";
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
          context,
        };
      }
      if (policyDecision.decision === "ask") {
        return {
          decision: "ask",
          question: policyDecision.question ?? "Confirmation required",
          context,
        };
      }
      return {
        decision: "allow",
        context,
      };
    }

    return {
      decision: "allow",
      context,
    };
  } catch (error) {
    return buildErrorDecision(policy, toolName, error);
  }
}

async function loadHookContext(
  runId: RunId,
  options: HookAdapterOptions
): Promise<HookContext> {
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

  const context: HookContext = {
    current_state: state.current_state,
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
