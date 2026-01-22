/**
 * Guard 評価器のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateGuard,
  evaluateGuards,
  evaluateTransitionGuard,
} from "../src/guard/evaluator.js";
import type { Guard, ArtifactExistsGuard, ArtifactCountGuard } from "../src/types/index.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// テスト用のテンポラリディレクトリ
const TEST_DIR = ".test_artifacts";

describe("Guard Evaluator", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  describe("evaluateGuard - exists condition", () => {
    it("should satisfy when artifact exists", async () => {
      // テストファイルを作成
      const artifactPath = path.join(TEST_DIR, "document_test.md");
      await fs.writeFile(artifactPath, "test content");

      const guard: ArtifactExistsGuard = {
        type: "artifact",
        artifact_type: "document",
        condition: "exists",
      };

      const result = await evaluateGuard("has_doc", guard, {
        artifactPaths: [artifactPath],
      });

      expect(result.satisfied).toBe(true);
      expect(result.guard_name).toBe("has_doc");
    });

    it("should not satisfy when artifact does not exist", async () => {
      const guard: ArtifactExistsGuard = {
        type: "artifact",
        artifact_type: "document",
        condition: "exists",
      };

      const result = await evaluateGuard("has_doc", guard, {
        artifactPaths: [path.join(TEST_DIR, "nonexistent_document.md")],
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements).toBeDefined();
      expect(result.missing_requirements?.some((r) => r.includes("document"))).toBe(true);
    });

    it("should not satisfy when no paths provided", async () => {
      const guard: ArtifactExistsGuard = {
        type: "artifact",
        artifact_type: "document",
        condition: "exists",
      };

      const result = await evaluateGuard("has_doc", guard, {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(false);
    });
  });

  describe("evaluateGuard - count condition", () => {
    it("should satisfy when count meets minimum", async () => {
      // テストファイルを作成
      const path1 = path.join(TEST_DIR, "item_1.md");
      const path2 = path.join(TEST_DIR, "item_2.md");
      const path3 = path.join(TEST_DIR, "item_3.md");
      await fs.writeFile(path1, "test 1");
      await fs.writeFile(path2, "test 2");
      await fs.writeFile(path3, "test 3");

      const guard: ArtifactCountGuard = {
        type: "artifact",
        artifact_type: "item",
        condition: "count",
        min_count: 3,
      };

      const result = await evaluateGuard("has_items", guard, {
        artifactPaths: [path1, path2, path3],
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when count is below minimum", async () => {
      const path1 = path.join(TEST_DIR, "item_1.md");
      const path2 = path.join(TEST_DIR, "item_2.md");
      await fs.writeFile(path1, "test 1");
      await fs.writeFile(path2, "test 2");

      const guard: ArtifactCountGuard = {
        type: "artifact",
        artifact_type: "item",
        condition: "count",
        min_count: 3,
      };

      const result = await evaluateGuard("has_items", guard, {
        artifactPaths: [path1, path2],
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements).toBeDefined();
      expect(result.missing_requirements?.some((r) => r.includes("2"))).toBe(true);
      expect(result.missing_requirements?.some((r) => r.includes("3"))).toBe(true);
    });

    it("should satisfy with min_count 0 and no artifacts", async () => {
      const guard: ArtifactCountGuard = {
        type: "artifact",
        artifact_type: "item",
        condition: "count",
        min_count: 0,
      };

      const result = await evaluateGuard("has_items", guard, {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe("evaluateGuards", () => {
    it("should evaluate multiple guards", async () => {
      const path1 = path.join(TEST_DIR, "doc_1.md");
      await fs.writeFile(path1, "test");

      const guards: Record<string, Guard> = {
        has_doc: {
          type: "artifact",
          artifact_type: "doc",
          condition: "exists",
        },
        has_items: {
          type: "artifact",
          artifact_type: "item",
          condition: "count",
          min_count: 3,
        },
      };

      const result = await evaluateGuards(guards, ["has_doc", "has_items"], {
        artifactPaths: [path1],
      });

      expect(result.all_satisfied).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results.find((r) => r.guard_name === "has_doc")?.satisfied).toBe(true);
      expect(result.results.find((r) => r.guard_name === "has_items")?.satisfied).toBe(false);
    });

    it("should return error for undefined guard", async () => {
      const guards: Record<string, Guard> = {};

      const result = await evaluateGuards(guards, ["nonexistent"], {
        artifactPaths: [],
      });

      expect(result.all_satisfied).toBe(false);
      expect(result.results[0]?.satisfied).toBe(false);
      expect(result.results[0]?.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });
  });

  describe("evaluateTransitionGuard", () => {
    it("should return satisfied when no guard specified", async () => {
      const guards: Record<string, Guard> = {};

      const result = await evaluateTransitionGuard(guards, undefined, {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(true);
    });

    it("should evaluate specified guard", async () => {
      const path1 = path.join(TEST_DIR, "document_test.md");
      await fs.writeFile(path1, "test");

      const guards: Record<string, Guard> = {
        has_doc: {
          type: "artifact",
          artifact_type: "document",
          condition: "exists",
        },
      };

      const result = await evaluateTransitionGuard(guards, "has_doc", {
        artifactPaths: [path1],
      });

      expect(result.satisfied).toBe(true);
    });

    it("should return error for undefined guard", async () => {
      const guards: Record<string, Guard> = {};

      const result = await evaluateTransitionGuard(guards, "nonexistent", {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });
  });
});
