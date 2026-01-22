/**
 * Process DSL の型定義
 * @see docs/concepts.md
 * @see docs/process-dsl.md
 */

import type { ArtifactDefinition } from "./artifact.js";
import type { JSONSchema } from "./common.js";

// Re-export for convenience
export type { JSONSchema } from "./common.js";

/**
 * 状態機械の定義
 */
export interface Process {
  /** YAML定義の id に対応 */
  id: string;
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
export interface State {
  name: string;
  description?: string;
  /**
   * この状態で必要な成果物（artifact_type を指定）
   * Source of Truth: この定義が正。
   * ArtifactDefinition.required_in_states は逆引き参照用
   */
  required_artifacts?: string[];
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
   */
  allowed_roles: string[];
}

/**
 * 状態の変化を定義: state + event -> state（ガード条件付き）
 */
export interface Transition {
  /** 遷移元の状態 */
  from: string;
  /** トリガーとなるイベント */
  event: string;
  /** 遷移先の状態 */
  to: string;
  /** ガード条件の名前（guards への参照） */
  guard?: string;
  /** この遷移を実行できるロール */
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
  /** condition: 'count' の場合は必須 */
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
