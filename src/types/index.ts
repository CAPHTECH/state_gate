/**
 * 型定義のエクスポート
 */

// Common
export type { JSONSchema, JSONSchemaType } from "./common.js";

// Process DSL
export type {
  Process,
  State,
  EventDefinition,
  Transition,
  Guard,
  ArtifactGuard,
  ArtifactExistsGuard,
  ArtifactCountGuard,
  RoleDefinition,
  KnownContextVariables,
  ContextVariables,
} from "./process.js";

// Run 管理
export type {
  RunId,
  RunEntry,
  ParsedRunEntry,
  RunState,
  CreateRunParams,
  CreateRunResult,
} from "./run.js";
export { RUN_FILE_PATTERN, CSV_HEADERS } from "./run.js";

// Artifact
export type {
  ArtifactDefinition,
  ArtifactRef,
  ArtifactStatus,
  RequiredArtifact,
} from "./artifact.js";

// MCP インターフェース
export type {
  // get_state
  GetStateRequest,
  GetStateResponse,
  MissingGuard,
  AllowedEvent,
  // list_events
  ListEventsRequest,
  ListEventsResponse,
  GuardStatus,
  EventTransition,
  EventInfo,
  // emit_event
  EmitEventRequest,
  EmitEventResponse,
  EmitEventSuccessResult,
  EmitEventError,
  EmitEventErrorCode,
  EmitEventErrorDetails,
  EmitEventTransition,
  ValidationError,
  // Hook Adapter
  PreToolUseInput,
  PreToolUseOutput,
  HookDecision,
} from "./mcp.js";
