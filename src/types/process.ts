/**
 * Process DSL の型定義
 * @see docs/concepts.md
 * @see docs/process-dsl.md
 *
 * ## Source of Truth（正本）
 *
 * 以下のデータは複数箇所で参照されるが、正本は1箇所に限定される:
 *
 * | データ | 正本 | 参照用 |
 * |--------|------|--------|
 * | イベント許可ロール | EventDefinition.allowed_roles | RoleDefinition.allowed_events |
 * | 状態の必須成果物 | State.required_artifacts | ArtifactDefinition.required_in_states |
 *
 * 参照用データは正本と一致していることをバリデーションで確認すること。
 */

import type { ArtifactDefinition } from "./artifact.js";
import type { JSONSchema } from "./common.js";

// Re-export for convenience
export type { JSONSchema } from "./common.js";

/**
 * 状態機械の定義
 *
 * ## 一意性 Law（不変条件）
 *
 * - `unique(states[].name)` - 状態名は重複禁止
 * - `unique(events[].name)` - イベント名は重複禁止
 * - `unique(roles[].name)` - ロール名は重複禁止
 * - `unique(artifacts[].type)` - 成果物種別は重複禁止
 *
 * ## 参照整合性 Law（不変条件）
 *
 * バリデーション時に以下の条件を検証すること:
 *
 * - `initial_state ∈ states[].name` - 初期状態は定義済み状態のいずれか
 * - `∀t ∈ transitions: t.from ∈ states[].name` - 遷移元は定義済み状態
 * - `∀t ∈ transitions: t.to ∈ states[].name` - 遷移先は定義済み状態
 * - `∀t ∈ transitions: t.guard → t.guard ∈ keys(guards)` - ガード参照先が存在
 * - `∀t ∈ transitions: t.event ∈ events[].name` - イベントは定義済み
 * - `∀t ∈ transitions: ∀r ∈ t.allowed_roles: r ∈ roles[].name ∨ r = "*"` - ロール参照先が存在
 * - `∀g ∈ guards: g.artifact_type ∈ artifacts[].type` - ガードの成果物種別が存在
 * - `∀s ∈ states: ∀a ∈ s.required_artifacts: a ∈ artifacts[].type` - 必須成果物種別が存在
 *
 * @grounding validateProcess() 関数で検証（実装: src/validation/process.ts）
 */
export interface Process {
  /** YAML定義の id に対応 */
  id: string;
  /**
   * プロセス定義のバージョン
   * 注意: MVP では形式検証なし、ドキュメント目的
   * 推奨形式: セマンティックバージョニング（例: 1.0.0）
   */
  version: string;
  name: string;
  description?: string;
  /** Run作成時の初期状態 */
  initial_state: string;

  states: State[];
  events: EventDefinition[];
  transitions: Transition[];
  guards: Record<string, Guard>;
  artifacts: ArtifactDefinition[];
  roles: RoleDefinition[];

  /** 初期コンテキスト */
  initial_context?: ContextVariables;
  /** コンテキストの制約 */
  context_schema?: JSONSchema;
}

/**
 * 探索上の意味を持つ状態
 */
/**
 * ツール実行の許可設定
 */
export interface ToolPermissions {
  /** 許可されたツール名のリスト */
  allowed?: string[];
  /** 拒否されたツール名のリスト */
  denied?: string[];
  /** ユーザーに確認を求めるツール名のリスト */
  ask?: string[];
}

export interface State {
  name: string;
  description?: string;
  /**
   * エージェントに渡すガイド文（プロンプト）
   * 例: "この状態では観察結果を記録し、根拠を添付すること"
   */
  prompt?: string;
  /**
   * この状態で必要な成果物（artifact_type を指定）
   * Source of Truth: この定義が正。
   * ArtifactDefinition.required_in_states は逆引き参照用
   */
  required_artifacts?: string[];
  /**
   * この状態で許可/拒否するツールの設定
   * PreToolUse hook でツール実行前にチェックされる
   */
  tool_permissions?: ToolPermissions;
  /** 終端状態かどうか */
  is_final?: boolean;
}

/**
 * 状態を変化させる入力
 */
export interface EventDefinition {
  name: string;
  description?: string;
  /** ペイロードのスキーマ（JSON Schema） */
  payload_schema?: JSONSchema;
  /**
   * このイベントを発行できるロール
   * - 空配列: 誰も発行できない（明示的な許可が必要）
   * - ["*"]: 全ロールに許可
   * - ["role1", "role2"]: 指定ロールのみ許可
   *
   * @law "*" ∈ allowed_roles → len(allowed_roles) = 1
   *       （"*" と他のロールの混在は禁止）
   */
  allowed_roles: string[];
}

/**
 * 状態の変化を定義: state + event -> state（ガード条件付き）
 */
export interface Transition {
  /**
   * 遷移元の状態
   * @term Process.states[].name を参照
   */
  from: string;
  /**
   * トリガーとなるイベント
   * @term Process.events[].name を参照
   */
  event: string;
  /**
   * 遷移先の状態
   * @term Process.states[].name を参照
   */
  to: string;
  /**
   * ガード条件の名前
   * @term Process.guards のキーを参照
   */
  guard?: string;
  /**
   * この遷移を実行できるロール
   * @term Process.roles[].name または "*" を参照
   */
  allowed_roles?: string[];
  description?: string;
}

/**
 * ガード条件の基底型
 * MVP では成果物ガードのみをサポート
 */
export type Guard = ArtifactGuard;

/**
 * 成果物の存在・件数をチェックするガード（MVP）
 * 判別共用体型で condition に応じた必須フィールドを型レベルで強制
 */
export type ArtifactGuard =
  | ArtifactExistsGuard
  | ArtifactCountGuard;

export interface ArtifactExistsGuard {
  type: "artifact";
  artifact_type: string;
  condition: "exists";
}

export interface ArtifactCountGuard {
  type: "artifact";
  artifact_type: string;
  condition: "count";
  /**
   * 必要な成果物の最小件数
   * condition: 'count' の場合は必須
   * @law min_count >= 0
   */
  min_count: number;
}

/**
 * イベント発行・承認などの権限制御
 */
export interface RoleDefinition {
  name: string;
  description?: string;
  /**
   * 発行可能なイベント（ドキュメント・参照用）
   * 注意: 実際の権限チェックは EventDefinition.allowed_roles を Source of Truth とする
   * この値は allowed_roles と一致していることをバリデーションで確認すること
   */
  allowed_events: string[];
  /** 承認権限 */
  can_approve?: boolean;
  can_reject?: boolean;
}

/**
 * Run に紐づく状態変数（既知のプロパティ）
 */
export interface KnownContextVariables {
  /** 探索モード */
  exploration_mode?: "domain" | "design" | "hybrid";
  /** チームモード */
  team_mode?: "solo" | "team" | "async";
  /** 前提条件 */
  assumptions?: string[];
  /** 判断軸 */
  decision_criteria?: string[];
}

/**
 * Run に紐づく状態変数
 * 既知のプロパティに加え、カスタム変数も許容
 */
export type ContextVariables = KnownContextVariables & {
  [key: string]: unknown;
};

// =============================================================================
// Process バリデーション
// =============================================================================

/**
 * Process 定義のバリデーション結果
 */
export interface ProcessValidationResult {
  valid: boolean;
  errors: ProcessValidationError[];
}

/**
 * Process バリデーションエラー
 */
export interface ProcessValidationError {
  /** エラーコード */
  code: ProcessValidationErrorCode;
  /** 人間可読なエラーメッセージ */
  message: string;
  /**
   * エラー箇所のパス
   * @law 形式: JSON Pointer（RFC 6901、例: "/states/0/name"）
   */
  path?: string;
}

/**
 * Process バリデーションエラーコード
 */
export type ProcessValidationErrorCode =
  /** 必須フィールドの欠落 */
  | "MISSING_REQUIRED_FIELD"
  /** 状態名の重複 */
  | "DUPLICATE_STATE_NAME"
  /** イベント名の重複 */
  | "DUPLICATE_EVENT_NAME"
  /** ロール名の重複 */
  | "DUPLICATE_ROLE_NAME"
  /** 成果物種別の重複 */
  | "DUPLICATE_ARTIFACT_TYPE"
  /** 初期状態が未定義 */
  | "INVALID_INITIAL_STATE"
  /** 遷移元状態が未定義 */
  | "INVALID_TRANSITION_FROM"
  /** 遷移先状態が未定義 */
  | "INVALID_TRANSITION_TO"
  /** 遷移イベントが未定義 */
  | "INVALID_TRANSITION_EVENT"
  /** ガード参照先が未定義 */
  | "INVALID_GUARD_REFERENCE"
  /** ロール参照先が未定義 */
  | "INVALID_ROLE_REFERENCE"
  /** ガードの成果物種別が未定義 */
  | "INVALID_GUARD_ARTIFACT_TYPE"
  /** 状態の必須成果物種別が未定義 */
  | "INVALID_REQUIRED_ARTIFACT"
  /** 到達不能な状態が存在 */
  | "UNREACHABLE_STATE"
  /** 終端状態が存在しない */
  | "NO_FINAL_STATE"
  /** allowed_roles に "*" と他のロールが混在 */
  | "INVALID_WILDCARD_ROLE"
  /** min_count が負の値 */
  | "INVALID_MIN_COUNT";
