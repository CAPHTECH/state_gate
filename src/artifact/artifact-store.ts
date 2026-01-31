/**
 * ArtifactStore
 * Run ごとの artifact ディレクトリを管理
 * @see docs/concepts.md
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunId } from "../types/index.js";

/**
 * デフォルトの artifact ベースディレクトリ
 */
const DEFAULT_BASE_DIR = ".state_gate/artifacts";

/**
 * ArtifactStore オプション
 */
export interface ArtifactStoreOptions {
  /** artifact ベースディレクトリ */
  baseDir?: string;
}

/**
 * ArtifactStore
 * Run ごとに分離された artifact ディレクトリを管理する
 */
export class ArtifactStore {
  private readonly baseDir: string;

  constructor(options: ArtifactStoreOptions = {}) {
    this.baseDir = options.baseDir ?? DEFAULT_BASE_DIR;
  }

  /**
   * Run の artifact ディレクトリパスを取得
   * @param runId - Run ID
   * @returns artifact ディレクトリの絶対パス（baseDir からの相対パス）
   */
  getArtifactDir(runId: RunId): string {
    return path.join(this.baseDir, runId);
  }

  /**
   * 相対パスを artifact ディレクトリ配下のフルパスに解決
   * @param runId - Run ID
   * @param relativePath - 相対パス（例: "evidence/hypothesis.md"）
   * @returns フルパス（例: ".state_gate/artifacts/run-xxx/evidence/hypothesis.md"）
   */
  resolveArtifactPath(runId: RunId, relativePath: string): string {
    return path.join(this.getArtifactDir(runId), relativePath);
  }

  /**
   * Run の artifact ディレクトリを作成（存在しなければ）
   * @param runId - Run ID
   */
  async ensureArtifactDir(runId: RunId): Promise<void> {
    await fs.mkdir(this.getArtifactDir(runId), { recursive: true });
  }

  /**
   * Run の artifact ディレクトリを削除
   * @param runId - Run ID
   * @returns 削除成功なら true、ディレクトリが存在しなければ false
   */
  async deleteArtifactDir(runId: RunId): Promise<boolean> {
    try {
      await fs.rm(this.getArtifactDir(runId), { recursive: true });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Run の artifact ディレクトリが存在するかチェック
   * @param runId - Run ID
   */
  async artifactDirExists(runId: RunId): Promise<boolean> {
    try {
      await fs.access(this.getArtifactDir(runId));
      return true;
    } catch {
      return false;
    }
  }
}
