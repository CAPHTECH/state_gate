# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-01

### Added
- Per-run artifact isolation
  - Artifacts are now stored in `.state_gate/artifacts/{run_id}/` for each run
  - New `ArtifactStore` class for managing run-specific artifact directories
  - `artifact_base_path` field added to `RunMetadata` and `GetStateResponse`
  - Agents specify relative paths (e.g., `evidence/hypothesis.md`), state_gate resolves to full path
  - Prevents artifact conflicts between parallel runs and simplifies cleanup
- `getRunMetadata()` method added to `StateEngine`

### Changed
- Artifact checker functions (`checkArtifact`, `checkArtifacts`, `hasAnyArtifact`, `countPresentArtifacts`) now accept optional `basePath` parameter
- Guard evaluation context (`GuardEvaluationContext`) includes `artifactBasePath` for proper path resolution

### Fixed
- Test script changed from `vitest` to `vitest run` for explicit CI execution
- Project root resolution now converts relative paths to absolute paths

### Migration Notes
- Existing runs without `artifact_base_path` continue to work (backward compatible)
- New runs automatically use the new per-run artifact directory structure

## [0.2.6] - 2026-01-28

### Changed
- Plugin no longer includes MCP server configuration
  - Removed `.mcp.json` from plugin distribution
  - Users must configure MCP server in project's `.mcp.json` with `STATE_GATE_PROJECT_ROOT` env var
  - This ensures correct working directory for each project

### Documentation
- Added "MCP Server Configuration" section to README
  - Explains how to configure `.mcp.json` for each project
  - Clarifies that plugin provides hooks only, not MCP server

## [0.2.5] - 2026-01-28

### Added
- Plugin MCP now uses `STATE_GATE_PROJECT_ROOT` environment variable for working directory
  - Automatically set to `${PWD}` in plugin `.mcp.json`
  - MCP server reads the environment variable to determine project root
  - Enables state-gate to work correctly when plugin is enabled in different projects

## [0.2.4] - 2026-01-28

### Fixed
- Plugin hooks.json format updated for Claude Code compatibility
  - Added top-level `hooks` key to match new plugin loader schema
  - Fixes "Invalid input: expected record, received undefined" error

## [0.2.3] - 2026-01-28

### Added
- Dynamic process loading in StateEngine
  - Processes are now automatically loaded from `.state_gate/processes/` when needed
  - `getProcessAsync()` method for on-demand process loading with caching
  - Supports both `.yaml` and `.yml` extensions
  - Process is determined from run metadata, eliminating need for `--process` option in plugin MCP

### Fixed
- Plugin MCP `PROCESS_NOT_FOUND` error when using hooks without pre-registering processes

## [0.2.2] - 2026-01-28

### Fixed
- ArtifactGuard type matching is now case-insensitive
  - Files like `VERIFICATION_REPORT.md` now match `artifact_type: verification_report`
  - Both filename and artifact_type are converted to lowercase for comparison

## [0.2.1] - 2026-01-28

### Fixed
- ContextGuard not working in `get_state` and `list_events` MCP tools
  - `GuardEvaluationContext` was missing the `context` property in handlers
  - Context variable-based guards were always treated as undefined

## [0.2.0] - 2026-01-28

### Added
- ContextGuard: Context variable-based guard conditions for state transitions
  - `equals` / `not_equals`: Exact value matching
  - `in` / `not_in`: Value membership in array
  - `exists` / `not_exists`: Variable existence check
- Support for primitive types in context guards: string, number, boolean, null
- Multi-transition fallback: When guarded transition fails, falls back to guardless transitions
- E2E integration tests for ContextGuard feature (22 new tests)
- Updated Process DSL documentation with ContextGuard examples

### Changed
- Guard type extended to discriminated union: `ArtifactGuard | ContextGuard`
- emit-event now evaluates multiple transitions per DSL spec:
  1. Guarded transitions evaluated first
  2. First satisfied guard wins
  3. Falls back to guardless transition if all guards fail

### Fixed
- emit-event transition selection now correctly follows DSL "遷移の選択ルール" specification

## [0.1.0] - 2026-01-23

### Added
- Initial public release of state_gate (published as `@caphtech/state-gate` on npm)
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

[0.2.6]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.6
[0.2.5]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.5
[0.2.4]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.4
[0.2.3]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.3
[0.2.2]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.2
[0.2.1]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.1
[0.2.0]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.2.0
[0.1.0]: https://github.com/CAPHTECH/state_gate/releases/tag/v0.1.0
