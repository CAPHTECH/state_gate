/**
 * Guard 評価の型定義
 * @see docs/process-dsl.md
 */

/**
 * ガード評価結果
 */
export interface GuardEvaluationResult {
  /** ガードが充足されたか */
  satisfied: boolean;
  /**
   * ガード名
   * @term Process.guards のキーを参照
   */
  guard_name: string;
  /**
   * 未充足時の理由リスト
   * satisfied === false の場合に設定
   */
  missing_requirements?: string[];
}

/**
 * 複数ガードの評価結果
 */
export interface GuardsEvaluationResult {
  /** すべてのガードが充足されたか */
  all_satisfied: boolean;
  /** 個別のガード評価結果 */
  results: GuardEvaluationResult[];
}

/**
 * 遷移のガード評価情報
 * StateEngine.getAvailableEvents() の戻り値で使用
 */
export interface TransitionGuardInfo {
  /**
   * 遷移先の状態
   * @term Process.states[].name を参照
   */
  toState: string;
  /** ガードが充足されたか */
  guardSatisfied: boolean;
  /**
   * ガード条件の名前（オプション）
   * @term Process.guards のキーを参照
   */
  guardName?: string;
  /** 未充足時の理由リスト */
  missingRequirements?: string[];
}

/**
 * 利用可能イベント情報
 * StateEngine.getAvailableEvents() の戻り値で使用
 */
export interface AvailableEventInfo {
  /**
   * イベント名
   * @term Process.events[].name を参照
   */
  eventName: string;
  /** イベントの説明 */
  description?: string;
  /** このイベントで可能な遷移のリスト */
  transitions: TransitionGuardInfo[];
}
