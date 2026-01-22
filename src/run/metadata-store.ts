/**
 * Run メタデータストア
 * CSV に保存されない付加情報を管理
 * @see src/types/run.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunId, RunMetadata } from "../types/index.js";

/**
 * メタデータストアエラー
 */
export class MetadataStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "MetadataStoreError";
  }
}

/**
 * デフォルトの保存ディレクトリ
 */
const DEFAULT_BASE_DIR = ".state_gate/metadata";

/**
 * メタデータストアオプション
 */
export interface MetadataStoreOptions {
  /** 保存ディレクトリのベースパス */
  baseDir?: string;
}

/**
 * Run メタデータストア
 */
export class MetadataStore {
  private readonly baseDir: string;

  constructor(options: MetadataStoreOptions = {}) {
    this.baseDir = options.baseDir ?? DEFAULT_BASE_DIR;
  }

  /**
   * メタデータファイルパスを取得
   */
  private getFilePath(runId: RunId): string {
    return path.join(this.baseDir, `${runId}.json`);
  }

  /**
   * ディレクトリが存在しなければ作成
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * メタデータを保存
   */
  async save(metadata: RunMetadata): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(metadata.run_id);
    const content = JSON.stringify(metadata, null, 2);
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * メタデータを読み込み
   */
  async load(runId: RunId): Promise<RunMetadata | null> {
    const filePath = this.getFilePath(runId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as RunMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new MetadataStoreError(`Failed to load metadata: ${runId}`, error);
    }
  }

  /**
   * メタデータが存在するかチェック
   */
  async exists(runId: RunId): Promise<boolean> {
    const filePath = this.getFilePath(runId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 全メタデータを一覧取得
   */
  async listAll(): Promise<RunMetadata[]> {
    try {
      await fs.access(this.baseDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(this.baseDir);
    const metadataFiles = files.filter(
      (f) => f.endsWith(".json") && f.startsWith("run-")
    );

    const results: RunMetadata[] = [];
    for (const file of metadataFiles) {
      const runId = file.slice(0, -5) as RunId;
      const metadata = await this.load(runId);
      if (metadata) {
        results.push(metadata);
      }
    }

    return results;
  }

  /**
   * メタデータを削除
   */
  async delete(runId: RunId): Promise<boolean> {
    const filePath = this.getFilePath(runId);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw new MetadataStoreError(`Failed to delete metadata: ${runId}`, error);
    }
  }
}
