/**
 * Hook Adapter module
 */

export { handlePreToolUse } from "./adapter.js";
export type { HookAdapterOptions } from "./adapter.js";
export {
  loadHookPolicy,
  evaluateHookPolicy,
} from "./policy.js";
export type {
  HookPolicy,
  HookPolicyDecision,
  HookPolicyEvaluationInput,
  StateToolPermissions,
  ToolRestriction,
} from "./policy.js";
