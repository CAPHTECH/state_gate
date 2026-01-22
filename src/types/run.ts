/**
 * Run 管理の型定義
 * @see docs/concepts.md
 * @see docs/mvp.md
 */

import type { ContextVariables } from "./process.js";

/**
 * Run ID の形式: run-{UUIDv7}
 * タイムスタンプ順でソート可能
 *
 * @law 形式: run-{UUIDv7}（例: run-019471a2-7c8d-7000-8000-000000000001）
 * @law UUIDv7 部分は RFC 9562 準拠
 * @grounding ランタイムバリデーションで検証
 */
export type RunId = `run-${string}`;

/**
 * CSV の1行に対応するエントリ
 */
export interface RunEntry {
  /**
   * イベント発生日時
   * @law 形式: ISO 8601（例: 2025-01-22T10:00:00Z）
   * @grounding ランタイムバリデーションで検証
   */
  timestamp: string;
  /** 遷移後の状態 */
  state: string;
  /**
   * 楽観ロック用の単調増加番号
   * @law revision >= 1（初期行は revision 1）
   * @law revision は行ごとに単調増加
   */
  revision: number;
  /** 発生したイベント名 */
  event: string;
  /** 冪等性保証用キー（同一キーの再送は無視） */
  idempotency_key: string;
  /**
   * 成果物パス（セミコロン区切り文字列）
   * CSV形式との互換性のため string 型
   * 注意: セミコロンを含むパスは扱えない制約あり
   * 使用時は ParsedRunEntry への変換を推奨
   */
  artifact_paths: string;
}

/**
 * パース済みの RunEntry
 * artifact_paths を配列として扱う場合に使用
 */
export interface ParsedRunEntry extends Omit<RunEntry, "artifact_paths"> {
  artifact_paths: string[];
}

/**
 * Run の現在状態（最新行から取得）
 *
 * 注意: process_id と context は CSV には直接保存されない。
 * - process_id: Run 作成時に別途管理（メタデータファイル or ファイル名規則）
 * - context: Process 定義の initial_context から初期化、
 *            イベントペイロードで更新される場合は別途管理が必要
 *
 * MVP では Run 作成時の process_id を記憶し、
 * context は initial_context のみをサポートする。
 */
export interface RunState {
  run_id: RunId;
  /** Process 定義への参照（CSV非保存、Run作成時に決定） */
  process_id: string;
  current_state: string;
  revision: number;
  /** コンテキスト変数（CSV非保存、Process.initial_context から初期化） */
  context: ContextVariables;
  created_at: string;
  updated_at: string;
}

/**
 * Run 作成時のパラメータ
 */
export interface CreateRunParams {
  process_id: string;
  context?: ContextVariables;
}

/**
 * Run 作成結果
 */
export interface CreateRunResult {
  run_id: RunId;
  initial_state: string;
  revision: number;
}

/**
 * CSV ファイルのパス規則
 * .state_gate/runs/{run_id}.csv
 */
export const RUN_FILE_PATTERN = ".state_gate/runs";

/**
 * CSV ヘッダー（固定）
 *
 * @law CSV_HEADERS の要素は RunEntry のキーと1:1対応
 * @law 順序は CSV ファイルの列順序を決定
 * @grounding パース/シリアライズ時にこの定数を使用すること
 */
export const CSV_HEADERS = [
  "timestamp",
  "state",
  "revision",
  "event",
  "idempotency_key",
  "artifact_paths",
] as const satisfies readonly (keyof RunEntry)[];
