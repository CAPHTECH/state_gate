/**
 * File Lock Utility
 * ファイル操作の競合状態を防ぐためのロック機構
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * ロック取得の最大リトライ回数
 */
const MAX_RETRIES = 10;

/**
 * リトライ間隔（ミリ秒）
 */
const RETRY_INTERVAL = 50;

/**
 * ロックのタイムアウト（ミリ秒）- 古いロックファイルの検出用
 */
const LOCK_TIMEOUT = 30000;

/**
 * インメモリロック（同一プロセス内の競合防止）
 */
const inMemoryLocks = new Map<string, Promise<void>>();

/**
 * ファイルロックを取得して操作を実行
 * @param filePath - ロック対象のファイルパス
 * @param operation - ロック内で実行する操作
 * @returns 操作の結果
 */
export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockPath = `${filePath}.lock`;

  // インメモリロック（同一プロセス内の順序保証）
  const existingLock = inMemoryLocks.get(filePath);
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  inMemoryLocks.set(filePath, lockPromise);

  if (existingLock) {
    await existingLock;
  }

  try {
    // ファイルロック取得（クロスプロセス）
    await acquireFileLock(lockPath);

    try {
      return await operation();
    } finally {
      await releaseFileLock(lockPath);
    }
  } finally {
    resolveLock!();
    inMemoryLocks.delete(filePath);
  }
}

/**
 * ファイルロックを取得
 */
async function acquireFileLock(lockPath: string): Promise<void> {
  const lockDir = path.dirname(lockPath);
  await fs.mkdir(lockDir, { recursive: true });

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // O_EXCL フラグで排他的にファイルを作成
      const lockContent = JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
      });
      await fs.writeFile(lockPath, lockContent, { flag: "wx" });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        // ロックファイルが存在する場合、タイムアウトチェック
        const isStale = await checkStaleLock(lockPath);
        if (isStale) {
          await fs.unlink(lockPath).catch(() => {});
          continue;
        }

        // リトライ
        await sleep(RETRY_INTERVAL);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to acquire lock for ${lockPath} after ${MAX_RETRIES} retries`);
}

/**
 * ファイルロックを解放
 */
async function releaseFileLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    // ロックファイルが既に削除されている場合は無視
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to release lock: ${lockPath}`, error);
    }
  }
}

/**
 * 古いロックファイルかどうかチェック
 */
async function checkStaleLock(lockPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(lockPath, "utf-8");
    const lockInfo = JSON.parse(content) as { pid: number; timestamp: number };

    // タイムアウトチェック
    if (Date.now() - lockInfo.timestamp > LOCK_TIMEOUT) {
      return true;
    }

    return false;
  } catch {
    // 読み取り失敗 = 古いロックとみなす
    return true;
  }
}

/**
 * スリープユーティリティ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
