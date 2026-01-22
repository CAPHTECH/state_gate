/**
 * GetAvailableEvents Use Case
 * 現在状態から発行可能なイベントを取得するビジネスロジック
 */

import type {
  RunId,
  AvailableEventInfo,
  TransitionGuardInfo,
} from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";
import { evaluateTransitionGuard, type GuardEvaluationContext } from "../../guard/evaluator.js";
import { checkEventPermission, checkTransitionPermission } from "../../auth/role-checker.js";
import { getRunState } from "./get-run-state.js";

/**
 * GetAvailableEvents Use Case を実行
 */
export async function getAvailableEvents(
  runId: RunId,
  role: string,
  processRegistry: ProcessRegistry,
  runStore: RunStore
): Promise<{ events: AvailableEventInfo[] }> {
  const state = await getRunState(runId, processRegistry, runStore);
  const process = processRegistry.get(state.process_id);
  if (!process) {
    throw new StateEngineError(
      `Process '${state.process_id}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  // 全エントリから成果物パスを収集
  const entries = await runStore.readEntries(runId);
  const artifactPaths = runStore.collectArtifactPaths(entries);

  const guardContext: GuardEvaluationContext = { artifactPaths };

  // 現在状態からの遷移を持つイベントをグループ化
  const eventTransitions = new Map<string, TransitionGuardInfo[]>();

  for (const transition of process.transitions) {
    if (transition.from !== state.current_state) continue;

    const event = process.events.find((e) => e.name === transition.event);
    if (!event) continue;

    // イベント発行権限チェック
    const eventPermission = checkEventPermission(event, role);
    if (!eventPermission.allowed) continue;

    // 遷移権限チェック
    const transitionPermission = checkTransitionPermission(transition, role);
    if (!transitionPermission.allowed) continue;

    // ガード評価
    const guardResult = await evaluateTransitionGuard(
      process.guards,
      transition.guard,
      guardContext
    );

    const transitionInfo: TransitionGuardInfo = {
      toState: transition.to,
      guardSatisfied: guardResult.satisfied,
    };
    if (transition.guard !== undefined) {
      transitionInfo.guardName = transition.guard;
    }
    if (guardResult.missing_requirements !== undefined) {
      transitionInfo.missingRequirements = guardResult.missing_requirements;
    }

    const existing = eventTransitions.get(transition.event) ?? [];
    existing.push(transitionInfo);
    eventTransitions.set(transition.event, existing);
  }

  // 結果を構築
  const events: AvailableEventInfo[] = [];

  for (const [eventName, transitions] of eventTransitions.entries()) {
    const event = process.events.find((e) => e.name === eventName);
    const eventInfo: AvailableEventInfo = {
      eventName,
      transitions,
    };
    if (event?.description !== undefined) {
      eventInfo.description = event.description;
    }
    events.push(eventInfo);
  }

  return { events };
}
