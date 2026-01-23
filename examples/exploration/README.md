# Example: Exploration Process

This example demonstrates a minimal exploration loop for hypothesis-driven investigation using state_gate.

## Overview

The exploration process follows a scientific method loop:
1. **Frame**: Define problem and hypothesis
2. **Experiment**: Design experiments
3. **Observe**: Execute and record observations
4. **Synthesize**: Analyze findings
5. **Decide**: Iterate or complete

Each state enforces specific tool permissions and requires artifact submission before transitioning.

## Setup

### 1. Build and Install

```bash
npm install
npm run build
npm link
```

### 2. Install Process Definition

```bash
mkdir -p .state_gate/processes
cp examples/exploration/exploration-process.yaml .state_gate/processes/exploration-process.yaml
```

## Usage Methods

### Method 1: CLI (Manual)

#### Create a Run

```bash
state-gate create-run --process-id exploration-process --write-config
```

The `--write-config` flag saves the Run ID to `.state_gate/state-gate.json` for automatic reference in subsequent commands.

#### Check Current State

```bash
state-gate get-state
```

#### Submit Artifacts and Emit Events

```bash
# 1. Frame: Submit hypothesis
mkdir -p evidence
cat > evidence/hypothesis.md << EOF
# Hypothesis

**Problem**: Understanding the state machine pattern in this codebase

**Hypothesis**: The state machine uses CSV for event sourcing

**Expected Outcome**: Find CSV-based state storage implementation
EOF

state-gate emit-event \
  --event submit_hypothesis \
  --expected-revision 0 \
  --idempotency-key hyp-$(date +%s) \
  --artifact-paths "evidence/hypothesis.md"

# 2. Experiment: Submit plan
cat > evidence/experiment_plan.md << EOF
# Experiment Plan

1. Search for CSV file operations in src/
2. Examine run storage implementation
3. Trace state transitions in code
EOF

state-gate emit-event \
  --event submit_experiment_plan \
  --expected-revision 1 \
  --idempotency-key plan-$(date +%s) \
  --artifact-paths "evidence/experiment_plan.md"

# 3. Observe: Submit observations
cat > evidence/observation.md << EOF
# Observations

- Found csv-store.ts handling Run persistence
- Each Run stored as separate CSV file
- Events are append-only rows
EOF

state-gate emit-event \
  --event submit_observation \
  --expected-revision 2 \
  --idempotency-key obs-$(date +%s) \
  --artifact-paths "evidence/observation.md"

# 4. Synthesize: Submit synthesis
cat > evidence/synthesis.md << EOF
# Synthesis

**Findings**:
- Hypothesis CONFIRMED: CSV is used for event sourcing
- Simple, auditable, file-based persistence
- Event sourcing pattern with append-only log

**Insights**:
- No database dependency needed
- Easy to inspect and debug
- Optimistic locking via revision numbers

**Recommendation**: Documentation is sufficient
EOF

state-gate emit-event \
  --event submit_synthesis \
  --expected-revision 3 \
  --idempotency-key syn-$(date +%s) \
  --artifact-paths "evidence/synthesis.md"

# 5. Decide: Finalize
state-gate emit-event \
  --event finalize \
  --expected-revision 4 \
  --idempotency-key final-$(date +%s)
```

### Method 2: MCP Server (Programmatic)

Start the MCP server with the process definition:

```bash
state-gate serve --process .state_gate/processes/exploration-process.yaml
```

Use MCP tools from your client (Claude Code, etc.):

```javascript
// Create run
mcp__state-gate__state_gate_create_run({
  process_id: "exploration-process"
})

// Get current state
mcp__state-gate__state_gate_get_state()

// Emit event
mcp__state-gate__state_gate_emit_event({
  event_name: "submit_hypothesis",
  expected_revision: 0,
  idempotency_key: "hyp-001",
  artifact_paths: ["evidence/hypothesis.md"]
})
```

### Method 3: Claude Code Plugin (Recommended)

If you've installed state-gate as a Claude Code plugin:

```bash
# The plugin automatically starts the MCP server
# Just create a run:
state-gate create-run --process-id exploration-process --write-config

# Claude Code will now:
# - Check tool permissions before execution (PreToolUse hook)
# - Display state after transitions (PostToolUse hook)
# - Show state after conversation compaction (SessionStart hook)
```

Use MCP tools directly in conversation:
- Get state: `mcp__state-gate__state_gate_get_state`
- Emit events: `mcp__state-gate__state_gate_emit_event`

## Tool Permissions by State

The process defines different tool permissions for each state:

| State       | Allowed Tools                               | Denied Tools | Ask Tools |
|-------------|---------------------------------------------|--------------|-----------|
| frame       | Read, Glob, Grep, Write, WebSearch, WebFetch | Edit, Bash   | -         |
| experiment  | Read, Glob, Grep, Write                      | Edit, Bash   | -         |
| observe     | Read, Glob, Grep, Write, Bash                | -            | Edit      |
| synthesize  | Read, Glob, Grep, Write                      | -            | -         |
| decide      | Read                                         | -            | -         |
| complete    | Read                                         | -            | -         |

## Notes

- **Artifact Paths**: Use relative paths (e.g., `evidence/hypothesis.md`). Absolute paths and `..` are rejected.
- **Idempotency Keys**: Must be unique per event. Use timestamps or UUIDs.
- **Expected Revision**: Must match current revision for optimistic locking.
- **Revision Numbers**: Increment with each successful transition (0 → 1 → 2 → ...).
- **Tool Permissions**: Enforced by PreToolUse hook when using Claude Code plugin.

## Inspecting State

Check the Run CSV file directly:

```bash
cat .state_gate/runs/run-*.csv
```

Format: `timestamp,state,revision,event,idempotency_key,artifact_paths`

## Common Issues

### Revision Conflict

```json
{
  "error": "Revision conflict",
  "code": "REVISION_CONFLICT"
}
```

Solution: Get current state and retry with updated revision number.

### Guard Failed

```json
{
  "error": "Guard failed: artifact_exists",
  "code": "GUARD_FAILED"
}
```

Solution: Ensure required artifact files exist before emitting event.

### Tool Denied

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  }
}
```

Solution: Tool is not allowed in current state. Check `tool_permissions` in process definition.

## Further Reading

- [Process DSL Specification](../../docs/process-dsl.md)
- [MCP Interface](../../docs/mcp-interface.md)
- [Hook Adapter](../../docs/hook-adapter.md)
