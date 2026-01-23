/**
 * CreateRun Use Case
 * 新しい Run を作成するビジネスロジック
 */

import { v7 as uuidv7 } from "uuid";
import type {
  RunId,
  RunState,
  RunEntry,
  RunMetadata,
  ContextVariables,
} from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";

/**
 * CreateRun パラメータ
 */
export interface CreateRunParams {
  processId: string;
  context?: ContextVariables;
}

/**
 * CreateRun Use Case を実行
 */
export async function createRun(
  params: CreateRunParams,
  processRegistry: ProcessRegistry,
  runStore: RunStore
): Promise<RunState> {
  const process = processRegistry.get(params.processId);
  if (!process) {
    throw new StateEngineError(
      `Process '${params.processId}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  const runId = `run-${uuidv7()}` as RunId;
  const now = new Date().toISOString();

  // 初期エントリ
  const initialEntry: RunEntry = {
    timestamp: now,
    state: process.initial_state,
    revision: 1,
    event: "__init__",
    idempotency_key: `__init__:${runId}`,
    artifact_paths: "",
  };

  // 初期 context を計算
  const context: ContextVariables = {
    ...process.initial_context,
    ...params.context,
  };

  // メタデータ
  const metadata: RunMetadata = {
    run_id: runId,
    process_id: params.processId,
    created_at: now,
    context,
  };

  // 保存
  await runStore.createRun(runId, initialEntry, metadata);

  return {
    run_id: runId,
    process_id: params.processId,
    current_state: process.initial_state,
    revision: 1,
    context,
    created_at: now,
    updated_at: now,
  };
}
