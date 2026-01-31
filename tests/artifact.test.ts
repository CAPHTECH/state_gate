/**
 * Artifact チェッカーのテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  filterPathsByArtifactType,
  checkArtifact,
  checkArtifacts,
  hasAnyArtifact,
  countPresentArtifacts,
} from "../src/artifact/checker.js";

const TEST_ARTIFACT_DIR = ".test_artifacts";

describe("filterPathsByArtifactType", () => {
  describe("exact match", () => {
    it("should match exact filename", () => {
      const paths = ["evidence/document.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/document.md"]);
    });

    it("should match case-insensitive (uppercase file)", () => {
      const paths = ["evidence/DOCUMENT.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/DOCUMENT.md"]);
    });

    it("should match case-insensitive (uppercase type)", () => {
      const paths = ["evidence/document.md"];
      const result = filterPathsByArtifactType(paths, "DOCUMENT");
      expect(result).toEqual(["evidence/document.md"]);
    });

    it("should match mixed case", () => {
      const paths = ["shunsaku/VERIFICATION_REPORT.md"];
      const result = filterPathsByArtifactType(paths, "verification_report");
      expect(result).toEqual(["shunsaku/VERIFICATION_REPORT.md"]);
    });
  });

  describe("prefix match", () => {
    it("should match with underscore prefix", () => {
      const paths = ["evidence/document_v1.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/document_v1.md"]);
    });

    it("should match with dash prefix", () => {
      const paths = ["evidence/document-draft.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/document-draft.md"]);
    });

    it("should match case-insensitive prefix", () => {
      const paths = ["evidence/DOCUMENT_v1.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/DOCUMENT_v1.md"]);
    });
  });

  describe("suffix match", () => {
    it("should match with underscore suffix", () => {
      const paths = ["evidence/draft_document.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/draft_document.md"]);
    });

    it("should match with dash suffix", () => {
      const paths = ["evidence/final-document.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/final-document.md"]);
    });

    it("should match case-insensitive suffix", () => {
      const paths = ["evidence/final-DOCUMENT.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual(["evidence/final-DOCUMENT.md"]);
    });
  });

  describe("no match", () => {
    it("should not match partial name without delimiter", () => {
      const paths = ["evidence/documents.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual([]);
    });

    it("should not match substring without delimiter", () => {
      const paths = ["evidence/mydocument.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual([]);
    });

    it("should not match different type", () => {
      const paths = ["evidence/report.md"];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual([]);
    });
  });

  describe("multiple paths", () => {
    it("should filter multiple paths correctly", () => {
      const paths = [
        "evidence/document.md",
        "evidence/report.md",
        "evidence/document_v2.md",
        "evidence/other.txt",
      ];
      const result = filterPathsByArtifactType(paths, "document");
      expect(result).toEqual([
        "evidence/document.md",
        "evidence/document_v2.md",
      ]);
    });
  });
});

// =============================================================================
// basePath パラメータのテスト
// =============================================================================

describe("checkArtifact with basePath", () => {
  beforeEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    await fs.mkdir(TEST_ARTIFACT_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  it("should check artifact in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    const relativePath = "document.md";
    await fs.writeFile(path.join(basePath, relativePath), "test content");

    const result = await checkArtifact(relativePath, basePath);
    expect(result.path).toBe(relativePath);
    expect(result.status).toBe("present");
  });

  it("should return missing for non-existent artifact in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    const relativePath = "nonexistent.md";

    const result = await checkArtifact(relativePath, basePath);
    expect(result.path).toBe(relativePath);
    expect(result.status).toBe("missing");
  });

  it("should check artifact in nested path", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    const relativePath = "evidence/hypothesis.md";
    await fs.mkdir(path.join(basePath, "evidence"), { recursive: true });
    await fs.writeFile(path.join(basePath, relativePath), "test content");

    const result = await checkArtifact(relativePath, basePath);
    expect(result.path).toBe(relativePath);
    expect(result.status).toBe("present");
  });

  it("should fallback to relative path when basePath is not provided", async () => {
    // プロジェクトルートに一時ファイル作成
    const relativePath = ".test_temp_artifact.md";
    await fs.writeFile(relativePath, "test content");

    try {
      const result = await checkArtifact(relativePath);
      expect(result.path).toBe(relativePath);
      expect(result.status).toBe("present");
    } finally {
      await fs.unlink(relativePath);
    }
  });
});

describe("checkArtifacts with basePath", () => {
  beforeEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    await fs.mkdir(TEST_ARTIFACT_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  it("should check multiple artifacts in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    await fs.writeFile(path.join(basePath, "doc1.md"), "content 1");
    await fs.writeFile(path.join(basePath, "doc2.md"), "content 2");

    const results = await checkArtifacts(["doc1.md", "doc2.md", "doc3.md"], basePath);
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe("present");
    expect(results[1].status).toBe("present");
    expect(results[2].status).toBe("missing");
  });
});

describe("hasAnyArtifact with basePath", () => {
  beforeEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    await fs.mkdir(TEST_ARTIFACT_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  it("should return true when any artifact exists in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    await fs.writeFile(path.join(basePath, "exists.md"), "content");

    const result = await hasAnyArtifact(["nonexistent.md", "exists.md"], basePath);
    expect(result).toBe(true);
  });

  it("should return false when no artifact exists in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;

    const result = await hasAnyArtifact(["nonexistent1.md", "nonexistent2.md"], basePath);
    expect(result).toBe(false);
  });
});

describe("countPresentArtifacts with basePath", () => {
  beforeEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
    await fs.mkdir(TEST_ARTIFACT_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // ディレクトリが存在しなくても OK
    }
  });

  it("should count present artifacts in basePath", async () => {
    const basePath = TEST_ARTIFACT_DIR;
    await fs.writeFile(path.join(basePath, "doc1.md"), "content 1");
    await fs.writeFile(path.join(basePath, "doc2.md"), "content 2");

    const count = await countPresentArtifacts(["doc1.md", "doc2.md", "doc3.md"], basePath);
    expect(count).toBe(2);
  });
});
