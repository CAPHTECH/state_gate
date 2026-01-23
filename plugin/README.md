# state-gate Claude Code Plugin

An orchestrator that governs, visualizes, and makes auditable AI agent workflows through external state machines.

## Overview

state-gate is a plugin that governs, visualizes, and makes auditable the development and exploration work of AI agents like Claude Code through external state machines.

It treats agents not as "smart entities that remember processes," but as **executors that generate and submit actions and artifacts required by the state machine**.

## Key Features

### MCP Server
- `state_gate_get_state`: Get current state and prompt
- `state_gate_emit_event`: Emit event to transition state
- `state_gate_list_events`: List available events
- `state_gate_create_run`: Create a new Run
- `state_gate_list_runs`: List all Runs

### Hooks
- **PreToolUse**: Permission checks before tool execution (based on `tool_permissions` in process definition)
- **PostToolUse**: State display after event emission (automatically inserts new state prompt)
- **SessionStart**: State display after compaction

## Installation

### Prerequisites

state-gate uses npx, so the npm package must be published.

```bash
npm install -g @caphtech/state-gate
```

Or, npx will automatically download it on first execution.

### Installation in Claude Code

#### Method 1: From Marketplace (Recommended)

```bash
# Add marketplace
/plugin marketplace add https://github.com/CAPHTECH/state_gate

# Install plugin
/plugin install state-gate
```

#### Method 2: Direct from GitHub

```bash
/plugin install https://github.com/CAPHTECH/state_gate/tree/main/plugin
```

## Usage

### 1. Create a Run

Create a Run based on a process in your project directory:

```bash
state-gate create-run --process-id exploration-process --write-config
```

This saves the Run ID to `.state_gate/state-gate.json` and is automatically referenced in subsequent commands.

### 2. Check State

Check current state via MCP tool or CLI:

```bash
# CLI
state-gate get-state

# In Claude Code
Execute mcp__state-gate__state_gate_get_state
```

### 3. Perform Work

Follow the current state's prompt to perform work and create artifacts.

### 4. Emit Event

After completing work, emit an event with artifacts:

```bash
# As MCP tool
Use mcp__state-gate__state_gate_emit_event and specify:
- event_name: Event name to emit
- expected_revision: Current revision number
- idempotency_key: Unique key
- artifact_paths: Array of created artifact paths
```

### 5. State Transition

state_gate evaluates guard conditions and automatically transitions to the next state if conditions are met.
The PostToolUse hook automatically displays the new state's prompt.

## Process Definition

Place processes in `.state_gate/processes/*.yaml`.

Example: `.state_gate/processes/exploration-process.yaml`

```yaml
id: exploration-process
name: Exploration Process
initial_state: idle
states:
  - name: idle
    description: Waiting for task
    prompt: "Receive task and emit 'start' event"
    tool_permissions:
      allowed: []
  - name: exploring
    description: Exploring the codebase
    prompt: "Explore the codebase and record in exploration.md"
    required_artifacts:
      - path: evidence/exploration.md
    tool_permissions:
      allowed: [Read, Glob, Grep, Write]
      denied: [Edit, Bash]
  # ...
events:
  - name: start
    description: Start exploration
  - name: submit_exploration
    description: Submit exploration results
  # ...
transitions:
  - from: idle
    event: start
    to: exploring
  - from: exploring
    event: submit_exploration
    to: done
    guards:
      - type: artifact_exists
        paths: ["evidence/exploration.md"]
  # ...
```

## Tool Permission Control

Define `tool_permissions` in each state, and the PreToolUse hook will automatically check permissions:

- `allowed`: List of tools to allow
- `denied`: List of tools to deny
- `ask`: List of tools requiring user confirmation

Priority: `denied` > `ask` > `allowed`

## Troubleshooting

### MCP Server Won't Start

```bash
# Check MCP server status
claude mcp list

# Try starting manually
npx -y @caphtech/state-gate serve
```

### Hooks Not Working

```bash
# Check hooks configuration
cat ~/.claude/settings.json | jq '.hooks'

# Check if plugin is correctly installed
/plugin list
```

### Run ID Not Found

Verify that `.state_gate/state-gate.json` exists:

```bash
cat .state_gate/state-gate.json
```

## More Information

- [Main README](../README.md)
- [Architecture](../docs/architecture.md)
- [Process DSL Specification](../docs/process-dsl.md)
- [MCP Interface](../docs/mcp-interface.md)
- [Hook Adapter](../docs/hook-adapter.md)

## License

MIT

## Support

For Issues and Pull Requests, visit the [GitHub repository](https://github.com/CAPHTECH/state_gate).
