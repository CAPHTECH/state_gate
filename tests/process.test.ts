/**
 * Process パーサー・バリデーターのテスト
 */

import { describe, it, expect } from "vitest";
import { parseProcess, ProcessParseError } from "../src/process/parser.js";
import { validateProcess } from "../src/process/validator.js";

const validProcessYaml = `
process:
  id: test-process
  version: "1.0.0"
  name: Test Process
  initial_state: start

states:
  - name: start
    description: Initial state
  - name: middle
    description: Middle state
  - name: end
    description: Final state
    is_final: true

events:
  - name: go_next
    description: Go to next state
    allowed_roles: [agent]
  - name: finish
    description: Finish the process
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

describe("Process Parser", () => {
  it("should parse valid YAML", () => {
    const process = parseProcess(validProcessYaml);

    expect(process.id).toBe("test-process");
    expect(process.version).toBe("1.0.0");
    expect(process.name).toBe("Test Process");
    expect(process.initial_state).toBe("start");
    expect(process.states).toHaveLength(3);
    expect(process.events).toHaveLength(2);
    expect(process.transitions).toHaveLength(2);
  });

  it("should throw on invalid YAML syntax", () => {
    expect(() => parseProcess("invalid: yaml: syntax:")).toThrow(ProcessParseError);
  });

  it("should throw on missing required fields", () => {
    const invalidYaml = `
process:
  id: test
`;
    expect(() => parseProcess(invalidYaml)).toThrow(ProcessParseError);
  });

  it("should parse process with guards", () => {
    const yamlWithGuards = `
process:
  id: guarded-process
  version: "1.0.0"
  name: Guarded Process
  initial_state: start

states:
  - name: start
  - name: end
    is_final: true

events:
  - name: submit
    allowed_roles: [agent]

transitions:
  - from: start
    event: submit
    to: end
    guard: has_doc

guards:
  has_doc:
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
    const process = parseProcess(yamlWithGuards);
    expect(process.guards).toHaveProperty("has_doc");
    expect(process.guards.has_doc.type).toBe("artifact");
    expect(process.guards.has_doc.condition).toBe("exists");
  });

  it("should parse count guard", () => {
    const yamlWithCountGuard = `
process:
  id: count-process
  version: "1.0.0"
  name: Count Process
  initial_state: start

states:
  - name: start
  - name: end
    is_final: true

events:
  - name: submit
    allowed_roles: [agent]

transitions:
  - from: start
    event: submit
    to: end
    guard: enough_items

guards:
  enough_items:
    type: artifact
    artifact_type: item
    condition: count
    min_count: 3

artifacts:
  - type: item
    description: Required item

roles:
  - name: agent
    allowed_events: [submit]
`;
    const process = parseProcess(yamlWithCountGuard);
    expect(process.guards.enough_items.condition).toBe("count");
    expect((process.guards.enough_items as { min_count: number }).min_count).toBe(3);
  });
});

describe("Process Validator", () => {
  it("should validate a valid process", () => {
    const process = parseProcess(validProcessYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should detect invalid initial state", () => {
    const invalidYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: nonexistent

states:
  - name: start
  - name: end
    is_final: true

events: []
transitions: []
roles: []
`;
    const process = parseProcess(invalidYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_INITIAL_STATE")).toBe(true);
  });

  it("should detect duplicate state names", () => {
    const duplicateYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: start

states:
  - name: start
  - name: start
  - name: end
    is_final: true

events: []
transitions: []
roles: []
`;
    const process = parseProcess(duplicateYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_STATE_NAME")).toBe(true);
  });

  it("should detect missing final state", () => {
    const noFinalYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: start

states:
  - name: start

events: []
transitions: []
roles: []
`;
    const process = parseProcess(noFinalYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "NO_FINAL_STATE")).toBe(true);
  });

  it("should detect invalid transition references", () => {
    const invalidTransitionYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: start

states:
  - name: start
  - name: end
    is_final: true

events:
  - name: go
    allowed_roles: [agent]

transitions:
  - from: start
    event: go
    to: nonexistent

roles:
  - name: agent
    allowed_events: [go]
`;
    const process = parseProcess(invalidTransitionYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_TRANSITION_TO")).toBe(true);
  });

  it("should detect unreachable states", () => {
    const unreachableYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: start

states:
  - name: start
  - name: unreachable
  - name: end
    is_final: true

events:
  - name: finish
    allowed_roles: [agent]

transitions:
  - from: start
    event: finish
    to: end

roles:
  - name: agent
    allowed_events: [finish]
`;
    const process = parseProcess(unreachableYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "UNREACHABLE_STATE")).toBe(true);
  });

  it("should detect wildcard role mixed with others", () => {
    const wildcardMixedYaml = `
process:
  id: test
  version: "1.0.0"
  name: Test
  initial_state: start

states:
  - name: start
  - name: end
    is_final: true

events:
  - name: go
    allowed_roles: ["*", agent]

transitions:
  - from: start
    event: go
    to: end

roles:
  - name: agent
    allowed_events: [go]
`;
    const process = parseProcess(wildcardMixedYaml);
    const result = validateProcess(process);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_WILDCARD_ROLE")).toBe(true);
  });
});
