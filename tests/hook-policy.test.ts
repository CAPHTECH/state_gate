/**
 * Hook policy evaluation tests
 */

import { describe, it, expect } from "vitest";
import { evaluateHookPolicy, type HookPolicy } from "../src/hook/policy.js";

const policy: HookPolicy = {
  policies: {
    state_tool_permissions: {
      observe: {
        denied: ["Edit"],
        ask: ["Bash"],
      },
    },
    tool_restrictions: {
      Bash: {
        deny_patterns: ["rm -rf"],
        allow_patterns: ["git status", "git diff"],
      },
    },
  },
};

describe("Hook policy evaluation", () => {
  it("denies tools blocked by state policy", () => {
    const result = evaluateHookPolicy(policy, {
      toolName: "Edit",
      toolInputText: "",
      currentState: "observe",
    });

    expect(result?.decision).toBe("deny");
  });

  it("denies commands matching deny patterns", () => {
    const result = evaluateHookPolicy(policy, {
      toolName: "Bash",
      toolInputText: "rm -rf /tmp",
      currentState: "frame",
    });

    expect(result?.decision).toBe("deny");
  });

  it("asks when command is not in allow list", () => {
    const result = evaluateHookPolicy(policy, {
      toolName: "Bash",
      toolInputText: "ls -la",
      currentState: "frame",
    });

    expect(result?.decision).toBe("ask");
  });

  it("allows commands matching allow patterns", () => {
    const result = evaluateHookPolicy(policy, {
      toolName: "Bash",
      toolInputText: "git status",
      currentState: "frame",
    });

    expect(result?.decision).toBe("allow");
  });
});
