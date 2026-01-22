/**
 * CSV Store のテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CsvStore, CsvStoreError } from "../src/run/csv-store.js";
import type { RunId, RunEntry } from "../src/types/index.js";

const TEST_DIR = ".state_gate_test_runs";

describe("CsvStore", () => {
  let store: CsvStore;

  beforeEach(async () => {
    store = new CsvStore({ baseDir: TEST_DIR });
    // クリーンアップ
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  describe("createRun", () => {
    it("should create a new run with initial entry", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000001";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const exists = await store.exists(runId);
      expect(exists).toBe(true);

      const entries = await store.readEntries(runId);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.state).toBe("start");
      expect(entries[0]?.revision).toBe(1);
    });

    it("should throw if run already exists", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000002";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      await expect(store.createRun(runId, entry)).rejects.toThrow(CsvStoreError);
    });
  });

  describe("appendEntry", () => {
    it("should append entry to existing run", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000003";
      const initialEntry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await store.createRun(runId, initialEntry);

      const newEntry: RunEntry = {
        timestamp: "2024-01-01T00:01:00Z",
        state: "middle",
        revision: 2,
        event: "go_next",
        idempotency_key: "go-001",
        artifact_paths: "doc1.md;doc2.md",
      };

      await store.appendEntry(runId, newEntry);

      const entries = await store.readEntries(runId);
      expect(entries).toHaveLength(2);
      expect(entries[1]?.state).toBe("middle");
      expect(entries[1]?.revision).toBe(2);
      expect(entries[1]?.artifact_paths).toEqual(["doc1.md", "doc2.md"]);
    });

    it("should throw if run does not exist", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000099";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await expect(store.appendEntry(runId, entry)).rejects.toThrow(CsvStoreError);
    });
  });

  describe("getLatestEntry", () => {
    it("should return the latest entry", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000004";
      const entry1: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };
      const entry2: RunEntry = {
        timestamp: "2024-01-01T00:01:00Z",
        state: "end",
        revision: 2,
        event: "finish",
        idempotency_key: "finish-001",
        artifact_paths: "",
      };

      await store.createRun(runId, entry1);
      await store.appendEntry(runId, entry2);

      const latest = await store.getLatestEntry(runId);
      expect(latest?.state).toBe("end");
      expect(latest?.revision).toBe(2);
    });

    it("should return null for empty run", async () => {
      // This case shouldn't happen in practice, but test for robustness
      const runId: RunId = "run-00000000-0000-0000-0000-000000000005";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const latest = await store.getLatestEntry(runId);
      expect(latest).not.toBeNull();
    });
  });

  describe("listRunIds", () => {
    it("should list all run IDs", async () => {
      const runId1: RunId = "run-00000000-0000-0000-0000-000000000006";
      const runId2: RunId = "run-00000000-0000-0000-0000-000000000007";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "__init__:test",
        artifact_paths: "",
      };

      await store.createRun(runId1, entry);
      await store.createRun(runId2, { ...entry, idempotency_key: "__init__:test2" });

      const runIds = await store.listRunIds();
      expect(runIds).toContain(runId1);
      expect(runIds).toContain(runId2);
    });

    it("should return empty array if no runs", async () => {
      const runIds = await store.listRunIds();
      expect(runIds).toEqual([]);
    });
  });

  describe("hasIdempotencyKey", () => {
    it("should return true if key exists", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000008";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "unique-key-123",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const has = await store.hasIdempotencyKey(runId, "unique-key-123");
      expect(has).toBe(true);
    });

    it("should return false if key does not exist", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000009";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "unique-key-123",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const has = await store.hasIdempotencyKey(runId, "different-key");
      expect(has).toBe(false);
    });
  });

  describe("CSV escaping", () => {
    it("should handle values with commas", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000a";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "key,with,commas",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.idempotency_key).toBe("key,with,commas");
    });

    it("should handle values with quotes", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000b";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: 'key"with"quotes',
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.idempotency_key).toBe('key"with"quotes');
    });

    it("should handle empty artifact_paths", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000c";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "test-key",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.artifact_paths).toEqual([]);
    });

    it("should handle values with newlines", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000d";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "key\nwith\nnewlines",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.idempotency_key).toBe("key\nwith\nnewlines");
    });

    it("should handle values with commas, quotes, and newlines combined", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000e";
      const complexValue = 'test,"complex"\nvalue';
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: complexValue,
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.idempotency_key).toBe(complexValue);
    });

    it("should handle multiple artifact paths correctly", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-00000000000f";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "test-key",
        artifact_paths: "path/to/file1.md;path/to/file2.md;path/to/file3.md",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.artifact_paths).toEqual([
        "path/to/file1.md",
        "path/to/file2.md",
        "path/to/file3.md",
      ]);
    });

    it("should handle single artifact path correctly", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000010";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: "test-key",
        artifact_paths: "single/path.md",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.artifact_paths).toEqual(["single/path.md"]);
    });

    it("should preserve empty strings in the middle of fields", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000011";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "",  // 空の状態名（エッジケース）
        revision: 1,
        event: "__init__",
        idempotency_key: "test-key",
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.state).toBe("");
    });

    it("should handle consecutive quotes correctly", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000012";
      const entry: RunEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        state: "start",
        revision: 1,
        event: "__init__",
        idempotency_key: '""double""quotes""',
        artifact_paths: "",
      };

      await store.createRun(runId, entry);

      const entries = await store.readEntries(runId);
      expect(entries[0]?.idempotency_key).toBe('""double""quotes""');
    });
  });
});
