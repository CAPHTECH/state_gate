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

export interface EventInfo {
  event_name: string;
  description: string;
  payload_schema?: JSONSchema;
  /** このイベントで可能な遷移 */
  transitions: EventTransition[];
  /** 現在発行可能か */
  is_allowed: boolean;
  blocked_reason?: string;
}

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
  event_id: string;
  accepted: true;
  transition?: EmitEventTransition;
  new_revision: number;
}

export type EmitEventErrorCode =
  | "REVISION_CONFLICT"
  | "FORBIDDEN"
  | "GUARD_FAILED"
  | "INVALID_EVENT"
  | "INVALID_PAYLOAD"
  | "IDEMPOTENT_REPLAY"
  | "RUN_NOT_FOUND"
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
