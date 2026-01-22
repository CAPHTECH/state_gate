/**
 * Artifact（成果物）の型定義
 * @see docs/concepts.md
 */

import type { JSONSchema } from "./common.js";

/**
 * 成果物の定義（Process 内で使用）
 */
export interface ArtifactDefinition {
  /** 成果物種別 */
  type: string;
  description?: string;
  /** どの状態で必要か */
  required_in_states?: string[];
  /** どの遷移で必要か */
  required_for_transitions?: string[];
  /** スキーマ（任意） */
  schema?: JSONSchema;
}

/**
 * 成果物への参照
 * MVP: 成果物はファイルパスで参照（CSV の artifact_paths 列に保存）
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
