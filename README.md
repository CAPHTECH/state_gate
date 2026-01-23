# state_gate

An orchestrator that governs, visualizes, and makes auditable the development and exploration work of AI agents (such as Claude Code) through external state machines.

## Overview

state_gate treats agents not as "smart entities that remember processes," but as **executors that generate and submit actions and artifacts required by the state machine**. This enables:

- Explicit processes and auditability
- Consistency across multiple agents/teams
- Process diversity absorbed through state/transition/guard definitions rather than proliferating skills

## Key Features

- **State-Driven**: Agent behavior is determined by the state machine
- **Evidence Submission Model**: Agents submit evidence, not transition commands
- **Guard Conditions**: Control transitions through artifact requirements, machine verification, approvals, etc.
- **Audit Logs**: Record all events and decision results
- **Optimistic Locking**: Ensure consistency in concurrent execution through revision numbers

## Use Cases

- Iterative processes including exploration, implementation, evaluation, and review
- Particularly designed for **instant prototyping** (short loops in exploration phase)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ MCP Server  │  │ Hook Adapter │  │ HTTP API / CLI     │  │
│  │ (Dialog)    │  │ (Execution)  │  │ (Integration)      │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      State Engine                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Process Definition → Event → Guard Eval → Transition │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ Artifact Store │ │ Audit/Event  │ │ Context/Run      │
│ (Source)       │ │ Log          │ │ Management       │
└────────────────┘ └──────────────┘ └──────────────────┘
```

## Documentation

- [Architecture](docs/architecture.md)
- [Core Concepts](docs/concepts.md)
- [Process DSL Specification](docs/process-dsl.md)
- [MCP Interface](docs/mcp-interface.md)
- [Hook Adapter](docs/hook-adapter.md)
- [Security](docs/security.md)
- [MVP Requirements](docs/mvp.md)
- [Examples](examples/exploration/README.md)

## Design Principles

1. **Truth lives in state_gate** - Don't rely on agent memory
2. **state_gate decides transitions** - Agents focus on evidence submission
3. **Process differences are contained in DSL** - Don't absorb them through skills proliferation
4. **Handle conflicts and retries in specification** - revision / idempotency / audit

## Quick Start

### Local Development

```bash
npm install
npm run build
npm link
```

```bash
mkdir -p .state_gate/processes
cp examples/exploration/exploration-process.yaml .state_gate/processes/exploration-process.yaml
```

```bash
state-gate create-run --process-id exploration-process
state-gate get-state --run-id <run_id>
state-gate list-events --run-id <run_id> --include-blocked true
```

All CLI output is JSON format.
Define tool execution permissions in `tool_permissions` for each state (within process definition).
`emit-event` accumulates artifact_paths and saves them in the latest row.

See `examples/exploration/README.md` for detailed instructions.

### MCP Server

```bash
state-gate serve --process=./path/to/process.yaml
```

### Hook Adapter (PreToolUse)

```bash
state-gate-hook pre-tool-use --tool-name Edit --tool-input '{"path":"README.md"}'
```

stdin input example:

```bash
echo '{"tool_name":"Edit","tool_input":{"path":"README.md"}}' | state-gate-hook pre-tool-use
```

Error behavior follows fail-open/fail-close settings in `docs/hook-adapter.md`.

## Use as Claude Code Plugin

state_gate is distributed as a Claude Code Plugin and can be installed easily.

### Installation

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

### What Gets Installed

When you install the plugin, the following become automatically available:

- **MCP Server**: `mcp__state-gate__*` tool suite (`get_state`, `emit_event`, `list_events`, etc.)
- **PreToolUse Hook**: Permission checks before tool execution (based on `tool_permissions` in process definition)
- **PostToolUse Hook**: State display after event emission (automatically inserts new state prompt)
- **SessionStart Hook**: State display after compaction

### After npm Publication

The plugin uses `npx -y state-gate` internally, so you need to publish the npm package first:

```bash
npm publish
```

After publication, users can use the plugin without any prior installation (npx automatically downloads and caches the package).

### Usage in Projects

Create a Run in your project directory to automatically start state management:

```bash
# Create Run (saved in .state_gate/state-gate.json)
state-gate create-run --process-id exploration-process --write-config

# Check state (also available via MCP server)
state-gate get-state
```

See `examples/exploration/README.md` and `CLAUDE.md` for details.

## License

MIT

## Contributing

Issues and Pull Requests are welcome.
