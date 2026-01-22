/**
 * State Gate - AI Agent State Machine Orchestrator
 * @module state-gate
 */

// Types
export * from "./types/index.js";

// Process
export { parseProcess, parseProcessFile, ProcessParseError } from "./process/index.js";
export { validateProcess } from "./process/index.js";

// Run
export { CsvStore, CsvStoreError } from "./run/index.js";
export { MetadataStore, MetadataStoreError } from "./run/index.js";

// Artifact
export {
  checkArtifact,
  checkArtifacts,
  hasAnyArtifact,
  hasMinArtifacts,
  countPresentArtifacts,
  filterPathsByArtifactType,
} from "./artifact/index.js";

// Guard
export { evaluateGuard, evaluateGuards, evaluateTransitionGuard } from "./guard/index.js";

// Auth
export {
  checkEventPermission,
  checkTransitionPermission,
  checkFullPermission,
  canEmitEvent,
  canExecuteTransition,
} from "./auth/index.js";

// Engine
export { StateEngine, StateEngineError } from "./engine/index.js";
export { handleGetState } from "./engine/index.js";
export { handleListEvents } from "./engine/index.js";
export { handleEmitEvent } from "./engine/index.js";

// MCP
export { createMcpServer, startMcpServer } from "./mcp/index.js";
