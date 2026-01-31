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
  /**
   * ガードの現在状態を人間可読な形式で表現
   * 例: "成果物 'design_doc' が未提出", "成果物数が 2/3"
   *
   * 注意: GuardStatus とは異なり、詳細な状態説明を提供する
   * GuardStatus は評価結果（satisfied/unsatisfied/no_guard）を表す列挙型
   */
  current_status: string;
}

export interface AllowedEvent {
  /**
   * イベント名
   * @term Process.events[].name を参照
   */
  event_name: string;
  description: string;
  payload_schema?: JSONSchema;
}

export interface GetStateResponse {
  run_id: RunId;
  process_id: string;
  process_version: string;
  /**
   * 現在の状態
   * @term Process.states[].name を参照
   */
  current_state: string;
  /** 現在の状態に紐づくプロンプト（任意） */
  current_state_prompt?: string;
  revision: number;
  context: ContextVariables;
  /** 未充足のガード（遷移を阻害している条件） */
  missing_guards: MissingGuard[];
  /** この状態で必要な成果物 */
  required_artifacts: RequiredArtifact[];
  /** 現在発行可能なイベント */
  allowed_events: AllowedEvent[];
  /**
   * 最終更新日時
   * @law 形式: ISO 8601（例: 2025-01-22T10:00:00Z）
   */
  updated_at: string;
  /**
   * Artifact ベースパス
   * 設定されている場合、artifact はこのパス配下に保存すべき
   * エージェントは相対パス（例: "evidence/hypothesis.md"）で artifact を指定し、
   * state_gate がこのベースパスと結合して実際のパスを解決する
   *
   * 未設定の場合は後方互換のため従来方式（プロジェクトルート相対）
   */
  artifact_base_path?: string;
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

/**
 * イベント遷移情報の基底型（内部用）
 */
interface EventTransitionBase {
  /**
   * 遷移先の状態
   * @term Process.states[].name を参照
   */
  to_state: string;
  /**
   * ガード条件の名前
   * @term Process.guards のキーを参照
   */
  guard?: string;
}

/**
 * ガード充足または無ガードの遷移
 */
interface EventTransitionSatisfied extends EventTransitionBase {
  guard_status: "satisfied" | "no_guard";
  missing_requirements?: never;
}

/**
 * ガード未充足の遷移
 * @law guard_status === "unsatisfied" => missing_requirements は必須
 */
interface EventTransitionUnsatisfied extends EventTransitionBase {
  guard_status: "unsatisfied";
  /** 未充足の要件リスト（必須） */
  missing_requirements: string[];
}

/**
 * イベント遷移情報（判別共用体）
 * Law: guard_status に応じた必須フィールドを型レベルで強制
 */
export type EventTransition = EventTransitionSatisfied | EventTransitionUnsatisfied;

/**
 * イベント情報の基底型
 */
interface EventInfoBase {
  /**
   * イベント名
   * @term Process.events[].name を参照
   */
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
  /**
   * 現在の状態
   * @term Process.states[].name を参照
   */
  current_state: string;
  events: EventInfo[];
}

// =============================================================================
// emit_event
// =============================================================================

export interface EmitEventRequest {
  run_id: RunId;
  /**
   * 発行するイベント名
   * @term Process.events[].name を参照
   */
  event_name: string;
  payload?: Record<string, unknown>;
  /** 必須: 楽観ロック */
  expected_revision: number;
  /**
   * 必須: 冪等性保証
   * @law Run 内で一意（同一 Run 内での重複は禁止）
   * @law 空文字列は禁止（len > 0）
   */
  idempotency_key: string;
  /** 成果物の添付（任意） */
  artifact_paths?: string[];
}

export interface EmitEventTransition {
  /**
   * 遷移元の状態
   * @term Process.states[].name を参照
   */
  from_state: string;
  /**
   * 遷移先の状態
   * @term Process.states[].name を参照
   */
  to_state: string;
}

export interface EmitEventSuccessResult {
  /**
   * イベントID
   * idempotency_key とは異なり、システムが生成する一意識別子
   * 監査ログ・トレーサビリティ用途
   *
   * @law 形式: UUIDv7（RFC 9562 準拠）
   * @grounding ランタイムで生成・検証
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
  /**
   * 新しい state の prompt（遷移が発生し、新しい state に prompt がある場合）
   * エージェントに次のアクションをガイドするために使用
   */
  new_state_prompt?: string;
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
  /**
   * エラー箇所のパス
   * @law 形式: JSON Pointer（RFC 6901、例: "/payload/amount"）
   */
  path: string;
  message: string;
}

/**
 * エラー詳細情報
 *
 * ## Law: エラーコードに応じた必須フィールド
 *
 * - `REVISION_CONFLICT` → `current_revision` が存在すべき
 * - `GUARD_FAILED` → `missing_guards` が存在すべき
 * - `INVALID_PAYLOAD` → `validation_errors` が存在すべき
 *
 * 注意: 型レベルでの強制は複雑になるため、ランタイムで保証する
 */
export interface EmitEventErrorDetails {
  /** REVISION_CONFLICT 時: 現在の revision */
  current_revision?: number;
  /** GUARD_FAILED 時: 未充足のガード名リスト */
  missing_guards?: string[];
  /** INVALID_PAYLOAD 時: バリデーションエラー詳細 */
  validation_errors?: ValidationError[];
}

export interface EmitEventError {
  code: EmitEventErrorCode;
  message: string;
  details?: EmitEventErrorDetails;
}

/**
 * イベント発行レスポンス（判別共用体）
 * @law success === true => result は必須、error は存在しない
 * @law success === false => error は必須、result は存在しない
 */
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
  run_id?: RunId;
}

export type HookDecision = "allow" | "deny" | "ask";

/**
 * Hook コンテキスト情報
 */
export interface HookContext {
  /**
   * 現在の状態
   * @term Process.states[].name を参照
   */
  current_state: string;
  missing_requirements?: string[];
}

/**
 * Hook 出力の基底型（内部用）
 */
interface PreToolUseOutputBase {
  context?: HookContext;
}

/**
 * ツール使用を許可
 */
interface PreToolUseOutputAllow extends PreToolUseOutputBase {
  decision: "allow";
  reason?: never;
  question?: never;
}

/**
 * ツール使用を拒否
 * @law decision === "deny" => reason は必須
 */
interface PreToolUseOutputDeny extends PreToolUseOutputBase {
  decision: "deny";
  /** 拒否理由（必須） */
  reason: string;
  question?: never;
}

/**
 * ユーザーに確認を求める
 * @law decision === "ask" => question は必須
 */
interface PreToolUseOutputAsk extends PreToolUseOutputBase {
  decision: "ask";
  reason?: never;
  /** 確認質問（必須） */
  question: string;
}

/**
 * Hook 出力（判別共用体）
 * Law: decision に応じた必須フィールドを型レベルで強制
 */
export type PreToolUseOutput =
  | PreToolUseOutputAllow
  | PreToolUseOutputDeny
  | PreToolUseOutputAsk;

/**
 * PostToolUse Hook 入力
 * ツール実行後に呼ばれる
 */
export interface PostToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_result: unknown;
  /** state_gate 連携用 */
  run_id?: RunId;
}

/**
 * PostToolUse Hook 出力
 * プロンプトに挿入するテキストを返す
 */
export interface PostToolUseOutput {
  /** プロンプトに挿入するテキスト（optional） */
  insertPrompt?: string;
}
