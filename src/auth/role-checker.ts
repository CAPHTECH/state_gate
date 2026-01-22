/**
 * 権限チェッカー
 * ロールベースのアクセス制御
 * @see src/types/process.ts
 */

import type { EventDefinition, Transition } from "../types/index.js";

/**
 * 権限チェック結果
 */
export interface RoleCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * イベント発行権限をチェック
 * @param event - イベント定義
 * @param role - チェック対象のロール
 * @returns チェック結果
 */
export function checkEventPermission(
  event: EventDefinition,
  role: string
): RoleCheckResult {
  const allowedRoles = event.allowed_roles;

  // "*" があれば全ロールに許可
  if (allowedRoles.includes("*")) {
    return { allowed: true };
  }

  // ロールが許可リストに含まれているか
  if (allowedRoles.includes(role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Role '${role}' is not allowed to emit event '${event.name}'`,
  };
}

/**
 * 遷移実行権限をチェック
 * @param transition - 遷移定義
 * @param role - チェック対象のロール
 * @returns チェック結果
 */
export function checkTransitionPermission(
  transition: Transition,
  role: string
): RoleCheckResult {
  // allowed_roles が未定義の場合は許可
  const allowedRoles = transition.allowed_roles;
  if (!allowedRoles) {
    return { allowed: true };
  }

  // "*" があれば全ロールに許可
  if (allowedRoles.includes("*")) {
    return { allowed: true };
  }

  // ロールが許可リストに含まれているか
  if (allowedRoles.includes(role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Role '${role}' is not allowed for transition from '${transition.from}' to '${transition.to}'`,
  };
}

/**
 * イベント発行 + 遷移の両方の権限をチェック
 * @param event - イベント定義
 * @param transition - 遷移定義
 * @param role - チェック対象のロール
 * @returns チェック結果
 */
export function checkFullPermission(
  event: EventDefinition,
  transition: Transition,
  role: string
): RoleCheckResult {
  // イベント発行権限チェック
  const eventCheck = checkEventPermission(event, role);
  if (!eventCheck.allowed) {
    return eventCheck;
  }

  // 遷移実行権限チェック
  return checkTransitionPermission(transition, role);
}

/**
 * ロールがイベント発行可能かどうかを確認（遷移なし）
 * list_events などで使用
 */
export function canEmitEvent(
  event: EventDefinition,
  role: string
): boolean {
  const result = checkEventPermission(event, role);
  return result.allowed;
}

/**
 * ロールが遷移可能かどうかを確認
 */
export function canExecuteTransition(
  transition: Transition,
  role: string
): boolean {
  const result = checkTransitionPermission(transition, role);
  return result.allowed;
}
