/**
 * get_state ハンドラー
 * @see docs/mcp-interface.md
 */

import type {
  GetStateRequest,
  GetStateResponse,
  MissingGuard,
  AllowedEvent,
  RequiredArtifact,
} from "../../types/index.js";
import { StateEngineError, type StateEngine } from "../state-engine.js";
import { evaluateGuard, type GuardEvaluationContext } from "../../guard/evaluator.js";
import { checkArtifacts, filterPathsByArtifactType } from "../../artifact/checker.js";
import { checkEventPermission, checkTransitionPermission } from "../../auth/role-checker.js";

/**
 * get_state リクエストを処理
 */
export async function handleGetState(
  engine: StateEngine,
  request: GetStateRequest,
  role: string
): Promise<GetStateResponse> {
  const runState = await engine.getRunState(request.run_id);
  const process = engine.getProcess(runState.process_id);

  if (!process) {
    throw new StateEngineError(
      `Process '${runState.process_id}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  // 現在状態の定義を取得
  const currentStateDefinition = process.states.find(
    (s) => s.name === runState.current_state
  );

  // メタデータから artifact_base_path を取得
  const metadata = await engine.getRunMetadata(request.run_id);
  const artifactBasePath = metadata?.artifact_base_path;

  // 最新エントリの成果物パスを使用
  const entries = await engine.getEventHistory(request.run_id);
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;
  const artifactPaths = latestEntry?.artifact_paths ?? [];

  const guardContext: GuardEvaluationContext = {
    artifactPaths,
    context: runState.context,
    ...(artifactBasePath !== undefined && { artifactBasePath }),
  };

  // 未充足のガードを収集
  const missingGuards: MissingGuard[] = [];
  for (const transition of process.transitions) {
    if (transition.from !== runState.current_state) continue;
    if (!transition.guard) continue;

    const guard = process.guards[transition.guard];
    if (!guard) continue;

    const result = await evaluateGuard(transition.guard, guard, guardContext);
    if (!result.satisfied) {
      // 重複を避ける
      if (!missingGuards.some((g) => g.guard_name === transition.guard)) {
        missingGuards.push({
          guard_name: transition.guard,
          description: `Guard for transition to '${transition.to}'`,
          current_status: result.missing_requirements?.join(", ") ?? "Unknown",
        });
      }
    }
  }

  // 必要な成果物の状態を取得
  const requiredArtifacts: RequiredArtifact[] = [];
  const requiredTypes = currentStateDefinition?.required_artifacts ?? [];
  for (const artifactType of requiredTypes) {
    const artifactDef = process.artifacts.find((a) => a.type === artifactType);
    const relevantPaths = filterPathsByArtifactType(artifactPaths, artifactType);
    const checkResults = await checkArtifacts(relevantPaths, artifactBasePath);
    const hasPresent = checkResults.some((r) => r.status === "present");

    requiredArtifacts.push({
      type: artifactType,
      description: artifactDef?.description ?? "",
      status: hasPresent ? "present" : "missing",
    });
  }

  // 発行可能なイベントを収集
  const allowedEvents: AllowedEvent[] = [];
  const seenEvents = new Set<string>();

  for (const transition of process.transitions) {
    if (transition.from !== runState.current_state) continue;
    if (seenEvents.has(transition.event)) continue;

    const event = process.events.find((e) => e.name === transition.event);
    if (!event) continue;

    // 権限チェック
    const eventPermission = checkEventPermission(event, role);
    if (!eventPermission.allowed) continue;

    const transitionPermission = checkTransitionPermission(transition, role);
    if (!transitionPermission.allowed) continue;

    // ガードチェック（ガードが未充足でも許可イベントとして表示）
    seenEvents.add(transition.event);

    const allowedEvent: AllowedEvent = {
      event_name: event.name,
      description: event.description ?? "",
    };
    if (event.payload_schema) {
      allowedEvent.payload_schema = event.payload_schema;
    }
    allowedEvents.push(allowedEvent);
  }

  return {
    run_id: request.run_id,
    process_id: runState.process_id,
    process_version: process.version,
    current_state: runState.current_state,
    ...(currentStateDefinition?.prompt !== undefined && {
      current_state_prompt: currentStateDefinition.prompt,
    }),
    revision: runState.revision,
    context: runState.context,
    missing_guards: missingGuards,
    required_artifacts: requiredArtifacts,
    allowed_events: allowedEvents,
    updated_at: runState.updated_at,
    ...(artifactBasePath !== undefined && { artifact_base_path: artifactBasePath }),
  };
}
