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

  // 該当する遷移を検索（複数遷移のフォールバックをサポート）
  const currentState = latestEntry.state;
  const matchingTransitions = process.transitions.filter(
    (t) => t.from === currentState && t.event === params.eventName
  );

  if (matchingTransitions.length === 0) {
    throw new StateEngineError(
      `No transition defined for event '${params.eventName}' from state '${currentState}'`,
      "INVALID_EVENT"
    );
  }

  // ガード評価用コンテキストを準備
  const currentArtifactPaths = latestEntry.artifact_paths ?? [];
  const newArtifactPaths = mergeArtifactPaths(
    currentArtifactPaths,
    params.artifactPaths ?? []
  );

  const guardContext: GuardEvaluationContext = {
    artifactPaths: newArtifactPaths,
    context: metadata.context,
    ...(metadata.artifact_base_path !== undefined && {
      artifactBasePath: metadata.artifact_base_path,
    }),
  };

  // 遷移選択ルール:
  // 1. ガード付き遷移を先に評価
  // 2. ガードが満たされた最初の遷移を選択
  // 3. すべてのガード付き遷移が失敗した場合、ガードなし遷移を選択
  const guardedTransitions = matchingTransitions.filter((t) => t.guard !== undefined);
  const guardlessTransitions = matchingTransitions.filter((t) => t.guard === undefined);

  let selectedTransition: typeof matchingTransitions[0] | undefined;
  let lastGuardFailure: { guardName: string; missingRequirements?: string[] } | undefined;

  // ガード付き遷移を評価
  for (const transition of guardedTransitions) {
    // 遷移権限チェック
    const transitionPermission = checkTransitionPermission(transition, params.role);
    if (!transitionPermission.allowed) {
      continue; // 権限がない遷移はスキップ
    }

    const guardResult = await evaluateTransitionGuard(
      process.guards,
      transition.guard,
      guardContext
    );

    if (guardResult.satisfied) {
      selectedTransition = transition;
      break;
    } else {
      // 最後のガード失敗を記録（エラーメッセージ用）
      const failure: { guardName: string; missingRequirements?: string[] } = {
        guardName: transition.guard!,
      };
      if (guardResult.missing_requirements !== undefined) {
        failure.missingRequirements = guardResult.missing_requirements;
      }
      lastGuardFailure = failure;
    }
  }

  // ガード付き遷移が見つからない場合、ガードなし遷移を試す
  if (!selectedTransition && guardlessTransitions.length > 0) {
    for (const transition of guardlessTransitions) {
      const transitionPermission = checkTransitionPermission(transition, params.role);
      if (transitionPermission.allowed) {
        selectedTransition = transition;
        break;
      }
    }
  }

  // 遷移が見つからない場合
  if (!selectedTransition) {
    // ガード失敗が原因の場合
    if (lastGuardFailure) {
      const errorDetails: import("../state-engine.js").StateEngineErrorDetails = {
        guardName: lastGuardFailure.guardName,
      };
      if (lastGuardFailure.missingRequirements !== undefined) {
        errorDetails.missingRequirements = lastGuardFailure.missingRequirements;
      }
      throw new StateEngineError(
        `Guard '${lastGuardFailure.guardName}' not satisfied: ${lastGuardFailure.missingRequirements?.join(", ")}`,
        "GUARD_FAILED",
        errorDetails
      );
    }
    // 権限がない場合
    throw new StateEngineError(
      "Permission denied for all available transitions",
      "FORBIDDEN"
    );
  }

  const transition = selectedTransition;

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
