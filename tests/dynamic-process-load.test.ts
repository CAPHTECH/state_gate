/**
 * StateEngine 動的プロセス読み込みのテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StateEngine } from "../src/engine/state-engine.js";

describe("StateEngine dynamic process loading", () => {
  let tempDir: string;
  let processDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "state-gate-test-"));
    processDir = path.join(tempDir, ".state_gate", "processes");
    await fs.mkdir(processDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createProcessFile = async (processId: string, ext: string = ".yaml") => {
    const content = `process:
  id: ${processId}
  version: "1.0.0"
  name: Test Process
  initial_state: start

roles:
  - name: agent
    allowed_events:
      - next

states:
  - name: start
    description: Start state
    prompt: Test prompt
  - name: done
    description: Final state
    prompt: Done
    is_final: true

events:
  - name: next
    description: Next event
    allowed_roles:
      - agent

transitions:
  - from: start
    event: next
    to: done
`;
    await fs.writeFile(path.join(processDir, `${processId}${ext}`), content);
  };

  describe("getProcessAsync", () => {
    // 典型例: プロセスファイルが存在する場合
    it("should load process from .yaml file", async () => {
      await createProcessFile("test-process", ".yaml");
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("test-process");
      expect(process).toBeDefined();
      expect(process?.id).toBe("test-process");
    });

    // 典型例: .yml 拡張子対応
    it("should load process from .yml file", async () => {
      await createProcessFile("yml-process", ".yml");
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("yml-process");
      expect(process).toBeDefined();
      expect(process?.id).toBe("yml-process");
    });

    // 典型例: キャッシュからの取得
    it("should cache loaded process", async () => {
      await createProcessFile("cached-process");
      const engine = new StateEngine({ processDir });

      // 1回目: ファイルから読み込み
      const first = await engine.getProcessAsync("cached-process");
      expect(first).toBeDefined();

      // 2回目: キャッシュから（同期メソッドで確認）
      const cached = engine.getProcess("cached-process");
      expect(cached).toBeDefined();
      expect(cached?.id).toBe("cached-process");
    });

    // 境界例: プロセスが存在しない
    it("should return undefined for non-existent process", async () => {
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("non-existent");
      expect(process).toBeUndefined();
    });

    // 境界例: 空のprocessId
    it("should return undefined for empty processId", async () => {
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("");
      expect(process).toBeUndefined();
    });

    // 境界例: プロセスディレクトリが存在しない
    it("should handle missing processDir gracefully", async () => {
      const engine = new StateEngine({ processDir: "/nonexistent/path" });
      const process = await engine.getProcessAsync("test");
      expect(process).toBeUndefined();
    });

    // 境界例: 不正なYAML
    it("should return undefined for invalid YAML", async () => {
      await fs.writeFile(
        path.join(processDir, "invalid.yaml"),
        "invalid: yaml: content: ::::"
      );
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("invalid");
      expect(process).toBeUndefined();
    });

    // 境界例: バリデーション失敗するプロセス
    it("should return undefined for process failing validation", async () => {
      await fs.writeFile(
        path.join(processDir, "invalid-process.yaml"),
        `
id: invalid-process
version: "1.0.0"
# missing required fields: initial_state, states, etc.
`
      );
      const engine = new StateEngine({ processDir });
      const process = await engine.getProcessAsync("invalid-process");
      expect(process).toBeUndefined();
    });
  });

  describe("createRun with dynamic loading", () => {
    // 回帰テスト: plugin MCP で PROCESS_NOT_FOUND
    it("should auto-load process when creating run", async () => {
      await createProcessFile("auto-load-process");
      const engine = new StateEngine({
        processDir,
        runsDir: path.join(tempDir, ".state_gate", "runs"),
        metadataDir: path.join(tempDir, ".state_gate", "metadata"),
      });

      // プロセスを事前登録せずに createRun
      const run = await engine.createRun({ processId: "auto-load-process" });
      expect(run).toBeDefined();
      expect(run.process_id).toBe("auto-load-process");
      expect(run.current_state).toBe("start");
    });

    // エラーケース: プロセスが見つからない
    it("should throw PROCESS_NOT_FOUND for missing process", async () => {
      const engine = new StateEngine({
        processDir,
        runsDir: path.join(tempDir, ".state_gate", "runs"),
        metadataDir: path.join(tempDir, ".state_gate", "metadata"),
      });

      await expect(
        engine.createRun({ processId: "missing-process" })
      ).rejects.toThrow("Process 'missing-process' not found");
    });
  });

  describe("getRunState with dynamic loading", () => {
    it("should auto-load process when getting run state", async () => {
      await createProcessFile("state-test-process");
      const engine = new StateEngine({
        processDir,
        runsDir: path.join(tempDir, ".state_gate", "runs"),
        metadataDir: path.join(tempDir, ".state_gate", "metadata"),
      });

      // Run を作成
      const run = await engine.createRun({ processId: "state-test-process" });

      // プロセスキャッシュをクリア（新しいエンジンで再現）
      const engine2 = new StateEngine({
        processDir,
        runsDir: path.join(tempDir, ".state_gate", "runs"),
        metadataDir: path.join(tempDir, ".state_gate", "metadata"),
      });

      // プロセスなしで getRunState
      const state = await engine2.getRunState(run.run_id);
      expect(state).toBeDefined();
      expect(state.current_state).toBe("start");
    });
  });

  describe("default processDir", () => {
    it("should use .state_gate/processes as default", async () => {
      // デフォルトディレクトリを作成
      const defaultDir = path.join(process.cwd(), ".state_gate", "processes");

      // このテストは現在のディレクトリに依存するため、
      // 実際のデフォルト動作は統合テストで確認
      const engine = new StateEngine();
      // デフォルトで初期化できることを確認
      expect(engine).toBeDefined();
    });
  });
});
