/**
 * GetEventHistory Use Case
 * Run のイベント履歴を取得するビジネスロジック
 */

import type { RunId, ParsedRunEntry } from "../../types/index.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";

/**
 * GetEventHistory Use Case を実行
 */
export async function getEventHistory(
  runId: RunId,
  runStore: RunStore
): Promise<ParsedRunEntry[]> {
  if (!(await runStore.exists(runId))) {
    throw new StateEngineError(`Run '${runId}' not found`, "RUN_NOT_FOUND");
  }
  return runStore.readEntries(runId);
}
