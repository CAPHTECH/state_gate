/**
 * ArtifactStore テスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ArtifactStore } from "../src/artifact/artifact-store.js";
import type { RunId } from "../src/types/index.js";

const TEST_ARTIFACTS_DIR = ".test_state_gate/artifacts";

describe("ArtifactStore", () => {
  let store: ArtifactStore;

  beforeEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_ARTIFACTS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    store = new ArtifactStore({ baseDir: TEST_ARTIFACTS_DIR });
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_ARTIFACTS_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  describe("getArtifactDir", () => {
    it("should return correct artifact directory path", () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const dir = store.getArtifactDir(runId);
      expect(dir).toBe(`${TEST_ARTIFACTS_DIR}/${runId}`);
    });
  });

  describe("resolveArtifactPath", () => {
    it("should resolve relative path to full path", () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const relativePath = "evidence/hypothesis.md";
      const fullPath = store.resolveArtifactPath(runId, relativePath);
      expect(fullPath).toBe(`${TEST_ARTIFACTS_DIR}/${runId}/evidence/hypothesis.md`);
    });

    it("should handle simple file name", () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const relativePath = "document.md";
      const fullPath = store.resolveArtifactPath(runId, relativePath);
      expect(fullPath).toBe(`${TEST_ARTIFACTS_DIR}/${runId}/document.md`);
    });
  });

  describe("ensureArtifactDir", () => {
    it("should create artifact directory", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      await store.ensureArtifactDir(runId);

      const dir = store.getArtifactDir(runId);
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should be idempotent", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      await store.ensureArtifactDir(runId);
      await store.ensureArtifactDir(runId); // 2回目

      const dir = store.getArtifactDir(runId);
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("artifactDirExists", () => {
    it("should return false for non-existent directory", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const exists = await store.artifactDirExists(runId);
      expect(exists).toBe(false);
    });

    it("should return true for existing directory", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      await store.ensureArtifactDir(runId);

      const exists = await store.artifactDirExists(runId);
      expect(exists).toBe(true);
    });
  });

  describe("deleteArtifactDir", () => {
    it("should delete artifact directory", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      await store.ensureArtifactDir(runId);

      const deleted = await store.deleteArtifactDir(runId);
      expect(deleted).toBe(true);

      const exists = await store.artifactDirExists(runId);
      expect(exists).toBe(false);
    });

    it("should return false for non-existent directory", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const deleted = await store.deleteArtifactDir(runId);
      expect(deleted).toBe(false);
    });

    it("should delete directory with contents", async () => {
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      await store.ensureArtifactDir(runId);

      // ファイルとサブディレクトリを作成
      const dir = store.getArtifactDir(runId);
      await fs.writeFile(path.join(dir, "test.md"), "content");
      await fs.mkdir(path.join(dir, "subdir"), { recursive: true });
      await fs.writeFile(path.join(dir, "subdir", "nested.md"), "nested content");

      const deleted = await store.deleteArtifactDir(runId);
      expect(deleted).toBe(true);

      const exists = await store.artifactDirExists(runId);
      expect(exists).toBe(false);
    });
  });

  describe("default baseDir", () => {
    it("should use default baseDir if not specified", () => {
      const defaultStore = new ArtifactStore();
      const runId = "run-12345678-1234-1234-1234-123456789abc" as RunId;
      const dir = defaultStore.getArtifactDir(runId);
      expect(dir).toBe(`.state_gate/artifacts/${runId}`);
    });
  });
});
