/**
 * GetRunState Use Case
 * Run の現在状態を取得するビジネスロジック
 */

import type { RunId, RunState } from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";

/**
 * GetRunState Use Case を実行
 */
export async function getRunState(
  runId: RunId,
  processRegistry: ProcessRegistry,
  runStore: RunStore
): Promise<RunState> {
  const metadata = await runStore.loadMetadata(runId);
  if (!metadata) {
    throw new StateEngineError(`Run '${runId}' not found`, "RUN_NOT_FOUND");
  }

  const process = processRegistry.get(metadata.process_id);
  if (!process) {
    throw new StateEngineError(
      `Process '${metadata.process_id}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  const latestEntry = await runStore.getLatestEntry(runId);
  if (!latestEntry) {
    throw new StateEngineError(
      `No entries found for run '${runId}'`,
      "RUN_NOT_FOUND"
    );
  }

  return {
    run_id: runId,
    process_id: metadata.process_id,
    current_state: latestEntry.state,
    revision: latestEntry.revision,
    context: metadata.context ?? {},
    created_at: metadata.created_at,
    updated_at: latestEntry.timestamp,
  };
}
