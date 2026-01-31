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
  ContextGuard,
  ContextEqualsGuard,
  ContextNotEqualsGuard,
  ContextInGuard,
  ContextNotInGuard,
  ContextExistsGuard,
  ContextNotExistsGuard,
  ContextVariables,
  ContextPrimitiveValue,
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
  /** コンテキスト変数（ContextGuard 評価用） */
  context?: ContextVariables;
  /**
   * Artifact ベースパス
   * 設定されている場合、artifact チェック時にこのパスを基準に解決する
   * 未設定の場合は後方互換のため従来方式（プロジェクトルート相対）
   */
  artifactBasePath?: string;
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
  // type で分岐
  if (guard.type === "artifact") {
    switch (guard.condition) {
      case "exists":
        return evaluateExistsGuard(guardName, guard, context);
      case "count":
        return evaluateCountGuard(guardName, guard, context);
    }
  } else if (guard.type === "context") {
    return evaluateContextGuard(guardName, guard, context);
  }

  // 未知のタイプ
  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [`Unknown guard type`],
  };
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

  const exists = await hasAnyArtifact(relevantPaths, context.artifactBasePath);

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

  const count = await countPresentArtifacts(relevantPaths, context.artifactBasePath);

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

// =============================================================================
// ContextGuard 評価
// =============================================================================

/**
 * ContextGuard を評価
 */
function evaluateContextGuard(
  guardName: string,
  guard: ContextGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  switch (guard.condition) {
    case "equals":
      return evaluateContextEqualsGuard(guardName, guard, evalContext);
    case "not_equals":
      return evaluateContextNotEqualsGuard(guardName, guard, evalContext);
    case "in":
      return evaluateContextInGuard(guardName, guard, evalContext);
    case "not_in":
      return evaluateContextNotInGuard(guardName, guard, evalContext);
    case "exists":
      return evaluateContextExistsGuard(guardName, guard, evalContext);
    case "not_exists":
      return evaluateContextNotExistsGuard(guardName, guard, evalContext);
  }
}

/**
 * コンテキスト変数の値を取得
 * @law L3: 存在しないコンテキスト変数への参照は undefined を返す
 */
function getContextValue(
  evalContext: GuardEvaluationContext,
  variable: string
): unknown {
  if (!evalContext.context) {
    return undefined;
  }
  return evalContext.context[variable];
}

/**
 * コンテキスト変数が存在するかチェック
 */
function hasContextVariable(
  evalContext: GuardEvaluationContext,
  variable: string
): boolean {
  if (!evalContext.context) {
    return false;
  }
  return variable in evalContext.context;
}

/**
 * equals 条件を評価
 */
function evaluateContextEqualsGuard(
  guardName: string,
  guard: ContextEqualsGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  const value = getContextValue(evalContext, guard.variable);

  // L3: 未定義変数は false
  if (value === undefined) {
    return {
      satisfied: false,
      guard_name: guardName,
      missing_requirements: [
        `Context variable '${guard.variable}' is not defined`,
      ],
    };
  }

  if (value === guard.value) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' is '${String(value)}', expected '${String(guard.value)}'`,
    ],
  };
}

/**
 * not_equals 条件を評価
 */
function evaluateContextNotEqualsGuard(
  guardName: string,
  guard: ContextNotEqualsGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  const value = getContextValue(evalContext, guard.variable);

  // L3: 未定義変数は false
  if (value === undefined) {
    return {
      satisfied: false,
      guard_name: guardName,
      missing_requirements: [
        `Context variable '${guard.variable}' is not defined`,
      ],
    };
  }

  if (value !== guard.value) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' is '${String(value)}', expected not '${String(guard.value)}'`,
    ],
  };
}

/**
 * in 条件を評価
 */
function evaluateContextInGuard(
  guardName: string,
  guard: ContextInGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  const value = getContextValue(evalContext, guard.variable);

  // L3: 未定義変数は false
  if (value === undefined) {
    return {
      satisfied: false,
      guard_name: guardName,
      missing_requirements: [
        `Context variable '${guard.variable}' is not defined`,
      ],
    };
  }

  // primitive 値としてチェック
  if (guard.value.includes(value as ContextPrimitiveValue)) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' is '${String(value)}', expected one of [${guard.value.map(String).join(", ")}]`,
    ],
  };
}

/**
 * not_in 条件を評価
 */
function evaluateContextNotInGuard(
  guardName: string,
  guard: ContextNotInGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  const value = getContextValue(evalContext, guard.variable);

  // L3: 未定義変数は false
  if (value === undefined) {
    return {
      satisfied: false,
      guard_name: guardName,
      missing_requirements: [
        `Context variable '${guard.variable}' is not defined`,
      ],
    };
  }

  // primitive 値としてチェック
  if (!guard.value.includes(value as ContextPrimitiveValue)) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' is '${String(value)}', expected not in [${guard.value.map(String).join(", ")}]`,
    ],
  };
}

/**
 * exists 条件を評価
 */
function evaluateContextExistsGuard(
  guardName: string,
  guard: ContextExistsGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  if (hasContextVariable(evalContext, guard.variable)) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' does not exist`,
    ],
  };
}

/**
 * not_exists 条件を評価
 */
function evaluateContextNotExistsGuard(
  guardName: string,
  guard: ContextNotExistsGuard,
  evalContext: GuardEvaluationContext
): GuardEvaluationResult {
  if (!hasContextVariable(evalContext, guard.variable)) {
    return {
      satisfied: true,
      guard_name: guardName,
    };
  }

  return {
    satisfied: false,
    guard_name: guardName,
    missing_requirements: [
      `Context variable '${guard.variable}' exists but should not`,
    ],
  };
}
