/**
 * State Engine
 * 状態遷移の核となるロジック（Facade）
 * @see docs/concepts.md
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  Process,
  RunId,
  RunState,
  ParsedRunEntry,
  ContextVariables,
  AvailableEventInfo,
  ValidationError,
  RunMetadata,
} from "../types/index.js";
import { ProcessRegistry } from "./services/process-registry.js";
import { RunStore } from "./services/run-store.js";
import { parseProcessFile } from "../process/parser.js";
import { validateProcess } from "../process/validator.js";
import { createRun as createRunUseCase } from "./use-cases/create-run.js";
import { emitEvent as emitEventUseCase, type EmitEventParams as EmitEventUseCaseParams, type EmitEventResult } from "./use-cases/emit-event.js";
import { getRunState as getRunStateUseCase } from "./use-cases/get-run-state.js";
import { getAvailableEvents as getAvailableEventsUseCase } from "./use-cases/get-available-events.js";
import { listRuns as listRunsUseCase } from "./use-cases/list-runs.js";
import { getEventHistory as getEventHistoryUseCase } from "./use-cases/get-event-history.js";

/**
 * State Engine エラーの詳細情報
 * エラーコードに応じた構造化データを保持
 */
export interface StateEngineErrorDetails {
  /** REVISION_CONFLICT 時: 現在の revision */
  currentRevision?: number;
  /** REVISION_CONFLICT 時: 期待された revision */
  expectedRevision?: number;
  /** GUARD_FAILED 時: 未充足のガード名 */
  guardName?: string;
  /** GUARD_FAILED 時: 未充足の要件リスト */
  missingRequirements?: string[];
  /** INVALID_PAYLOAD 時: バリデーションエラー詳細 */
  validationErrors?: ValidationError[];
}

/**
 * State Engine エラー
 * 構造化された詳細情報を保持し、エラーハンドリングを容易にする
 */
export class StateEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: StateEngineErrorDetails,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "StateEngineError";
  }
}

/**
 * State Engine オプション
 */
export interface StateEngineOptions {
  /** CSV ストアのベースディレクトリ */
  runsDir?: string;
  /** メタデータストアのベースディレクトリ */
  metadataDir?: string;
  /** プロセス定義ファイルのディレクトリ（デフォルト: .state_gate/processes） */
  processDir?: string;
}

const DEFAULT_PROCESS_DIR = ".state_gate/processes";

/**
 * Run 作成パラメータ
 */
export interface CreateRunParams {
  processId: string;
  context?: ContextVariables;
}

/**
 * イベント発行パラメータ
 */
export interface EmitEventParams {
  runId: RunId;
  eventName: string;
  expectedRevision: number;
  idempotencyKey: string;
  role: string;
  payload?: Record<string, unknown>;
  artifactPaths?: string[];
}

// Re-export EmitEventResult for backward compatibility
export type { EmitEventResult };

/**
 * State Engine
 * プロセス定義に基づく状態遷移の管理（Facade）
 */
export class StateEngine {
  private readonly processRegistry: ProcessRegistry;
  private readonly runStore: RunStore;
  private readonly processDir: string;

  constructor(options: StateEngineOptions = {}) {
    this.processRegistry = new ProcessRegistry();
    this.runStore = new RunStore({
      runsDir: options.runsDir,
      metadataDir: options.metadataDir,
    });
    this.processDir = options.processDir ?? DEFAULT_PROCESS_DIR;
  }

  /**
   * プロセス定義を登録
   */
  registerProcess(process: Process): void {
    this.processRegistry.register(process);
  }

  /**
   * プロセス定義を取得（キャッシュミス時はファイルから読み込み）
   */
  getProcess(processId: string): Process | undefined {
    return this.processRegistry.get(processId);
  }

  /**
   * プロセス定義を取得（非同期、キャッシュミス時はファイルから読み込み）
   */
  async getProcessAsync(processId: string): Promise<Process | undefined> {
    // キャッシュにあればそれを返す
    const cached = this.processRegistry.get(processId);
    if (cached) {
      return cached;
    }

    // ファイルから読み込み
    const loaded = await this.loadProcessFromFile(processId);
    if (loaded) {
      this.processRegistry.register(loaded);
      return loaded;
    }

    return undefined;
  }

  /**
   * プロセス定義をファイルから読み込み
   */
  private async loadProcessFromFile(processId: string): Promise<Process | undefined> {
    const extensions = [".yaml", ".yml"];
    for (const ext of extensions) {
      const filePath = path.join(this.processDir, `${processId}${ext}`);
      try {
        await fs.access(filePath);
        const process = await parseProcessFile(filePath);
        const validation = validateProcess(process);
        if (validation.valid) {
          return process;
        }
      } catch {
        // ファイルが存在しないか読み込みエラー
      }
    }
    return undefined;
  }

  /**
   * 新しい Run を作成
   */
  async createRun(params: CreateRunParams): Promise<RunState> {
    // プロセスを動的に読み込み
    await this.ensureProcessLoaded(params.processId);
    return createRunUseCase(params, this.processRegistry, this.runStore);
  }

  /**
   * Run の現在状態を取得
   */
  async getRunState(runId: RunId): Promise<RunState> {
    // Run のメタデータからプロセスを動的に読み込み
    await this.ensureProcessLoadedForRun(runId);
    return getRunStateUseCase(runId, this.processRegistry, this.runStore);
  }

  /**
   * イベントを発行
   */
  async emitEvent(params: EmitEventParams): Promise<EmitEventResult> {
    // Run のメタデータからプロセスを動的に読み込み
    await this.ensureProcessLoadedForRun(params.runId);
    const useCaseParams: EmitEventUseCaseParams = {
      runId: params.runId,
      eventName: params.eventName,
      expectedRevision: params.expectedRevision,
      idempotencyKey: params.idempotencyKey,
      role: params.role,
    };
    if (params.payload !== undefined) {
      useCaseParams.payload = params.payload;
    }
    if (params.artifactPaths !== undefined) {
      useCaseParams.artifactPaths = params.artifactPaths;
    }
    return emitEventUseCase(useCaseParams, this.processRegistry, this.runStore);
  }

  /**
   * 現在状態から発行可能なイベントを取得
   */
  async getAvailableEvents(
    runId: RunId,
    role: string
  ): Promise<{ events: AvailableEventInfo[] }> {
    // Run のメタデータからプロセスを動的に読み込み
    await this.ensureProcessLoadedForRun(runId);
    return getAvailableEventsUseCase(runId, role, this.processRegistry, this.runStore);
  }

  /**
   * プロセスが読み込まれていることを保証
   */
  private async ensureProcessLoaded(processId: string): Promise<void> {
    if (this.processRegistry.has(processId)) {
      return;
    }
    await this.getProcessAsync(processId);
  }

  /**
   * Run に関連するプロセスが読み込まれていることを保証
   */
  private async ensureProcessLoadedForRun(runId: RunId): Promise<void> {
    const metadata = await this.runStore.loadMetadata(runId);
    if (!metadata) {
      return; // use-case 側で RUN_NOT_FOUND エラーになる
    }
    await this.ensureProcessLoaded(metadata.process_id);
  }

  /**
   * Run 一覧を取得
   */
  async listRuns(): Promise<RunState[]> {
    return listRunsUseCase(this.processRegistry, this.runStore);
  }

  /**
   * Run のイベント履歴を取得
   */
  async getEventHistory(runId: RunId): Promise<ParsedRunEntry[]> {
    return getEventHistoryUseCase(runId, this.runStore);
  }

  /**
   * Run のメタデータを取得
   */
  async getRunMetadata(runId: RunId): Promise<RunMetadata | null> {
    const metadata = await this.runStore.loadMetadata(runId);
    return metadata ?? null;
  }
}
