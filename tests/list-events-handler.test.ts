/**
 * list_events handler tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { StateEngine } from "../src/engine/state-engine.js";
import { handleListEvents } from "../src/engine/handlers/list-events.js";
import { parseProcess } from "../src/process/parser.js";

const TEST_RUNS_DIR = ".state_gate_test_list_events_runs";
const TEST_METADATA_DIR = ".state_gate_test_list_events_metadata";

const multiTransitionYaml = `
process:
  id: multi-transition
  version: "1.0.0"
  name: Multi Transition
  initial_state: start

states:
  - name: start
  - name: end_a
    is_final: true
  - name: end_b
    is_final: true

events:
  - name: submit
    allowed_roles: [agent, reviewer]

transitions:
  - from: start
    event: submit
    to: end_a
    allowed_roles: [agent]
  - from: start
    event: submit
    to: end_b
    allowed_roles: [reviewer]

guards: {}

artifacts: []

roles:
  - name: agent
    allowed_events: [submit]
  - name: reviewer
    allowed_events: [submit]
`;

describe("list_events handler", () => {
  let engine: StateEngine;
  const process = parseProcess(multiTransitionYaml);

  beforeEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ignore cleanup errors
    }

    engine = new StateEngine({
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
    });
    engine.registerProcess(process);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      await fs.rm(TEST_METADATA_DIR, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("allows events when at least one transition is permitted", async () => {
    const created = await engine.createRun({
      processId: "multi-transition",
    });

    const response = await handleListEvents(
      engine,
      { run_id: created.run_id },
      "agent"
    );

    expect(response.events).toHaveLength(1);
    const event = response.events[0];
    expect(event?.event_name).toBe("submit");
    expect(event?.is_allowed).toBe(true);
    expect(event?.transitions).toHaveLength(1);
    expect(event?.transitions[0]?.to_state).toBe("end_a");
  });
});
