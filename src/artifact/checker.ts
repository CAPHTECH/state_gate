/**
 * Artifact チェッカー
 * 成果物ファイルの存在・状態を確認
 * @see src/types/artifact.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ArtifactStatus } from "../types/index.js";

/**
 * アーティファクトパス検証エラー
 */
export class ArtifactPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactPathError";
  }
}

/**
 * アーティファクトパスを検証（パストラバーサル防止）
 * @param path - 検証対象のパス
 * @throws ArtifactPathError - 不正なパスの場合
 */
export function validateArtifactPath(path: string): void {
  // 空パスチェック
  if (!path || path.trim() === "") {
    throw new ArtifactPathError("Empty artifact path");
  }

  // パストラバーサル防止（.. を含むパスを拒否）
  if (path.includes("..")) {
    throw new ArtifactPathError(`Path traversal detected: ${path}`);
  }

  // 絶対パス防止（/ で始まるパスを拒否）
  if (path.startsWith("/")) {
    throw new ArtifactPathError(`Absolute path not allowed: ${path}`);
  }

  // Windows 絶対パス防止
  if (/^[A-Za-z]:/.test(path)) {
    throw new ArtifactPathError(`Absolute path not allowed: ${path}`);
  }
}

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
 * @param basePath - ベースパス（設定時はこのパスを基準に解決）
 * @returns チェック結果の配列
 */
export async function checkArtifacts(
  paths: string[],
  basePath?: string
): Promise<ArtifactCheckResult[]> {
  return Promise.all(paths.map(p => checkArtifact(p, basePath)));
}

/**
 * 単一ファイルの存在チェック
 * @param relativePath - チェックするファイルパス（相対パス）
 * @param basePath - ベースパス（設定時はこのパスを基準に解決）
 * @returns チェック結果
 * @throws ArtifactPathError - 不正なパスの場合
 */
export async function checkArtifact(
  relativePath: string,
  basePath?: string
): Promise<ArtifactCheckResult> {
  validateArtifactPath(relativePath);
  const fullPath = basePath
    ? path.join(basePath, relativePath)
    : relativePath;
  const status = await fileExists(fullPath);
  return {
    path: relativePath,
    status: status ? "present" : "missing",
  };
}

/**
 * 成果物が存在するかチェック（1件以上存在）
 * @param paths - チェックするファイルパスの配列
 * @param basePath - ベースパス（設定時はこのパスを基準に解決）
 * @returns いずれかのファイルが存在すれば true
 */
export async function hasAnyArtifact(
  paths: string[],
  basePath?: string
): Promise<boolean> {
  if (paths.length === 0) return false;

  const results = await checkArtifacts(paths, basePath);
  return results.some((r) => r.status === "present");
}

/**
 * 指定件数以上の成果物が存在するかチェック
 * @param paths - チェックするファイルパスの配列
 * @param minCount - 必要な最小件数
 * @param basePath - ベースパス（設定時はこのパスを基準に解決）
 * @returns 存在するファイル数が minCount 以上なら true
 */
export async function hasMinArtifacts(
  paths: string[],
  minCount: number,
  basePath?: string
): Promise<boolean> {
  if (paths.length === 0) return minCount === 0;

  const results = await checkArtifacts(paths, basePath);
  const presentCount = results.filter((r) => r.status === "present").length;
  return presentCount >= minCount;
}

/**
 * 存在するファイル数をカウント
 * @param paths - チェックするファイルパスの配列
 * @param basePath - ベースパス（設定時はこのパスを基準に解決）
 * @returns 存在するファイルの数
 */
export async function countPresentArtifacts(
  paths: string[],
  basePath?: string
): Promise<number> {
  if (paths.length === 0) return 0;

  const results = await checkArtifacts(paths, basePath);
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
  const lowerArtifactType = artifactType.toLowerCase();
  return paths.filter((p) => {
    // パスのベース名から拡張子を除いた部分を取得
    const baseName = p.split("/").pop() ?? "";
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, "").toLowerCase();
    // artifact_type が含まれるかチェック（case-insensitive、区切り文字で明確に区切られている場合のみ）
    return (
      nameWithoutExt === lowerArtifactType ||
      nameWithoutExt.startsWith(`${lowerArtifactType}_`) ||
      nameWithoutExt.startsWith(`${lowerArtifactType}-`) ||
      nameWithoutExt.endsWith(`_${lowerArtifactType}`) ||
      nameWithoutExt.endsWith(`-${lowerArtifactType}`)
    );
  });
}
