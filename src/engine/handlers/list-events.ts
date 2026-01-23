/**
 * list_events ハンドラー
 * @see docs/mcp-interface.md
 */

import type {
  ListEventsRequest,
  ListEventsResponse,
  EventInfo,
  EventTransition,
} from "../../types/index.js";
import { StateEngineError, type StateEngine } from "../state-engine.js";
import { evaluateTransitionGuard, type GuardEvaluationContext } from "../../guard/evaluator.js";
import { checkEventPermission, checkTransitionPermission } from "../../auth/role-checker.js";

/**
 * list_events リクエストを処理
 */
export async function handleListEvents(
  engine: StateEngine,
  request: ListEventsRequest,
  role: string
): Promise<ListEventsResponse> {
  const runState = await engine.getRunState(request.run_id);
  const process = engine.getProcess(runState.process_id);

  if (!process) {
    throw new StateEngineError(
      `Process '${runState.process_id}' not found`,
      "PROCESS_NOT_FOUND"
    );
  }

  // 最新エントリの成果物パスを使用
  const entries = await engine.getEventHistory(request.run_id);
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;
  const artifactPaths = latestEntry?.artifact_paths ?? [];

  const guardContext: GuardEvaluationContext = { artifactPaths };

  // イベントごとの遷移情報を収集
  const eventTransitionsMap = new Map<
    string,
    {
      transitions: EventTransition[];
      anyGuardSatisfied: boolean;
    }
  >();

  for (const transition of process.transitions) {
    if (transition.from !== runState.current_state) continue;

    const event = process.events.find((e) => e.name === transition.event);
    if (!event) continue;

    // 権限チェック（許可されない遷移は除外）
    const eventPermission = checkEventPermission(event, role);
    if (!eventPermission.allowed) {
      continue;
    }
    const transitionPermission = checkTransitionPermission(transition, role);
    if (!transitionPermission.allowed) {
      continue;
    }

    // ガード評価
    const guardResult = await evaluateTransitionGuard(
      process.guards,
      transition.guard,
      guardContext
    );

    // 遷移情報を作成
    let eventTransition: EventTransition;
    if (!transition.guard) {
      eventTransition = {
        to_state: transition.to,
        guard_status: "no_guard",
      };
    } else if (guardResult.satisfied) {
      eventTransition = {
        to_state: transition.to,
        guard: transition.guard,
        guard_status: "satisfied",
      };
    } else {
      eventTransition = {
        to_state: transition.to,
        guard: transition.guard,
        guard_status: "unsatisfied",
        missing_requirements: guardResult.missing_requirements ?? [],
      };
    }

    // イベント情報を更新
    const existing = eventTransitionsMap.get(transition.event) ?? {
      transitions: [],
      anyGuardSatisfied: false,
    };

    existing.transitions.push(eventTransition);

    if (guardResult.satisfied || !transition.guard) {
      existing.anyGuardSatisfied = true;
    }

    eventTransitionsMap.set(transition.event, existing);
  }

  // EventInfo を構築
  const events: EventInfo[] = [];

  for (const [eventName, info] of eventTransitionsMap.entries()) {
    const event = process.events.find((e) => e.name === eventName);
    if (!event) continue;

    // include_blocked が false の場合、ブロックされたイベントはスキップ
    const isBlocked = !info.anyGuardSatisfied;
    if (isBlocked && !request.include_blocked) continue;

    if (isBlocked) {
      const blockedEvent: EventInfo = {
        event_name: eventName,
        description: event.description ?? "",
        transitions: info.transitions,
        is_allowed: false,
        blocked_reason: "Guard conditions not satisfied",
      };
      if (event.payload_schema) {
        blockedEvent.payload_schema = event.payload_schema;
      }
      events.push(blockedEvent);
    } else {
      const allowedEvent: EventInfo = {
        event_name: eventName,
        description: event.description ?? "",
        transitions: info.transitions,
        is_allowed: true,
      };
      if (event.payload_schema) {
        allowedEvent.payload_schema = event.payload_schema;
      }
      events.push(allowedEvent);
    }
  }

  return {
    run_id: request.run_id,
    current_state: runState.current_state,
    events,
  };
}
