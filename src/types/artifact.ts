/**
 * Artifact（成果物）の型定義
 * @see docs/concepts.md
 *
 * ## Term（用語）の統一
 *
 * 成果物種別を参照する際の命名規則:
 * - `type`: ArtifactDefinition 自身のプロパティ
 * - `artifact_type`: 他の型から成果物種別を参照する際（Guard など）
 * - `required_artifacts`: State で必要な成果物種別のリスト
 *
 * これらはすべて同じ値空間（artifacts[].type）を参照する。
 */

import type { JSONSchema } from "./common.js";

/**
 * 成果物の定義（Process 内で使用）
 */
export interface ArtifactDefinition {
  /** 成果物種別 */
  type: string;
  description?: string;
  /**
   * どの状態で必要か（逆引き参照用）
   * 注意: Source of Truth は State.required_artifacts
   * この値はバリデーション時に State から自動導出することを推奨
   */
  required_in_states?: string[];
  /** どの遷移で必要か */
  required_for_transitions?: string[];
  /** スキーマ（任意） */
  schema?: JSONSchema;
}

/**
 * 成果物への参照（将来拡張用）
 *
 * MVP では以下の理由により、MCP インターフェースでは artifact_paths: string[] を使用:
 * - CSV 形式との互換性（パス文字列のみ保存）
 * - 型推論を必要としない単純なユースケース
 *
 * v0.2 以降で type による成果物分類・検索が必要になった際にこの型を活用予定
 */
export interface ArtifactRef {
  /** 成果物種別 */
  type: string;
  /** ファイルパス */
  path: string;
}

/**
 * 成果物のステータス（MCP レスポンス用）
 */
export type ArtifactStatus = "missing" | "present";

/**
 * 必要な成果物の情報（MCP レスポンス用）
 */
export interface RequiredArtifact {
  type: string;
  description: string;
  /** MVP: ファイル存在チェックのみ */
  status: ArtifactStatus;
}
