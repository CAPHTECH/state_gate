/**
 * ListRuns Use Case
 * Run 一覧を取得するビジネスロジック
 */

import type { RunState } from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { getRunState } from "./get-run-state.js";

/**
 * ListRuns Use Case を実行
 */
export async function listRuns(
  processRegistry: ProcessRegistry,
  runStore: RunStore
): Promise<RunState[]> {
  const runIds = await runStore.listRunIds();
  const runs: RunState[] = [];

  for (const runId of runIds) {
    try {
      const state = await getRunState(runId, processRegistry, runStore);
      runs.push(state);
    } catch {
      // エラーが発生した Run はスキップ
    }
  }

  return runs;
}
