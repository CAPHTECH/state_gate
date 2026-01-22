/**
 * Guard 評価器
 * ガード条件の評価を行う
 * @see src/types/process.ts
 * @see src/types/guard.ts
 */

import type {
  Guard,
  ArtifactExistsGuard,
  ArtifactCountGuard,
  GuardEvaluationResult,
  GuardsEvaluationResult,
} from "../types/index.js";
import {
  hasAnyArtifact,
  countPresentArtifacts,
  filterPathsByArtifactType,
} from "../artifact/checker.js";

/**
 * ガード評価コンテキスト
 */
export interface GuardEvaluationContext {
  /** 現在の成果物パス一覧 */
  artifactPaths: string[];
}

/**
 * 単一ガードを評価
 * @param guardName - ガード名
 * @param guard - ガード定義
 * @param context - 評価コンテキスト
 * @returns 評価結果
 */
export async function evaluateGuard(
  guardName: string,
  guard: Guard,
  context: GuardEvaluationContext
): Promise<GuardEvaluationResult> {
  switch (guard.condition) {
    case "exists":
      return evaluateExistsGuard(guardName, guard, context);
    case "count":
      return evaluateCountGuard(guardName, guard, context);
    default:
      // 未知の条件タイプ
      return {
        satisfied: false,
        guard_name: guardName,
        missing_requirements: [`Unknown guard condition type`],
      };
  }
}

/**
 * 存在ガードを評価
 */
async function evaluateExistsGuard(
  guardName: string,
  guard: ArtifactExistsGuard,
  context: GuardEvaluationContext
): Promise<GuardEvaluationResult> {
  const relevantPaths = filterPathsByArtifactType(
    context.artifactPaths,
    guard.artifact_type
  );

  const exists = await hasAnyArtifact(relevantPaths);

  if (exists) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Artifact '${guard.artifact_type}' does not exist`,
    ],
  };
}

/**
 * カウントガードを評価
 */
async function evaluateCountGuard(
  guardName: string,
  guard: ArtifactCountGuard,
  context: GuardEvaluationContext
): Promise<GuardEvaluationResult> {
  const relevantPaths = filterPathsByArtifactType(
    context.artifactPaths,
    guard.artifact_type
  );

  const count = await countPresentArtifacts(relevantPaths);

  if (count >= guard.min_count) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Artifact '${guard.artifact_type}' count is ${count}, required ${guard.min_count}`,
    ],
  };
}

/**
 * 複数ガードを評価
 * @param guards - ガード定義のマップ
 * @param guardNames - 評価するガード名の配列
 * @param context - 評価コンテキスト
 * @returns 全ガードの評価結果
 */
export async function evaluateGuards(
  guards: Record<string, Guard>,
  guardNames: string[],
  context: GuardEvaluationContext
): Promise<GuardsEvaluationResult> {
  const results: GuardEvaluationResult[] = [];

  for (const name of guardNames) {
    const guard = guards[name];
    if (!guard) {
      results.push({
        satisfied: false,
        guard_name: name,
        missing_requirements: [`Guard '${name}' is not defined`],
      });
      continue;
    }

    const result = await evaluateGuard(name, guard, context);
    results.push(result);
  }

  return {
    all_satisfied: results.every((r) => r.satisfied),
    results,
  };
}

/**
 * 遷移に対するガードを評価
 * @param guards - ガード定義のマップ
 * @param guardName - 評価するガード名（オプション）
 * @param context - 評価コンテキスト
 * @returns 評価結果（ガードがなければ satisfied: true）
 */
export async function evaluateTransitionGuard(
  guards: Record<string, Guard>,
  guardName: string | undefined,
  context: GuardEvaluationContext
): Promise<GuardEvaluationResult> {
  if (!guardName) {
    return {
      satisfied: true,
      guard_name: "",
    };
  }

  const guard = guards[guardName];
  if (!guard) {
    return {
      satisfied: false,
      guard_name: guardName,
      missing_requirements: [`Guard '${guardName}' is not defined`],
    };
  }

  return evaluateGuard(guardName, guard, context);
}
