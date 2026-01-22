/**
 * 権限チェッカーのテスト
 */

import { describe, it, expect } from "vitest";
import {
  checkEventPermission,
  checkTransitionPermission,
  checkFullPermission,
  canEmitEvent,
  canExecuteTransition,
} from "../src/auth/role-checker.js";
import type { EventDefinition, Transition } from "../src/types/index.js";

describe("Role Checker", () => {
  describe("checkEventPermission", () => {
    it("should allow if role is in allowed_roles", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["agent", "human"],
      };

      const result = checkEventPermission(event, "agent");
      expect(result.allowed).toBe(true);
    });

    it("should deny if role is not in allowed_roles", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["agent"],
      };

      const result = checkEventPermission(event, "reviewer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("reviewer");
    });

    it("should allow all roles with wildcard", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["*"],
      };

      const result = checkEventPermission(event, "any_role");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkTransitionPermission", () => {
    it("should allow if allowed_roles is undefined", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
      };

      const result = checkTransitionPermission(transition, "any_role");
      expect(result.allowed).toBe(true);
    });

    it("should allow if role is in allowed_roles", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
        allowed_roles: ["agent"],
      };

      const result = checkTransitionPermission(transition, "agent");
      expect(result.allowed).toBe(true);
    });

    it("should deny if role is not in allowed_roles", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
        allowed_roles: ["admin"],
      };

      const result = checkTransitionPermission(transition, "agent");
      expect(result.allowed).toBe(false);
    });

    it("should allow all roles with wildcard", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
        allowed_roles: ["*"],
      };

      const result = checkTransitionPermission(transition, "any_role");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkFullPermission", () => {
    it("should allow if both event and transition allow", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["agent"],
      };
      const transition: Transition = {
        from: "start",
        event: "submit",
        to: "end",
        allowed_roles: ["agent"],
      };

      const result = checkFullPermission(event, transition, "agent");
      expect(result.allowed).toBe(true);
    });

    it("should deny if event denies", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["admin"],
      };
      const transition: Transition = {
        from: "start",
        event: "submit",
        to: "end",
        allowed_roles: ["agent"],
      };

      const result = checkFullPermission(event, transition, "agent");
      expect(result.allowed).toBe(false);
    });

    it("should deny if transition denies", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["agent"],
      };
      const transition: Transition = {
        from: "start",
        event: "submit",
        to: "end",
        allowed_roles: ["admin"],
      };

      const result = checkFullPermission(event, transition, "agent");
      expect(result.allowed).toBe(false);
    });
  });

  describe("canEmitEvent", () => {
    it("should return true for allowed role", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["agent"],
      };

      expect(canEmitEvent(event, "agent")).toBe(true);
    });

    it("should return false for denied role", () => {
      const event: EventDefinition = {
        name: "submit",
        allowed_roles: ["admin"],
      };

      expect(canEmitEvent(event, "agent")).toBe(false);
    });
  });

  describe("canExecuteTransition", () => {
    it("should return true for allowed role", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
        allowed_roles: ["agent"],
      };

      expect(canExecuteTransition(transition, "agent")).toBe(true);
    });

    it("should return true if no allowed_roles specified", () => {
      const transition: Transition = {
        from: "start",
        event: "go",
        to: "end",
      };

      expect(canExecuteTransition(transition, "any_role")).toBe(true);
    });
  });
});
