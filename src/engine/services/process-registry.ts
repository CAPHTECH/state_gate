/**
 * Process Registry
 * プロセス定義の登録・取得を管理
 */

import type { Process } from "../../types/index.js";

/**
 * Process Registry
 * プロセス定義のインメモリ管理
 */
export class ProcessRegistry {
  private readonly processes: Map<string, Process> = new Map();

  /**
   * プロセス定義を登録
   */
  register(process: Process): void {
    this.processes.set(process.id, process);
  }

  /**
   * プロセス定義を取得
   */
  get(processId: string): Process | undefined {
    return this.processes.get(processId);
  }

  /**
   * プロセス定義が登録されているか確認
   */
  has(processId: string): boolean {
    return this.processes.has(processId);
  }
}
