/**
 * EmitEvent Use Case
 * イベント発行のビジネスロジック
 */

import { v7 as uuidv7 } from "uuid";
import type { RunId, RunEntry } from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";
import { evaluateTransitionGuard, type GuardEvaluationContext } from "../../guard/evaluator.js";
import { checkEventPermission, checkTransitionPermission } from "../../auth/role-checker.js";

/**
 * EmitEvent パラメータ
 */
export interface EmitEventParams {
  runId: RunId;
  eventName: string;
  expectedRevision: number;
  idempotencyKey: string;
  role: string;
  payload?: Record<string, unknown> | undefined;
  artifactPaths?: string[] | undefined;
}

/**
 * EmitEvent 結果
 */
export interface EmitEventResult {
  eventId: string;
  accepted: true;
  transition?: {
    fromState: string;
    toState: string;
  };
  newRevision: number;
  replayed?: true;
}

/**
 * EmitEvent Use Case を実行
 */
export async function emitEvent(
  params: EmitEventParams,
  processRegistry: ProcessRegistry,
  runStore: RunStore
): Promise<EmitEventResult> {
  // メタデータ取得
  const metadata = await runStore.loadMetadata(params.runId);
  if (!metadata) {
    throw new StateEngineError(
      `Run '${params.runId}' not found`,
      "RUN_NOT_FOUND"
    );
  }

  // プロセス取得
  const process = processRegistry.get(metadata.process_id);
  if (!process) {
    throw new StateEngineError(
      `Process '${metadata.process_id}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  // 冪等性チェック
  const existingEntry = await runStore.getEntryByIdempotencyKey(
    params.runId,
    params.idempotencyKey
  );
  if (existingEntry) {
    return {
      eventId: `replay-${params.idempotencyKey}`,
      accepted: true,
      newRevision: existingEntry.revision,
      replayed: true,
    };
  }

  // 現在状態取得
  const latestEntry = await runStore.getLatestEntry(params.runId);
  if (!latestEntry) {
    throw new StateEngineError(
      `No entries found for run '${params.runId}'`,
      "RUN_NOT_FOUND"
    );
  }

  // 楽観ロックチェック
  if (latestEntry.revision !== params.expectedRevision) {
    throw new StateEngineError(
      `Revision conflict: expected ${params.expectedRevision}, current ${latestEntry.revision}`,
      "REVISION_CONFLICT",
      {
        currentRevision: latestEntry.revision,
        expectedRevision: params.expectedRevision,
      }
    );
  }

  // イベント定義取得
  const event = process.events.find((e) => e.name === params.eventName);
  if (!event) {
    throw new StateEngineError(
      `Event '${params.eventName}' not found`,
      "INVALID_EVENT"
    );
  }

  // イベント発行権限チェック
  const eventPermission = checkEventPermission(event, params.role);
  if (!eventPermission.allowed) {
    throw new StateEngineError(
      eventPermission.reason ?? "Permission denied",
      "FORBIDDEN"
    );
  }

  // 該当する遷移を検索
  const currentState = latestEntry.state;
  const transition = process.transitions.find(
    (t) => t.from === currentState && t.event === params.eventName
  );

  if (!transition) {
    throw new StateEngineError(
      `No transition defined for event '${params.eventName}' from state '${currentState}'`,
      "INVALID_EVENT"
    );
  }

  // 遷移権限チェック
  const transitionPermission = checkTransitionPermission(transition, params.role);
  if (!transitionPermission.allowed) {
    throw new StateEngineError(
      transitionPermission.reason ?? "Permission denied",
      "FORBIDDEN"
    );
  }

  // ガード評価
  const allEntries = await runStore.readEntries(params.runId);
  const currentArtifactPaths = runStore.collectArtifactPaths(allEntries);
  const newArtifactPaths = [...currentArtifactPaths, ...(params.artifactPaths ?? [])];

  const guardContext: GuardEvaluationContext = {
    artifactPaths: newArtifactPaths,
  };

  const guardResult = await evaluateTransitionGuard(
    process.guards,
    transition.guard,
    guardContext
  );

  if (!guardResult.satisfied) {
    const errorDetails: import("../state-engine.js").StateEngineErrorDetails = {};
    if (transition.guard !== undefined) {
      errorDetails.guardName = transition.guard;
    }
    if (guardResult.missing_requirements !== undefined) {
      errorDetails.missingRequirements = guardResult.missing_requirements;
    }
    throw new StateEngineError(
      `Guard '${transition.guard}' not satisfied: ${guardResult.missing_requirements?.join(", ")}`,
      "GUARD_FAILED",
      errorDetails
    );
  }

  // 新しいエントリを作成
  const now = new Date().toISOString();
  const newEntry: RunEntry = {
    timestamp: now,
    state: transition.to,
    revision: latestEntry.revision + 1,
    event: params.eventName,
    idempotency_key: params.idempotencyKey,
    artifact_paths: (params.artifactPaths ?? []).join(";"),
  };

  // 保存
  await runStore.appendEntry(params.runId, newEntry);

  return {
    eventId: uuidv7(),
    accepted: true,
    transition: {
      fromState: currentState,
      toState: transition.to,
    },
    newRevision: newEntry.revision,
  };
}
