/**
 * MetadataStore のテスト
 * @law LAW-metadata-persistence: メタデータの永続化
 * @term TERM-RunMetadata: Run の付加情報
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { MetadataStore, MetadataStoreError } from "../src/run/metadata-store.js";
import type { RunId, RunMetadata } from "../src/types/index.js";

const TEST_DIR = ".state_gate_test_metadata";

describe("MetadataStore", () => {
  let store: MetadataStore;

  beforeEach(async () => {
    store = new MetadataStore({ baseDir: TEST_DIR });
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

  describe("save", () => {
    it("should save metadata to JSON file", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000001",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };

      await store.save(metadata);

      // ファイルが作成されていることを確認
      const exists = await store.exists(metadata.run_id);
      expect(exists).toBe(true);

      // 内容を確認
      const loaded = await store.load(metadata.run_id);
      expect(loaded).toEqual(metadata);
    });

    it("should overwrite existing metadata", async () => {
      const runId: RunId = "run-00000000-0000-0000-0000-000000000002";
      const metadata1: RunMetadata = {
        run_id: runId,
        process_id: "process-v1",
        created_at: "2024-01-01T00:00:00Z",
      };
      const metadata2: RunMetadata = {
        run_id: runId,
        process_id: "process-v2",
        created_at: "2024-01-02T00:00:00Z",
      };

      await store.save(metadata1);
      await store.save(metadata2);

      const loaded = await store.load(runId);
      expect(loaded?.process_id).toBe("process-v2");
      expect(loaded?.created_at).toBe("2024-01-02T00:00:00Z");
    });

    it("should create directory if not exists", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000003",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };

      // ディレクトリが存在しないことを確認
      let dirExists = false;
      try {
        await fs.access(TEST_DIR);
        dirExists = true;
      } catch {
        dirExists = false;
      }
      expect(dirExists).toBe(false);

      // save でディレクトリが自動作成される
      await store.save(metadata);

      // ディレクトリが作成されたことを確認
      try {
        await fs.access(TEST_DIR);
        dirExists = true;
      } catch {
        dirExists = false;
      }
      expect(dirExists).toBe(true);
    });
  });

  describe("load", () => {
    it("should load existing metadata", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000004",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };

      await store.save(metadata);
      const loaded = await store.load(metadata.run_id);

      expect(loaded).toEqual(metadata);
    });

    it("should return null for non-existent run_id", async () => {
      const loaded = await store.load("run-00000000-0000-0000-0000-nonexistent");
      expect(loaded).toBeNull();
    });

    it("should throw MetadataStoreError for invalid JSON", async () => {
      // 不正なJSONファイルを直接作成
      await fs.mkdir(TEST_DIR, { recursive: true });
      const filePath = `${TEST_DIR}/run-00000000-0000-0000-0000-invalid123.json`;
      await fs.writeFile(filePath, "{ invalid json }", "utf-8");

      await expect(
        store.load("run-00000000-0000-0000-0000-invalid123")
      ).rejects.toThrow(MetadataStoreError);
    });
  });

  describe("exists", () => {
    it("should return true if metadata exists", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000005",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };

      await store.save(metadata);

      const exists = await store.exists(metadata.run_id);
      expect(exists).toBe(true);
    });

    it("should return false if metadata does not exist", async () => {
      const exists = await store.exists("run-00000000-0000-0000-0000-notexist");
      expect(exists).toBe(false);
    });
  });

  describe("listAll", () => {
    it("should list all saved metadata", async () => {
      const metadata1: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000006",
        process_id: "process-1",
        created_at: "2024-01-01T00:00:00Z",
      };
      const metadata2: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000007",
        process_id: "process-2",
        created_at: "2024-01-02T00:00:00Z",
      };

      await store.save(metadata1);
      await store.save(metadata2);

      const all = await store.listAll();
      expect(all).toHaveLength(2);
      expect(all.map((m) => m.run_id)).toContain(metadata1.run_id);
      expect(all.map((m) => m.run_id)).toContain(metadata2.run_id);
    });

    it("should return empty array if no metadata exists", async () => {
      const all = await store.listAll();
      expect(all).toEqual([]);
    });

    it("should return empty array if directory does not exist", async () => {
      // ディレクトリを削除した状態でlistAll
      const all = await store.listAll();
      expect(all).toEqual([]);
    });

    it("should only list files matching run-*.json pattern", async () => {
      // run- で始まるファイル
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000008",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };
      await store.save(metadata);

      // run- で始まらないファイルを作成
      await fs.writeFile(
        `${TEST_DIR}/other-file.json`,
        '{"test": true}',
        "utf-8"
      );
      await fs.writeFile(
        `${TEST_DIR}/config.json`,
        '{"config": true}',
        "utf-8"
      );

      const all = await store.listAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.run_id).toBe(metadata.run_id);
    });
  });

  describe("delete", () => {
    it("should delete existing metadata", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-000000000009",
        process_id: "test-process",
        created_at: "2024-01-01T00:00:00Z",
      };

      await store.save(metadata);
      expect(await store.exists(metadata.run_id)).toBe(true);

      const result = await store.delete(metadata.run_id);
      expect(result).toBe(true);
      expect(await store.exists(metadata.run_id)).toBe(false);
    });

    it("should return false if metadata does not exist", async () => {
      const result = await store.delete("run-00000000-0000-0000-0000-notexist");
      expect(result).toBe(false);
    });
  });

  describe("data integrity", () => {
    it("should preserve all fields in round-trip", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-00000000000a",
        process_id: "complex-process/v1.2.3",
        created_at: "2024-12-31T23:59:59.999Z",
      };

      await store.save(metadata);
      const loaded = await store.load(metadata.run_id);

      expect(loaded).not.toBeNull();
      expect(loaded?.run_id).toBe(metadata.run_id);
      expect(loaded?.process_id).toBe(metadata.process_id);
      expect(loaded?.created_at).toBe(metadata.created_at);
    });

    it("should handle special characters in process_id", async () => {
      const metadata: RunMetadata = {
        run_id: "run-00000000-0000-0000-0000-00000000000b",
        process_id: "process/with\"special'chars",
        created_at: "2024-01-01T00:00:00Z",
      };

      await store.save(metadata);
      const loaded = await store.load(metadata.run_id);

      expect(loaded?.process_id).toBe(metadata.process_id);
    });
  });
});
