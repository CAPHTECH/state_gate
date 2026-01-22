/**
 * Artifact チェッカー
 * 成果物ファイルの存在・状態を確認
 * @see src/types/artifact.ts
 */

import * as fs from "node:fs/promises";
import type { ArtifactStatus } from "../types/index.js";

/**
 * 単一ファイルの存在チェック結果
 */
export interface ArtifactCheckResult {
  path: string;
  status: ArtifactStatus;
}

/**
 * 成果物ファイルの存在をチェック
 * @param paths - チェックするファイルパスの配列
 * @returns チェック結果の配列
 */
export async function checkArtifacts(
  paths: string[]
): Promise<ArtifactCheckResult[]> {
  return Promise.all(paths.map(checkArtifact));
}

/**
 * 単一ファイルの存在チェック
 * @param path - チェックするファイルパス
 * @returns チェック結果
 */
export async function checkArtifact(path: string): Promise<ArtifactCheckResult> {
  const status = await fileExists(path);
  return {
    path,
    status: status ? "present" : "missing",
  };
}

/**
 * 成果物が存在するかチェック（1件以上存在）
 * @param paths - チェックするファイルパスの配列
 * @returns いずれかのファイルが存在すれば true
 */
export async function hasAnyArtifact(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return false;

  const results = await checkArtifacts(paths);
  return results.some((r) => r.status === "present");
}

/**
 * 指定件数以上の成果物が存在するかチェック
 * @param paths - チェックするファイルパスの配列
 * @param minCount - 必要な最小件数
 * @returns 存在するファイル数が minCount 以上なら true
 */
export async function hasMinArtifacts(
  paths: string[],
  minCount: number
): Promise<boolean> {
  if (paths.length === 0) return minCount === 0;

  const results = await checkArtifacts(paths);
  const presentCount = results.filter((r) => r.status === "present").length;
  return presentCount >= minCount;
}

/**
 * 存在するファイル数をカウント
 * @param paths - チェックするファイルパスの配列
 * @returns 存在するファイルの数
 */
export async function countPresentArtifacts(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;

  const results = await checkArtifacts(paths);
  return results.filter((r) => r.status === "present").length;
}

/**
 * ファイル存在チェック（内部用）
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * artifact_type に基づいてパスをフィルタリング
 *
 * ## マッチング規則（MVP）
 *
 * ファイル名（拡張子を除く）と artifact_type の関係で判定:
 *
 * | パターン | マッチ例（artifact_type="document"） |
 * |----------|-------------------------------------|
 * | 完全一致 | `document.md` ✓ |
 * | プレフィックス（_区切り） | `document_v1.md` ✓ |
 * | プレフィックス（-区切り） | `document-draft.md` ✓ |
 * | サフィックス（_区切り） | `draft_document.md` ✓ |
 * | サフィックス（-区切り） | `final-document.md` ✓ |
 *
 * ## マッチしない例
 *
 * | パターン | 理由 |
 * |----------|------|
 * | `documents.md` | 完全一致ではない（sが余分） |
 * | `mydocument.md` | 区切り文字なしの結合 |
 * | `doc_v1.md` | 別の artifact_type |
 *
 * @param paths - 全成果物パス
 * @param artifactType - フィルタリングする成果物種別
 * @returns フィルタリングされたパス
 */
export function filterPathsByArtifactType(
  paths: string[],
  artifactType: string
): string[] {
  return paths.filter((p) => {
    // パスのベース名から拡張子を除いた部分を取得
    const baseName = p.split("/").pop() ?? "";
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");
    // artifact_type が含まれるかチェック（区切り文字で明確に区切られている場合のみ）
    return (
      nameWithoutExt === artifactType ||
      nameWithoutExt.startsWith(`${artifactType}_`) ||
      nameWithoutExt.startsWith(`${artifactType}-`) ||
      nameWithoutExt.endsWith(`_${artifactType}`) ||
      nameWithoutExt.endsWith(`-${artifactType}`)
    );
  });
}
