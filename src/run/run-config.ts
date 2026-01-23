/**
 * Run config helpers
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunId } from "../types/index.js";
import { isValidRunId } from "./validate-run-id.js";

export const DEFAULT_RUN_CONFIG_PATH = ".state_gate/state-gate.json";

export interface RunConfig {
  run_id: RunId;
  role?: string;
}

export class RunConfigError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "RunConfigError";
  }
}

export function resolveRunConfigPath(configPath?: string): string {
  return configPath ?? DEFAULT_RUN_CONFIG_PATH;
}

export async function loadRunConfig(
  configPath?: string
): Promise<RunConfig | null> {
  const resolvedPath = resolveRunConfigPath(configPath);
  let content: string;

  try {
    content = await fs.readFile(resolvedPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new RunConfigError(`Failed to read run config: ${resolvedPath}`, error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new RunConfigError(`Invalid run config JSON: ${resolvedPath}`, error);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RunConfigError(`Run config must be a JSON object: ${resolvedPath}`);
  }

  const runIdValue = (parsed as { run_id?: unknown }).run_id;
  if (typeof runIdValue !== "string") {
    throw new RunConfigError(`run_id is required in run config: ${resolvedPath}`);
  }
  if (!isValidRunId(runIdValue)) {
    throw new RunConfigError(`Invalid run_id format in run config: ${runIdValue}`);
  }

  const roleValue = (parsed as { role?: unknown }).role;
  const config: RunConfig = {
    run_id: runIdValue as RunId,
  };
  if (typeof roleValue === "string" && roleValue.length > 0) {
    config.role = roleValue;
  }

  return config;
}

export async function writeRunConfig(
  config: RunConfig,
  configPath?: string
): Promise<void> {
  const resolvedPath = resolveRunConfigPath(configPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

  const payload: Record<string, unknown> = {
    run_id: config.run_id,
  };
  if (config.role !== undefined) {
    payload.role = config.role;
  }

  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(resolvedPath, content, "utf-8");
}
