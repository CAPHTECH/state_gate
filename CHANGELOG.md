# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-23

### Added
- Initial public release of state_gate
- State machine orchestration for AI agents
- MCP (Model Context Protocol) server with tools:
  - `state_gate_get_state`: Get current state and prompt
  - `state_gate_emit_event`: Emit event to transition state
  - `state_gate_list_events`: List available events
  - `state_gate_create_run`: Create a new Run
  - `state_gate_list_runs`: List all Runs
- Claude Code hooks integration:
  - PreToolUse hook for tool permission control
  - PostToolUse hook for automatic state display after transitions
  - SessionStart hook for state display after compaction
- Process DSL for defining state machines in YAML
  - States with prompts and tool permissions
  - Events and transitions
  - Guard conditions (artifact_exists, artifact_count)
  - Role-based access control
- Tool permissions system:
  - Per-state tool control (allowed, denied, ask)
  - Embedded in process definitions
  - Enforced by PreToolUse hook
- CLI commands:
  - `state-gate create-run`: Create new Run
  - `state-gate get-state`: Get current state
  - `state-gate list-events`: List available events
  - `state-gate emit-event`: Emit event with artifacts
  - `state-gate serve`: Start MCP server
  - `state-gate-hook pre-tool-use`: PreToolUse hook handler
  - `state-gate-hook post-tool-use`: PostToolUse hook handler
- Claude Code Plugin distribution support
  - Plugin structure with hooks and MCP server
  - Marketplace.json for plugin distribution
  - Automatic installation via npx
- CSV-based event sourcing for Run storage
- Optimistic locking via revision numbers
- Idempotency via unique keys
- Artifact tracking and validation
- File locking for concurrent access safety
- Comprehensive test suite (124 tests)
- English documentation
- Example: exploration-process workflow
- Release process documentation and skill

### Changed
- N/A (initial release)

### Fixed
- N/A (initial release)

[0.1.0]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.1.0
