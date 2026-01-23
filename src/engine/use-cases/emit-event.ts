/**
 * EmitEvent Use Case
 * イベント発行のビジネスロジック
 */

import { v7 as uuidv7 } from "uuid";
import type { RunId, RunEntry, ValidationError } from "../../types/index.js";
import type { ProcessRegistry } from "../services/process-registry.js";
import type { RunStore } from "../services/run-store.js";
import { StateEngineError } from "../state-engine.js";
import { evaluateTransitionGuard, type GuardEvaluationContext } from "../../guard/evaluator.js";
import { checkEventPermission, checkTransitionPermission } from "../../auth/role-checker.js";
import { validateArtifactPath } from "../../artifact/checker.js";

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
  /** 冪等性キーによるリプレイ時に true */
  replayed?: true;
  /** リプレイ時の追加情報 */
  replayInfo?: {
    /** 元のエントリが記録された時刻 */
    originalTimestamp: string;
    /** 元のエントリの状態 */
    state: string;
  };
  /** 新しい state の prompt（利用可能な場合） */
  newStatePrompt?: string;
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
      replayInfo: {
        originalTimestamp: existingEntry.timestamp,
        state: existingEntry.state,
      },
    };
  }

  const artifactValidationErrors = collectArtifactPathErrors(params.artifactPaths);
  if (artifactValidationErrors.length > 0) {
    throw new StateEngineError(
      "artifact_paths contains invalid entries",
      "INVALID_PAYLOAD",
      { validationErrors: artifactValidationErrors }
    );
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

  // ガード評価（最新行の成果物リストに新規を追加）
  const currentArtifactPaths = latestEntry.artifact_paths ?? [];
  const newArtifactPaths = mergeArtifactPaths(
    currentArtifactPaths,
    params.artifactPaths ?? []
  );

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
    artifact_paths: newArtifactPaths.join(";"),
  };

  // payload を context にマージ（metadata を更新）
  if (params.payload && Object.keys(params.payload).length > 0) {
    const updatedContext = {
      ...metadata.context,
      ...params.payload,
    };
    const updatedMetadata: typeof metadata = {
      ...metadata,
      context: updatedContext,
    };
    await runStore.saveMetadata(updatedMetadata);
  }

  // アトミックに revision 検証 + 保存（TOCTOU 競合防止）
  const appendResult = await runStore.appendEntryWithRevisionCheck(
    params.runId,
    newEntry,
    params.expectedRevision
  );

  if (appendResult.conflict) {
    throw new StateEngineError(
      `Revision conflict: expected ${params.expectedRevision}, current ${appendResult.currentRevision}`,
      "REVISION_CONFLICT",
      {
        currentRevision: appendResult.currentRevision,
        expectedRevision: params.expectedRevision,
      }
    );
  }

  // 遷移が発生した場合、新しい state から prompt を抽出
  let newStatePrompt: string | undefined;
  const newStateDefinition = process.states.find(s => s.name === transition.to);
  if (newStateDefinition?.prompt !== undefined) {
    newStatePrompt = newStateDefinition.prompt;
  }

  return {
    eventId: uuidv7(),
    accepted: true,
    transition: {
      fromState: currentState,
      toState: transition.to,
    },
    newRevision: newEntry.revision,
    ...(newStatePrompt !== undefined && { newStatePrompt }),
  };
}

function mergeArtifactPaths(existing: string[], added: string[]): string[] {
  if (existing.length === 0) {
    return added.length > 0 ? [...added] : [];
  }

  if (added.length === 0) {
    return [...existing];
  }

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const entry of [...existing, ...added]) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    merged.push(entry);
  }

  return merged;
}

function collectArtifactPathErrors(paths?: string[]): ValidationError[] {
  if (!paths || paths.length === 0) {
    return [];
  }

  const errors: ValidationError[] = [];
  paths.forEach((pathValue, index) => {
    if (typeof pathValue !== "string") {
      errors.push({
        path: `/artifact_paths/${index}`,
        message: "Artifact path must be a string",
      });
      return;
    }

    try {
      validateArtifactPath(pathValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid artifact path";
      errors.push({ path: `/artifact_paths/${index}`, message });
    }
  });

  return errors;
}
