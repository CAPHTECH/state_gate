/**
 * MCP インターフェースの型定義
 * @see docs/mcp-interface.md
 */

import type { RequiredArtifact } from "./artifact.js";
import type { JSONSchema } from "./common.js";
import type { ContextVariables } from "./process.js";
import type { RunId } from "./run.js";

// =============================================================================
// get_state
// =============================================================================

export interface GetStateRequest {
  run_id: RunId;
}

export interface MissingGuard {
  guard_name: string;
  description: string;
  current_status: string;
}

export interface AllowedEvent {
  event_name: string;
  description: string;
  payload_schema?: JSONSchema;
}

export interface GetStateResponse {
  run_id: RunId;
  process_id: string;
  process_version: string;
  current_state: string;
  revision: number;
  context: ContextVariables;
  /** 未充足のガード（遷移を阻害している条件） */
  missing_guards: MissingGuard[];
  /** この状態で必要な成果物 */
  required_artifacts: RequiredArtifact[];
  /** 現在発行可能なイベント */
  allowed_events: AllowedEvent[];
  updated_at: string;
}

// =============================================================================
// list_events
// =============================================================================

export interface ListEventsRequest {
  run_id: RunId;
  /** ガードで阻害されているイベントも含めるか */
  include_blocked?: boolean;
}

export type GuardStatus = "satisfied" | "unsatisfied" | "no_guard";

export interface EventTransition {
  to_state: string;
  guard?: string;
  guard_status: GuardStatus;
  missing_requirements?: string[];
}

/**
 * イベント情報の基底型
 */
interface EventInfoBase {
  event_name: string;
  description: string;
  payload_schema?: JSONSchema;
  /** このイベントで可能な遷移 */
  transitions: EventTransition[];
}

/**
 * 発行可能なイベント
 */
interface EventInfoAllowed extends EventInfoBase {
  /** 現在発行可能 */
  is_allowed: true;
  blocked_reason?: never;
}

/**
 * 発行不可能なイベント（ガード未充足など）
 */
interface EventInfoBlocked extends EventInfoBase {
  /** 現在発行不可能 */
  is_allowed: false;
  /** 発行不可能な理由（必須） */
  blocked_reason: string;
}

/**
 * イベント情報（判別共用体）
 * Law: is_allowed === false => blocked_reason は必須
 */
export type EventInfo = EventInfoAllowed | EventInfoBlocked;

export interface ListEventsResponse {
  run_id: RunId;
  current_state: string;
  events: EventInfo[];
}

// =============================================================================
// emit_event
// =============================================================================

export interface EmitEventRequest {
  run_id: RunId;
  event_name: string;
  payload?: Record<string, unknown>;
  /** 必須: 楽観ロック */
  expected_revision: number;
  /** 必須: 冪等性保証 */
  idempotency_key: string;
  /** 成果物の添付（任意） */
  artifact_paths?: string[];
}

export interface EmitEventTransition {
  from_state: string;
  to_state: string;
}

export interface EmitEventSuccessResult {
  /**
   * イベントID（UUIDv7 形式）
   * idempotency_key とは異なり、システムが生成する一意識別子
   * 監査ログ・トレーサビリティ用途
   */
  event_id: string;
  /**
   * イベント受理フラグ（リテラル型）
   * 将来の拡張で accepted: false（部分受理など）を追加する余地を残す
   * 現在は常に true（success: true の場合）
   */
  accepted: true;
  transition?: EmitEventTransition;
  new_revision: number;
}

/**
 * イベント発行エラーコード
 * 各コードは特定の Law（不変条件）違反に対応
 */
export type EmitEventErrorCode =
  /** Law: 楽観ロック（expected_revision === current_revision） */
  | "REVISION_CONFLICT"
  /** Law: ロール権限（role ∈ event.allowed_roles ∩ transition.allowed_roles） */
  | "FORBIDDEN"
  /** Law: ガード充足（guard.evaluate() === true） */
  | "GUARD_FAILED"
  /** Law: イベント存在（event_name ∈ process.events） */
  | "INVALID_EVENT"
  /** Law: ペイロードスキーマ準拠（payload matches event.payload_schema） */
  | "INVALID_PAYLOAD"
  /** 冪等性リプレイ（エラーではなく正常系だが識別用） */
  | "IDEMPOTENT_REPLAY"
  /** Run が存在しない */
  | "RUN_NOT_FOUND"
  /** Process 定義が存在しない */
  | "PROCESS_NOT_FOUND";

export interface ValidationError {
  path: string;
  message: string;
}

export interface EmitEventErrorDetails {
  current_revision?: number;
  missing_guards?: string[];
  validation_errors?: ValidationError[];
}

export interface EmitEventError {
  code: EmitEventErrorCode;
  message: string;
  details?: EmitEventErrorDetails;
}

export type EmitEventResponse =
  | { success: true; result: EmitEventSuccessResult }
  | { success: false; error: EmitEventError };

// =============================================================================
// Hook Adapter
// =============================================================================

export interface PreToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  /** state_gate 連携用 */
  run_id?: string;
}

export type HookDecision = "allow" | "deny" | "ask";

export interface PreToolUseOutput {
  decision: HookDecision;
  /** deny の場合 */
  reason?: string;
  /** ask の場合 */
  question?: string;
  /** 追加情報 */
  context?: {
    current_state: string;
    missing_requirements?: string[];
  };
}
