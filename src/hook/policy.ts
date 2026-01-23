/**
 * Hook policy loader and evaluator
 */

import * as fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { HookDecision } from "../types/index.js";

export interface HookPolicy {
  policies?: {
    state_tool_permissions?: Record<string, StateToolPermissions>;
    tool_restrictions?: Record<string, ToolRestriction>;
  };
  error_handling?: {
    mode?: "fail-open" | "fail-close";
    strict_tools?: string[];
  };
  connection_error?: {
    default_decision?: HookDecision;
    cache_ttl_seconds?: number;
    retry_count?: number;
    retry_delay_ms?: number;
  };
}

export interface StateToolPermissions {
  allowed?: string[];
  denied?: string[];
  ask?: string[];
}

export interface ToolRestriction {
  deny_patterns?: string[];
  allow_patterns?: string[];
}

export interface HookPolicyDecision {
  decision: HookDecision;
  reason?: string;
  question?: string;
}

const DEFAULT_POLICY_PATH = ".claude/hook-policy.yaml";

export async function loadHookPolicy(
  policyPath?: string
): Promise<HookPolicy | null> {
  const resolvedPath =
    policyPath ?? process.env.STATE_GATE_POLICY_PATH ?? DEFAULT_POLICY_PATH;

  try {
    await fs.access(resolvedPath);
  } catch {
    return null;
  }

  const content = await fs.readFile(resolvedPath, "utf-8");
  const parsed = parseYaml(content) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid hook policy format");
  }

  return parsed as HookPolicy;
}

export interface HookPolicyEvaluationInput {
  toolName: string;
  toolInputText: string;
  currentState?: string;
}

export function evaluateHookPolicy(
  policy: HookPolicy | null,
  input: HookPolicyEvaluationInput
): HookPolicyDecision | null {
  if (!policy) return null;

  const stateDecision = evaluateStateToolPermissions(
    policy,
    input.toolName,
    input.currentState
  );
  const restrictionDecision = evaluateToolRestrictions(
    policy,
    input.toolName,
    input.toolInputText
  );

  if (stateDecision?.decision === "deny") {
    return stateDecision;
  }
  if (restrictionDecision?.decision === "deny") {
    return restrictionDecision;
  }
  if (restrictionDecision?.decision === "ask") {
    return restrictionDecision;
  }
  if (stateDecision?.decision === "ask") {
    return stateDecision;
  }
  if (stateDecision?.decision === "allow") {
    return stateDecision;
  }
  if (restrictionDecision?.decision === "allow") {
    return restrictionDecision;
  }

  return null;
}

function evaluateStateToolPermissions(
  policy: HookPolicy,
  toolName: string,
  currentState: string | undefined
): HookPolicyDecision | null {
  if (!currentState) return null;
  const permissions = policy.policies?.state_tool_permissions?.[currentState];
  if (!permissions) return null;

  if (permissions.denied?.includes(toolName)) {
    return {
      decision: "deny",
      reason: `Tool '${toolName}' is denied in state '${currentState}'`,
    };
  }

  if (permissions.ask?.includes(toolName)) {
    return {
      decision: "ask",
      question: `Tool '${toolName}' requires confirmation in state '${currentState}'`,
    };
  }

  if (permissions.allowed?.includes(toolName)) {
    return {
      decision: "allow",
    };
  }

  return null;
}

function evaluateToolRestrictions(
  policy: HookPolicy,
  toolName: string,
  toolInputText: string
): HookPolicyDecision | null {
  const restriction = policy.policies?.tool_restrictions?.[toolName];
  if (!restriction) return null;

  const denyMatch = matchFirstPattern(restriction.deny_patterns, toolInputText);
  if (denyMatch) {
    return {
      decision: "deny",
      reason: `Tool '${toolName}' command matched deny pattern: ${denyMatch}`,
    };
  }

  const allowPatterns = restriction.allow_patterns ?? [];
  if (allowPatterns.length > 0) {
    const allowMatch = matchFirstPattern(allowPatterns, toolInputText);
    if (allowMatch) {
      return { decision: "allow" };
    }
    return {
      decision: "ask",
      question: `Tool '${toolName}' command is not in allow list`,
    };
  }

  return null;
}

function matchFirstPattern(
  patterns: string[] | undefined,
  input: string
): string | undefined {
  if (!patterns || patterns.length === 0) return undefined;
  for (const pattern of patterns) {
    if (pattern.length === 0) continue;
    if (matchesPattern(pattern, input)) {
      return pattern;
    }
  }
  return undefined;
}

function matchesPattern(pattern: string, input: string): boolean {
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    const body = pattern.slice(1, -1);
    try {
      const regex = new RegExp(body);
      return regex.test(input);
    } catch {
      // Fall through to substring match
    }
  }
  return input.includes(pattern);
}
