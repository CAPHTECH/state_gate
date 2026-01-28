/**
 * Guard 評価器のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateGuard,
  evaluateGuards,
  evaluateTransitionGuard,
} from "../src/guard/evaluator.js";
import type {
  Guard,
  ArtifactExistsGuard,
  ArtifactCountGuard,
  ContextEqualsGuard,
  ContextNotEqualsGuard,
  ContextInGuard,
  ContextNotInGuard,
  ContextExistsGuard,
  ContextNotExistsGuard,
} from "../src/types/index.js";
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

  // =============================================================================
  // ContextGuard テスト
  // =============================================================================

  describe("evaluateGuard - context equals condition", () => {
    it("should satisfy when context variable equals expected value", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "equals",
        value: "high",
      };

      const result = await evaluateGuard("is_complex", guard, {
        artifactPaths: [],
        context: { complexity: "high" },
      });

      expect(result.satisfied).toBe(true);
      expect(result.guard_name).toBe("is_complex");
    });

    it("should not satisfy when context variable does not equal expected value", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "equals",
        value: "high",
      };

      const result = await evaluateGuard("is_complex", guard, {
        artifactPaths: [],
        context: { complexity: "low" },
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("low"))).toBe(true);
    });

    it("should not satisfy when context variable is not defined (L3)", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "equals",
        value: "high",
      };

      const result = await evaluateGuard("is_complex", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });

    it("should handle null value correctly", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "status",
        condition: "equals",
        value: null,
      };

      const result = await evaluateGuard("is_null", guard, {
        artifactPaths: [],
        context: { status: null },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should handle boolean value correctly", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "enabled",
        condition: "equals",
        value: true,
      };

      const result = await evaluateGuard("is_enabled", guard, {
        artifactPaths: [],
        context: { enabled: true },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should handle number value correctly", async () => {
      const guard: ContextEqualsGuard = {
        type: "context",
        variable: "count",
        condition: "equals",
        value: 42,
      };

      const result = await evaluateGuard("is_42", guard, {
        artifactPaths: [],
        context: { count: 42 },
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe("evaluateGuard - context not_equals condition", () => {
    it("should satisfy when context variable does not equal value", async () => {
      const guard: ContextNotEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "not_equals",
        value: "high",
      };

      const result = await evaluateGuard("not_complex", guard, {
        artifactPaths: [],
        context: { complexity: "low" },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when context variable equals value", async () => {
      const guard: ContextNotEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "not_equals",
        value: "high",
      };

      const result = await evaluateGuard("not_complex", guard, {
        artifactPaths: [],
        context: { complexity: "high" },
      });

      expect(result.satisfied).toBe(false);
    });

    it("should not satisfy when context variable is not defined (L3)", async () => {
      const guard: ContextNotEqualsGuard = {
        type: "context",
        variable: "complexity",
        condition: "not_equals",
        value: "high",
      };

      const result = await evaluateGuard("not_complex", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });
  });

  describe("evaluateGuard - context in condition", () => {
    it("should satisfy when context variable is in array", async () => {
      const guard: ContextInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_team_work", guard, {
        artifactPaths: [],
        context: { team_mode: "team" },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when context variable is not in array", async () => {
      const guard: ContextInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_team_work", guard, {
        artifactPaths: [],
        context: { team_mode: "solo" },
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("solo"))).toBe(true);
    });

    it("should not satisfy when context variable is not defined (L3)", async () => {
      const guard: ContextInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_team_work", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });

    it("should handle mixed primitive types in array", async () => {
      const guard: ContextInGuard = {
        type: "context",
        variable: "priority",
        condition: "in",
        value: [1, 2, "high"],
      };

      const result = await evaluateGuard("valid_priority", guard, {
        artifactPaths: [],
        context: { priority: 1 },
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe("evaluateGuard - context not_in condition", () => {
    it("should satisfy when context variable is not in array", async () => {
      const guard: ContextNotInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "not_in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_solo", guard, {
        artifactPaths: [],
        context: { team_mode: "solo" },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when context variable is in array", async () => {
      const guard: ContextNotInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "not_in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_solo", guard, {
        artifactPaths: [],
        context: { team_mode: "team" },
      });

      expect(result.satisfied).toBe(false);
    });

    it("should not satisfy when context variable is not defined (L3)", async () => {
      const guard: ContextNotInGuard = {
        type: "context",
        variable: "team_mode",
        condition: "not_in",
        value: ["team", "async"],
      };

      const result = await evaluateGuard("is_solo", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("not defined"))).toBe(true);
    });
  });

  describe("evaluateGuard - context exists condition", () => {
    it("should satisfy when context variable exists", async () => {
      const guard: ContextExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "exists",
      };

      const result = await evaluateGuard("has_assignee", guard, {
        artifactPaths: [],
        context: { assignee: "alice" },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should satisfy when context variable exists with null value", async () => {
      const guard: ContextExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "exists",
      };

      const result = await evaluateGuard("has_assignee", guard, {
        artifactPaths: [],
        context: { assignee: null },
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when context variable does not exist", async () => {
      const guard: ContextExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "exists",
      };

      const result = await evaluateGuard("has_assignee", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("does not exist"))).toBe(true);
    });

    it("should not satisfy when context is undefined", async () => {
      const guard: ContextExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "exists",
      };

      const result = await evaluateGuard("has_assignee", guard, {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(false);
    });
  });

  describe("evaluateGuard - context not_exists condition", () => {
    it("should satisfy when context variable does not exist", async () => {
      const guard: ContextNotExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "not_exists",
      };

      const result = await evaluateGuard("no_assignee", guard, {
        artifactPaths: [],
        context: {},
      });

      expect(result.satisfied).toBe(true);
    });

    it("should satisfy when context is undefined", async () => {
      const guard: ContextNotExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "not_exists",
      };

      const result = await evaluateGuard("no_assignee", guard, {
        artifactPaths: [],
      });

      expect(result.satisfied).toBe(true);
    });

    it("should not satisfy when context variable exists", async () => {
      const guard: ContextNotExistsGuard = {
        type: "context",
        variable: "assignee",
        condition: "not_exists",
      };

      const result = await evaluateGuard("no_assignee", guard, {
        artifactPaths: [],
        context: { assignee: "alice" },
      });

      expect(result.satisfied).toBe(false);
      expect(result.missing_requirements?.some((r) => r.includes("exists but should not"))).toBe(true);
    });
  });

  describe("evaluateGuards - mixed guards", () => {
    it("should evaluate both artifact and context guards", async () => {
      const path1 = path.join(TEST_DIR, "doc_1.md");
      await fs.writeFile(path1, "test");

      const guards: Record<string, Guard> = {
        has_doc: {
          type: "artifact",
          artifact_type: "doc",
          condition: "exists",
        },
        is_complex: {
          type: "context",
          variable: "complexity",
          condition: "equals",
          value: "high",
        },
      };

      const result = await evaluateGuards(guards, ["has_doc", "is_complex"], {
        artifactPaths: [path1],
        context: { complexity: "high" },
      });

      expect(result.all_satisfied).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results.find((r) => r.guard_name === "has_doc")?.satisfied).toBe(true);
      expect(result.results.find((r) => r.guard_name === "is_complex")?.satisfied).toBe(true);
    });
  });
});
