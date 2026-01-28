/**
 * Artifact チェッカーのテスト
 */

import { describe, it, expect } from "vitest";
import { filterPathsByArtifactType } from "../src/artifact/checker.js";

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
