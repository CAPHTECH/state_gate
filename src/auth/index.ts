/**
 * Auth モジュール
 */

export {
  checkEventPermission,
  checkTransitionPermission,
  checkFullPermission,
  canEmitEvent,
  canExecuteTransition,
} from "./role-checker.js";
export type { RoleCheckResult } from "./role-checker.js";
