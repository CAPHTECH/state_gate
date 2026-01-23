/**
 * Run Store
 * CsvStore と MetadataStore を統合した Run 永続化管理
 */

import type {
  RunId,
  RunEntry,
  RunMetadata,
  ParsedRunEntry,
} from "../../types/index.js";
import { CsvStore } from "../../run/csv-store.js";
import { MetadataStore } from "../../run/metadata-store.js";

/**
 * Run Store オプション
 */
export interface RunStoreOptions {
  runsDir?: string | undefined;
  metadataDir?: string | undefined;
}

/**
 * Run Store
 * Run の永続化を統合管理
 */
export class RunStore {
  private readonly csvStore: CsvStore;
  private readonly metadataStore: MetadataStore;

  constructor(options: RunStoreOptions = {}) {
    const csvOptions = options.runsDir !== undefined ? { baseDir: options.runsDir } : {};
    const metadataOptions = options.metadataDir !== undefined ? { baseDir: options.metadataDir } : {};
    this.csvStore = new CsvStore(csvOptions);
    this.metadataStore = new MetadataStore(metadataOptions);
  }

  /**
   * 新しい Run を作成
   */
  async createRun(runId: RunId, initialEntry: RunEntry, metadata: RunMetadata): Promise<void> {
    await this.csvStore.createRun(runId, initialEntry);
    await this.metadataStore.save(metadata);
  }

  /**
   * メタデータを読み込み
   */
  async loadMetadata(runId: RunId): Promise<RunMetadata | undefined> {
    const result = await this.metadataStore.load(runId);
    return result ?? undefined;
  }

  /**
   * メタデータを保存
   */
  async saveMetadata(metadata: RunMetadata): Promise<void> {
    await this.metadataStore.save(metadata);
  }

  /**
   * 最新エントリを取得
   */
  async getLatestEntry(runId: RunId): Promise<ParsedRunEntry | undefined> {
    const result = await this.csvStore.getLatestEntry(runId);
    return result ?? undefined;
  }

  /**
   * 全エントリを取得
   */
  async readEntries(runId: RunId): Promise<ParsedRunEntry[]> {
    return this.csvStore.readEntries(runId);
  }

  /**
   * エントリを追加
   */
  async appendEntry(runId: RunId, entry: RunEntry): Promise<void> {
    await this.csvStore.appendEntry(runId, entry);
  }

  /**
   * revision を検証してからエントリを追加（アトミック操作）
   * TOCTOU 競合を防止
   */
  async appendEntryWithRevisionCheck(
    runId: RunId,
    entry: RunEntry,
    expectedRevision: number
  ): Promise<{ conflict: true; currentRevision: number } | { conflict: false }> {
    return this.csvStore.appendEntryWithRevisionCheck(runId, entry, expectedRevision);
  }

  /**
   * 冪等性キーでエントリを検索
   */
  async getEntryByIdempotencyKey(
    runId: RunId,
    idempotencyKey: string
  ): Promise<ParsedRunEntry | undefined> {
    const result = await this.csvStore.getEntryByIdempotencyKey(runId, idempotencyKey);
    return result ?? undefined;
  }

  /**
   * Run が存在するか確認
   */
  async exists(runId: RunId): Promise<boolean> {
    return this.csvStore.exists(runId);
  }

  /**
   * 全 Run ID を一覧取得
   */
  async listRunIds(): Promise<RunId[]> {
    return this.csvStore.listRunIds();
  }

  /**
   * 最新エントリから成果物パスを取得
   */
  collectArtifactPaths(entries: ParsedRunEntry[]): string[] {
    if (entries.length === 0) {
      return [];
    }
    return entries[entries.length - 1]?.artifact_paths ?? [];
  }
}
