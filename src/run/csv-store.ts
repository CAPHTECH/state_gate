/**
 * Run CSV ストア
 * CSV ファイルによる Run エントリの永続化
 * @see src/types/run.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunId, RunEntry, ParsedRunEntry, CSV_HEADERS } from "../types/index.js";

/**
 * CSV ストアエラー
 */
export class CsvStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CsvStoreError";
  }
}

/**
 * CSV ヘッダー（固定順序）
 */
const HEADERS: readonly (keyof RunEntry)[] = [
  "timestamp",
  "state",
  "revision",
  "event",
  "idempotency_key",
  "artifact_paths",
];

/**
 * デフォルトの保存ディレクトリ
 */
const DEFAULT_BASE_DIR = ".state_gate/runs";

/**
 * CSV ストアオプション
 */
export interface CsvStoreOptions {
  /** 保存ディレクトリのベースパス */
  baseDir?: string;
}

/**
 * Run CSV ストア
 * append-only でエントリを追加
 */
export class CsvStore {
  private readonly baseDir: string;

  constructor(options: CsvStoreOptions = {}) {
    this.baseDir = options.baseDir ?? DEFAULT_BASE_DIR;
  }

  /**
   * Run の CSV ファイルパスを取得
   */
  private getFilePath(runId: RunId): string {
    return path.join(this.baseDir, `${runId}.csv`);
  }

  /**
   * ディレクトリが存在しなければ作成
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * 新しい Run を作成（初期エントリを書き込み）
   */
  async createRun(runId: RunId, initialEntry: RunEntry): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(runId);

    // 既存ファイルチェック
    try {
      await fs.access(filePath);
      throw new CsvStoreError(`Run ${runId} already exists`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        if (error instanceof CsvStoreError) throw error;
        throw new CsvStoreError(`Failed to check run existence: ${runId}`, error);
      }
    }

    // ヘッダー + 初期エントリを書き込み
    const content = [
      HEADERS.join(","),
      this.entryToCsvLine(initialEntry),
    ].join("\n") + "\n";

    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * エントリを追加（append-only）
   */
  async appendEntry(runId: RunId, entry: RunEntry): Promise<void> {
    const filePath = this.getFilePath(runId);

    try {
      await fs.access(filePath);
    } catch {
      throw new CsvStoreError(`Run ${runId} does not exist`);
    }

    const line = this.entryToCsvLine(entry) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }

  /**
   * 全エントリを読み込み
   */
  async readEntries(runId: RunId): Promise<ParsedRunEntry[]> {
    const filePath = this.getFilePath(runId);

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CsvStoreError(`Run ${runId} does not exist`);
      }
      throw new CsvStoreError(`Failed to read run: ${runId}`, error);
    }

    // マルチライン値を考慮した行分割
    const lines = this.splitCsvRows(content.trim());
    if (lines.length < 2) {
      return [];
    }

    // ヘッダー行をスキップ
    const entries: ParsedRunEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim()) {
        entries.push(this.csvLineToEntry(line));
      }
    }

    return entries;
  }

  /**
   * 最新のエントリを取得
   */
  async getLatestEntry(runId: RunId): Promise<ParsedRunEntry | null> {
    const entries = await this.readEntries(runId);
    return entries.length > 0 ? entries[entries.length - 1]! : null;
  }

  /**
   * Run が存在するかチェック
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
   * 全 Run ID を一覧取得
   */
  async listRunIds(): Promise<RunId[]> {
    try {
      await fs.access(this.baseDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(this.baseDir);
    return files
      .filter((f) => f.endsWith(".csv") && f.startsWith("run-"))
      .map((f) => f.slice(0, -4) as RunId);
  }

  /**
   * 特定の idempotency_key が既に使用されているかチェック
   */
  async hasIdempotencyKey(runId: RunId, key: string): Promise<boolean> {
    const entries = await this.readEntries(runId);
    return entries.some((e) => e.idempotency_key === key);
  }

  /**
   * 特定の idempotency_key のエントリを取得
   */
  async getEntryByIdempotencyKey(
    runId: RunId,
    key: string
  ): Promise<ParsedRunEntry | null> {
    const entries = await this.readEntries(runId);
    return entries.find((e) => e.idempotency_key === key) ?? null;
  }

  /**
   * エントリを CSV 行に変換
   */
  private entryToCsvLine(entry: RunEntry): string {
    return HEADERS.map((header) => {
      const value = entry[header];
      return this.escapeCsvValue(String(value));
    }).join(",");
  }

  /**
   * CSV 行をエントリにパース
   */
  private csvLineToEntry(line: string): ParsedRunEntry {
    const values = this.parseCsvLine(line);
    if (values.length !== HEADERS.length) {
      throw new CsvStoreError(
        `Invalid CSV line: expected ${HEADERS.length} columns, got ${values.length}`
      );
    }

    const artifactPathsStr = values[5] ?? "";
    return {
      timestamp: values[0] ?? "",
      state: values[1] ?? "",
      revision: parseInt(values[2] ?? "0", 10),
      event: values[3] ?? "",
      idempotency_key: values[4] ?? "",
      artifact_paths: artifactPathsStr ? artifactPathsStr.split(";") : [],
    };
  }

  /**
   * CSV 値をエスケープ
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * CSV コンテンツを論理行に分割（マルチライン値対応）
   * クォート内の改行は行区切りとして扱わない
   */
  private splitCsvRows(content: string): string[] {
    const rows: string[] = [];
    let currentRow = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"') {
        // ダブルクォートのエスケープかチェック
        if (inQuotes && content[i + 1] === '"') {
          currentRow += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          currentRow += char;
        }
      } else if (char === "\n" && !inQuotes) {
        rows.push(currentRow);
        currentRow = "";
      } else {
        currentRow += char;
      }
    }

    // 最後の行を追加
    if (currentRow) {
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * CSV 行をパース（クォート対応）
   */
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }

    values.push(current);
    return values;
  }
}
