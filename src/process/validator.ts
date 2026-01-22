/**
 * Process バリデーター
 * Process 定義の参照整合性と Law を検証する
 * @see src/types/process.ts の Law コメント
 */

import type {
  Process,
  ProcessValidationResult,
  ProcessValidationError,
  ProcessValidationErrorCode,
  ArtifactCountGuard,
} from "../types/index.js";

/**
 * Process 定義をバリデーションする
 * @param process - バリデーション対象の Process
 * @returns バリデーション結果
 */
export function validateProcess(process: Process): ProcessValidationResult {
  const errors: ProcessValidationError[] = [];

  // 名前のセットを構築
  const stateNames = new Set(process.states.map((s) => s.name));
  const eventNames = new Set(process.events.map((e) => e.name));
  const roleNames = new Set(process.roles.map((r) => r.name));
  const artifactTypes = new Set(process.artifacts.map((a) => a.type));
  const guardNames = new Set(Object.keys(process.guards));

  // 一意性検証
  validateUniqueness(process, errors);

  // 初期状態の検証
  if (!stateNames.has(process.initial_state)) {
    errors.push(
      createError(
        "INVALID_INITIAL_STATE",
        `Initial state '${process.initial_state}' is not defined in states`,
        "/initial_state"
      )
    );
  }

  // 遷移の検証
  process.transitions.forEach((transition, index) => {
    const basePath = `/transitions/${index}`;

    // from 状態の検証
    if (!stateNames.has(transition.from)) {
      errors.push(
        createError(
          "INVALID_TRANSITION_FROM",
          `Transition from state '${transition.from}' is not defined`,
          `${basePath}/from`
        )
      );
    }

    // to 状態の検証
    if (!stateNames.has(transition.to)) {
      errors.push(
        createError(
          "INVALID_TRANSITION_TO",
          `Transition to state '${transition.to}' is not defined`,
          `${basePath}/to`
        )
      );
    }

    // event の検証
    if (!eventNames.has(transition.event)) {
      errors.push(
        createError(
          "INVALID_TRANSITION_EVENT",
          `Transition event '${transition.event}' is not defined`,
          `${basePath}/event`
        )
      );
    }

    // guard の検証
    if (transition.guard && !guardNames.has(transition.guard)) {
      errors.push(
        createError(
          "INVALID_GUARD_REFERENCE",
          `Guard '${transition.guard}' is not defined`,
          `${basePath}/guard`
        )
      );
    }

    // allowed_roles の検証
    transition.allowed_roles?.forEach((role, roleIndex) => {
      if (role !== "*" && !roleNames.has(role)) {
        errors.push(
          createError(
            "INVALID_ROLE_REFERENCE",
            `Role '${role}' is not defined`,
            `${basePath}/allowed_roles/${roleIndex}`
          )
        );
      }
    });
  });

  // イベントの allowed_roles 検証
  process.events.forEach((event, index) => {
    const basePath = `/events/${index}`;
    const roles = event.allowed_roles;

    // "*" と他のロールの混在チェック
    if (roles.includes("*") && roles.length > 1) {
      errors.push(
        createError(
          "INVALID_WILDCARD_ROLE",
          `Event '${event.name}' has wildcard '*' mixed with other roles`,
          `${basePath}/allowed_roles`
        )
      );
    }

    // ロール存在チェック
    roles.forEach((role, roleIndex) => {
      if (role !== "*" && !roleNames.has(role)) {
        errors.push(
          createError(
            "INVALID_ROLE_REFERENCE",
            `Role '${role}' in event '${event.name}' is not defined`,
            `${basePath}/allowed_roles/${roleIndex}`
          )
        );
      }
    });
  });

  // ガードの検証
  Object.entries(process.guards).forEach(([name, guard]) => {
    const basePath = `/guards/${name}`;

    // artifact_type の検証
    if (!artifactTypes.has(guard.artifact_type)) {
      errors.push(
        createError(
          "INVALID_GUARD_ARTIFACT_TYPE",
          `Guard '${name}' references undefined artifact type '${guard.artifact_type}'`,
          `${basePath}/artifact_type`
        )
      );
    }

    // min_count の検証（count 条件の場合）
    if (guard.condition === "count") {
      const countGuard = guard as ArtifactCountGuard;
      if (countGuard.min_count < 0) {
        errors.push(
          createError(
            "INVALID_MIN_COUNT",
            `Guard '${name}' has negative min_count: ${countGuard.min_count}`,
            `${basePath}/min_count`
          )
        );
      }
    }
  });

  // 状態の required_artifacts 検証
  process.states.forEach((state, index) => {
    state.required_artifacts?.forEach((artifactType, artifactIndex) => {
      if (!artifactTypes.has(artifactType)) {
        errors.push(
          createError(
            "INVALID_REQUIRED_ARTIFACT",
            `State '${state.name}' requires undefined artifact type '${artifactType}'`,
            `/states/${index}/required_artifacts/${artifactIndex}`
          )
        );
      }
    });
  });

  // 終端状態の検証
  const hasFinalState = process.states.some((s) => s.is_final === true);
  if (!hasFinalState) {
    errors.push(
      createError("NO_FINAL_STATE", "No final state defined in process")
    );
  }

  // 到達可能性の検証
  validateReachability(process, stateNames, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 一意性の検証
 */
function validateUniqueness(
  process: Process,
  errors: ProcessValidationError[]
): void {
  // 状態名の重複チェック
  const stateNames = new Map<string, number[]>();
  process.states.forEach((state, index) => {
    const indices = stateNames.get(state.name) ?? [];
    indices.push(index);
    stateNames.set(state.name, indices);
  });
  stateNames.forEach((indices, name) => {
    if (indices.length > 1) {
      errors.push(
        createError(
          "DUPLICATE_STATE_NAME",
          `Duplicate state name '${name}' at indices ${indices.join(", ")}`,
          `/states/${indices[1]}/name`
        )
      );
    }
  });

  // イベント名の重複チェック
  const eventNames = new Map<string, number[]>();
  process.events.forEach((event, index) => {
    const indices = eventNames.get(event.name) ?? [];
    indices.push(index);
    eventNames.set(event.name, indices);
  });
  eventNames.forEach((indices, name) => {
    if (indices.length > 1) {
      errors.push(
        createError(
          "DUPLICATE_EVENT_NAME",
          `Duplicate event name '${name}' at indices ${indices.join(", ")}`,
          `/events/${indices[1]}/name`
        )
      );
    }
  });

  // ロール名の重複チェック
  const roleNames = new Map<string, number[]>();
  process.roles.forEach((role, index) => {
    const indices = roleNames.get(role.name) ?? [];
    indices.push(index);
    roleNames.set(role.name, indices);
  });
  roleNames.forEach((indices, name) => {
    if (indices.length > 1) {
      errors.push(
        createError(
          "DUPLICATE_ROLE_NAME",
          `Duplicate role name '${name}' at indices ${indices.join(", ")}`,
          `/roles/${indices[1]}/name`
        )
      );
    }
  });

  // 成果物種別の重複チェック
  const artifactTypes = new Map<string, number[]>();
  process.artifacts.forEach((artifact, index) => {
    const indices = artifactTypes.get(artifact.type) ?? [];
    indices.push(index);
    artifactTypes.set(artifact.type, indices);
  });
  artifactTypes.forEach((indices, type) => {
    if (indices.length > 1) {
      errors.push(
        createError(
          "DUPLICATE_ARTIFACT_TYPE",
          `Duplicate artifact type '${type}' at indices ${indices.join(", ")}`,
          `/artifacts/${indices[1]}/type`
        )
      );
    }
  });
}

/**
 * 到達可能性の検証
 * BFS で初期状態から全状態への到達可能性をチェック
 */
function validateReachability(
  process: Process,
  stateNames: Set<string>,
  errors: ProcessValidationError[]
): void {
  // 遷移グラフを構築
  const graph = new Map<string, Set<string>>();
  stateNames.forEach((name) => graph.set(name, new Set()));

  process.transitions.forEach((t) => {
    if (graph.has(t.from)) {
      graph.get(t.from)!.add(t.to);
    }
  });

  // BFS
  const visited = new Set<string>();
  const queue: string[] = [process.initial_state];
  visited.add(process.initial_state);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.get(current);
    if (neighbors) {
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  // 到達不能な状態を報告
  process.states.forEach((state, index) => {
    if (!visited.has(state.name)) {
      errors.push(
        createError(
          "UNREACHABLE_STATE",
          `State '${state.name}' is not reachable from initial state '${process.initial_state}'`,
          `/states/${index}`
        )
      );
    }
  });
}

/**
 * エラーオブジェクト生成ヘルパー
 */
function createError(
  code: ProcessValidationErrorCode,
  message: string,
  path?: string
): ProcessValidationError {
  const error: ProcessValidationError = { code, message };
  if (path !== undefined) {
    error.path = path;
  }
  return error;
}
