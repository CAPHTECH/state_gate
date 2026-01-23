/**
 * State Engine のテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { StateEngine, StateEngineError } from "../src/engine/state-engine.js";
import { parseProcess } from "../src/process/parser.js";
import type { RunId } from "../src/types/index.js";

const TEST_RUNS_DIR = ".state_gate_test_engine_runs";
const TEST_METADATA_DIR = ".state_gate_test_engine_metadata";

const simpleProcessYaml = `
process:
  id: simple-process
  version: "1.0.0"
  name: Simple Process
  initial_state: start

states:
  - name: start
    description: Start state
  - name: middle
    description: Middle state
  - name: end
    description: End state
    is_final: true

events:
  - name: go_next
    description: Go to next state
    allowed_roles: [agent]
  - name: finish
    description: Finish
    allowed_roles: [agent]

transitions:
  - from: start
    event: go_next
    to: middle
  - from: middle
    event: finish
    to: end

guards: {}

artifacts: []

roles:
  - name: agent
    allowed_events: [go_next, finish]
`;

describe("StateEngine", () => {
  let engine: StateEngine;
  const process = parseProcess(simpleProcessYaml);

  beforeEach(async () => {
    // クリーンアップ
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(process);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  describe("createRun", () => {
    it("should create a new run", async () => {
      const runState = await engine.createRun({
        processId: "simple-process",
      });

      expect(runState.run_id).toMatch(/^run-/);
      expect(runState.process_id).toBe("simple-process");
      expect(runState.current_state).toBe("start");
      expect(runState.revision).toBe(1);
    });

    it("should throw for unknown process", async () => {
      await expect(
        engine.createRun({ processId: "unknown-process" })
      ).rejects.toThrow(StateEngineError);
    });
  });

  describe("getRunState", () => {
    it("should return run state", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      const state = await engine.getRunState(created.run_id);

      expect(state.run_id).toBe(created.run_id);
      expect(state.current_state).toBe("start");
      expect(state.revision).toBe(1);
    });

    it("should throw for unknown run", async () => {
      await expect(
        engine.getRunState("run-00000000-0000-0000-0000-000000000000" as RunId)
      ).rejects.toThrow(StateEngineError);
    });
  });

  describe("emitEvent", () => {
    it("should transition state on valid event", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      const result = await engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next",
        expectedRevision: 1,
        idempotencyKey: "test-001",
        role: "agent",
      });

      expect(result.accepted).toBe(true);
      expect(result.transition?.fromState).toBe("start");
      expect(result.transition?.toState).toBe("middle");
      expect(result.newRevision).toBe(2);

      const state = await engine.getRunState(created.run_id);
      expect(state.current_state).toBe("middle");
    });

    it("should throw on revision conflict", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      await expect(
        engine.emitEvent({
          runId: created.run_id,
          eventName: "go_next",
          expectedRevision: 999, // Wrong revision
          idempotencyKey: "test-002",
          role: "agent",
        })
      ).rejects.toThrow(StateEngineError);
    });

    it("should return replay result for duplicate idempotency key", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      // First emit
      await engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next",
        expectedRevision: 1,
        idempotencyKey: "test-003",
        role: "agent",
      });

      // Second emit with same key
      const result = await engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next",
        expectedRevision: 2, // Even with correct revision
        idempotencyKey: "test-003", // Same key
        role: "agent",
      });

      expect(result.accepted).toBe(true);
      expect(result.replayed).toBe(true);
    });

    it("should throw on invalid event for current state", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      await expect(
        engine.emitEvent({
          runId: created.run_id,
          eventName: "finish", // Not valid from start state
          expectedRevision: 1,
          idempotencyKey: "test-004",
          role: "agent",
        })
      ).rejects.toThrow(StateEngineError);
    });

    it("should throw on forbidden role", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      await expect(
        engine.emitEvent({
          runId: created.run_id,
          eventName: "go_next",
          expectedRevision: 1,
          idempotencyKey: "test-005",
          role: "reviewer", // Not allowed
        })
      ).rejects.toThrow(StateEngineError);
    });

    it("should reject invalid artifact paths", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      try {
        await engine.emitEvent({
          runId: created.run_id,
          eventName: "go_next",
          expectedRevision: 1,
          idempotencyKey: "artifact-invalid-001",
          role: "agent",
          artifactPaths: ["../secret.txt"],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(StateEngineError);
        const engineError = error as StateEngineError;
        expect(engineError.code).toBe("INVALID_PAYLOAD");
        expect(engineError.details?.validationErrors?.[0]?.path).toBe(
          "/artifact_paths/0"
        );
      }
    });

    it("should store cumulative artifact paths in latest entry", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      await engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next",
        expectedRevision: 1,
        idempotencyKey: "artifact-001",
        role: "agent",
        artifactPaths: ["./evidence/hypothesis.md"],
      });

      await engine.emitEvent({
        runId: created.run_id,
        eventName: "finish",
        expectedRevision: 2,
        idempotencyKey: "artifact-002",
        role: "agent",
        artifactPaths: ["./evidence/plan.md"],
      });

      const history = await engine.getEventHistory(created.run_id);
      expect(history[1]?.artifact_paths).toEqual(["./evidence/hypothesis.md"]);
      expect(history[2]?.artifact_paths).toEqual([
        "./evidence/hypothesis.md",
        "./evidence/plan.md",
      ]);
    });
  });

  describe("listRuns", () => {
    it("should list all runs", async () => {
      await engine.createRun({ processId: "simple-process" });
      await engine.createRun({ processId: "simple-process" });

      const runs = await engine.listRuns();

      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.process_id === "simple-process")).toBe(true);
    });

    it("should return empty array if no runs", async () => {
      const runs = await engine.listRuns();
      expect(runs).toEqual([]);
    });
  });

  describe("getEventHistory", () => {
    it("should return event history", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      await engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next",
        expectedRevision: 1,
        idempotencyKey: "history-001",
        role: "agent",
      });

      await engine.emitEvent({
        runId: created.run_id,
        eventName: "finish",
        expectedRevision: 2,
        idempotencyKey: "history-002",
        role: "agent",
      });

      const history = await engine.getEventHistory(created.run_id);

      expect(history).toHaveLength(3); // __init__ + go_next + finish
      expect(history[0]?.event).toBe("__init__");
      expect(history[1]?.event).toBe("go_next");
      expect(history[2]?.event).toBe("finish");
    });
  });

  describe("getAvailableEvents", () => {
    it("should return available events for current state", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      const result = await engine.getAvailableEvents(created.run_id, "agent");

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.eventName).toBe("go_next");
      expect(result.events[0]?.transitions[0]?.toState).toBe("middle");
    });

    it("should not include events for other roles", async () => {
      const created = await engine.createRun({
        processId: "simple-process",
      });

      const result = await engine.getAvailableEvents(created.run_id, "reviewer");

      expect(result.events).toHaveLength(0);
    });
  });
});

// =============================================================================
// ガード付きプロセスのテスト
// =============================================================================

const guardedProcessYaml = `
process:
  id: guarded-process
  version: "1.0.0"
  name: Guarded Process
  initial_state: start

states:
  - name: start
    description: Start state
  - name: end
    description: End state
    is_final: true

events:
  - name: submit
    description: Submit with artifact
    allowed_roles: [agent]

transitions:
  - from: start
    event: submit
    to: end
    guard: has_document

guards:
  has_document:
    type: artifact
    artifact_type: document
    condition: exists

artifacts:
  - type: document
    description: Required document

roles:
  - name: agent
    allowed_events: [submit]
`;

describe("StateEngine - Guard Failure", () => {
  let engine: StateEngine;
  const guardedProcess = parseProcess(guardedProcessYaml);

  beforeEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(guardedProcess);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  it("should throw GUARD_FAILED when guard is not satisfied", async () => {
    const created = await engine.createRun({
      processId: "guarded-process",
    });

    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "submit",
        expectedRevision: 1,
        idempotencyKey: "guard-test-001",
        role: "agent",
        // No artifact_paths provided
      })
    ).rejects.toThrow(StateEngineError);

    try {
      await engine.emitEvent({
        runId: created.run_id,
        eventName: "submit",
        expectedRevision: 1,
        idempotencyKey: "guard-test-001",
        role: "agent",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(StateEngineError);
      expect((error as StateEngineError).code).toBe("GUARD_FAILED");
    }
  });

  it("should not increment revision on guard failure", async () => {
    const created = await engine.createRun({
      processId: "guarded-process",
    });

    const stateBefore = await engine.getRunState(created.run_id);
    expect(stateBefore.revision).toBe(1);

    // ガード失敗するイベントを発行
    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "submit",
        expectedRevision: 1,
        idempotencyKey: "guard-test-002",
        role: "agent",
      })
    ).rejects.toThrow(StateEngineError);

    // revision が不変であることを確認
    const stateAfter = await engine.getRunState(created.run_id);
    expect(stateAfter.revision).toBe(stateBefore.revision);
  });

  it("should not append CSV entry on guard failure", async () => {
    const created = await engine.createRun({
      processId: "guarded-process",
    });

    const historyBefore = await engine.getEventHistory(created.run_id);
    expect(historyBefore).toHaveLength(1); // __init__ only

    // ガード失敗するイベントを発行
    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "submit",
        expectedRevision: 1,
        idempotencyKey: "guard-test-003",
        role: "agent",
      })
    ).rejects.toThrow(StateEngineError);

    // CSV エントリ数が不変であることを確認
    const historyAfter = await engine.getEventHistory(created.run_id);
    expect(historyAfter).toHaveLength(historyBefore.length);
  });

  it("should not change state on guard failure", async () => {
    const created = await engine.createRun({
      processId: "guarded-process",
    });

    const stateBefore = await engine.getRunState(created.run_id);
    expect(stateBefore.current_state).toBe("start");

    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "submit",
        expectedRevision: 1,
        idempotencyKey: "guard-test-004",
        role: "agent",
      })
    ).rejects.toThrow(StateEngineError);

    const stateAfter = await engine.getRunState(created.run_id);
    expect(stateAfter.current_state).toBe("start");
  });

  it("should succeed when guard is satisfied with artifact", async () => {
    // テスト用成果物ファイルを作成
    const artifactPath = `${TEST_RUNS_DIR}/document_test.md`;
    await fs.mkdir(TEST_RUNS_DIR, { recursive: true });
    await fs.writeFile(artifactPath, "test document");

    const created = await engine.createRun({
      processId: "guarded-process",
    });

    const result = await engine.emitEvent({
      runId: created.run_id,
      eventName: "submit",
      expectedRevision: 1,
      idempotencyKey: "guard-test-005",
      role: "agent",
      artifactPaths: [artifactPath],
    });

    expect(result.accepted).toBe(true);
    expect(result.transition?.toState).toBe("end");
    expect(result.newRevision).toBe(2);
  });
});

// =============================================================================
// 冪等リプレイの詳細テスト
// =============================================================================

describe("StateEngine - Idempotent Replay Details", () => {
  let engine: StateEngine;
  const process = parseProcess(simpleProcessYaml);

  beforeEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(process);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  it("should return identical revision on idempotent replay", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    const result1 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "replay-test-001",
      role: "agent",
    });

    const result2 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 2, // Different revision
      idempotencyKey: "replay-test-001", // Same key
      role: "agent",
    });

    expect(result2.newRevision).toBe(result1.newRevision);
    expect(result2.replayed).toBe(true);
  });

  it("should not add duplicate CSV entry on replay", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "replay-test-002",
      role: "agent",
    });

    const historyAfterFirst = await engine.getEventHistory(created.run_id);
    expect(historyAfterFirst).toHaveLength(2); // __init__ + go_next

    // リプレイ
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 2,
      idempotencyKey: "replay-test-002",
      role: "agent",
    });

    const historyAfterReplay = await engine.getEventHistory(created.run_id);
    expect(historyAfterReplay).toHaveLength(2); // 変わらない
  });

  it("should preserve state on replay", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "replay-test-003",
      role: "agent",
    });

    const stateAfterFirst = await engine.getRunState(created.run_id);

    // リプレイ
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 2,
      idempotencyKey: "replay-test-003",
      role: "agent",
    });

    const stateAfterReplay = await engine.getRunState(created.run_id);
    expect(stateAfterReplay.current_state).toBe(stateAfterFirst.current_state);
    expect(stateAfterReplay.revision).toBe(stateAfterFirst.revision);
  });
});

// =============================================================================
// Revision 単調増加のテスト
// =============================================================================

describe("StateEngine - Revision Monotonic Increase", () => {
  let engine: StateEngine;
  const process = parseProcess(simpleProcessYaml);

  beforeEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(process);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  it("should start with revision 1", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    expect(created.revision).toBe(1);
  });

  it("should increment revision monotonically on each emit", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    // Emit 1: revision 1 -> 2
    const result1 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "mono-test-001",
      role: "agent",
    });
    expect(result1.newRevision).toBe(2);

    // Emit 2: revision 2 -> 3
    const result2 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "finish",
      expectedRevision: 2,
      idempotencyKey: "mono-test-002",
      role: "agent",
    });
    expect(result2.newRevision).toBe(3);

    // History should show monotonic increase
    const history = await engine.getEventHistory(created.run_id);
    expect(history).toHaveLength(3);
    expect(history[0]?.revision).toBe(1);
    expect(history[1]?.revision).toBe(2);
    expect(history[2]?.revision).toBe(3);
  });

  it("should reject emit with wrong expected revision", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    // First emit succeeds
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "mono-test-003",
      role: "agent",
    });

    // Second emit with wrong revision fails
    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "finish",
        expectedRevision: 1, // Wrong - should be 2
        idempotencyKey: "mono-test-004",
        role: "agent",
      })
    ).rejects.toThrow(StateEngineError);

    // Revision should still be 2
    const state = await engine.getRunState(created.run_id);
    expect(state.revision).toBe(2);
  });
});

// =============================================================================
// 複数遷移経路の統合テスト
// =============================================================================

describe("StateEngine - Full Transition Path", () => {
  let engine: StateEngine;
  const process = parseProcess(simpleProcessYaml);

  beforeEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(process);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  it("should complete full transition path start -> middle -> end", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    // Initial state: start
    expect(created.current_state).toBe("start");
    expect(created.revision).toBe(1);

    // Transition to middle
    const result1 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "path-001",
      role: "agent",
    });
    expect(result1.transition?.fromState).toBe("start");
    expect(result1.transition?.toState).toBe("middle");

    // Verify state
    const stateMiddle = await engine.getRunState(created.run_id);
    expect(stateMiddle.current_state).toBe("middle");
    expect(stateMiddle.revision).toBe(2);

    // Transition to end (final state)
    const result2 = await engine.emitEvent({
      runId: created.run_id,
      eventName: "finish",
      expectedRevision: 2,
      idempotencyKey: "path-002",
      role: "agent",
    });
    expect(result2.transition?.fromState).toBe("middle");
    expect(result2.transition?.toState).toBe("end");

    // Verify final state
    const stateEnd = await engine.getRunState(created.run_id);
    expect(stateEnd.current_state).toBe("end");
    expect(stateEnd.revision).toBe(3);

    // Verify complete history
    const history = await engine.getEventHistory(created.run_id);
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.state)).toEqual(["start", "middle", "end"]);
    expect(history.map((h) => h.event)).toEqual(["__init__", "go_next", "finish"]);
  });

  it("should reject invalid event from final state", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    // Complete the path to end
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "final-001",
      role: "agent",
    });
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "finish",
      expectedRevision: 2,
      idempotencyKey: "final-002",
      role: "agent",
    });

    // Try to emit event from final state
    await expect(
      engine.emitEvent({
        runId: created.run_id,
        eventName: "go_next", // No transition from 'end' state
        expectedRevision: 3,
        idempotencyKey: "final-003",
        role: "agent",
      })
    ).rejects.toThrow(StateEngineError);
  });

  it("should have no available events from final state", async () => {
    const created = await engine.createRun({
      processId: "simple-process",
    });

    // Complete the path to end
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "go_next",
      expectedRevision: 1,
      idempotencyKey: "available-001",
      role: "agent",
    });
    await engine.emitEvent({
      runId: created.run_id,
      eventName: "finish",
      expectedRevision: 2,
      idempotencyKey: "available-002",
      role: "agent",
    });

    const result = await engine.getAvailableEvents(created.run_id, "agent");
    expect(result.events).toHaveLength(0);
  });
});
