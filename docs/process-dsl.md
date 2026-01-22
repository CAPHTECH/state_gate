# Process DSL 仕様

Process 定義のための DSL（Domain Specific Language）仕様。

---

## 設計目標

1. **状態爆発を避ける**: 差分（ドメイン探索/デザイン探索など）を効率的に表現
2. **階層状態のサポート**: HFSM（Hierarchical Finite State Machine）を表現可能
3. **並行領域のサポート**: 直交する関心事を表現可能
4. **可読性**: 人間が読み書きしやすい形式

---

## 基本構造

```yaml
# process.yaml
process:
  id: exploration-process
  version: "1.0.0"
  name: 探索プロセス
  description: ドメイン・デザイン探索のための汎用プロセス
  initial_state: frame  # Run作成時の初期状態

# 状態定義
states:
  - name: frame
    description: 問題の枠組みを定義する
    required_artifacts: [hypothesis]

  - name: experiment
    description: 仮説を検証する実験を行う
    required_artifacts: [experiment_plan]

  - name: observe
    description: 実験結果を観察・記録する
    required_artifacts: [observation]

  - name: synthesize
    description: 観察結果を統合する
    required_artifacts: [synthesis]

  - name: decide
    description: 次のアクションを決定する
    is_final: false

  - name: complete
    description: 探索完了
    is_final: true

# イベント定義
events:
  - name: submit_hypothesis
    description: 仮説を提出
    allowed_roles: [agent, human]
    payload_schema:
      type: object
      required: [hypothesis_text]
      properties:
        hypothesis_text:
          type: string
        rationale:
          type: string

  - name: submit_experiment_plan
    description: 実験計画を提出
    allowed_roles: [agent, human]
    payload_schema:
      type: object
      required: [plan]
      properties:
        plan:
          type: string
        expected_outcomes:
          type: array
          items:
            type: string

  - name: submit_observation
    description: 観察結果を提出
    allowed_roles: [agent, human]
    payload_schema:
      $ref: "#/schemas/observation"

  - name: submit_synthesis
    description: 統合結果を提出
    allowed_roles: [agent, human]

  - name: request_review
    description: レビューを依頼
    allowed_roles: [agent, human]

  - name: approve
    description: 承認
    allowed_roles: [reviewer, human]

  - name: reject
    description: 差し戻し
    allowed_roles: [reviewer, human]
    payload_schema:
      type: object
      required: [reason]
      properties:
        reason:
          type: string

  - name: iterate
    description: 次のイテレーションへ
    allowed_roles: [human]

  - name: finalize
    description: 探索を完了する
    allowed_roles: [human]

# 遷移定義
transitions:
  - from: frame
    event: submit_hypothesis
    to: experiment
    guard: has_hypothesis

  - from: experiment
    event: submit_experiment_plan
    to: observe
    guard: has_experiment_plan

  - from: observe
    event: submit_observation
    to: synthesize
    guard: has_sufficient_observations

  - from: synthesize
    event: submit_synthesis
    to: decide
    guard: has_synthesis

  - from: decide
    event: iterate
    to: frame
    description: 次のイテレーションへ戻る

  - from: decide
    event: finalize
    to: complete
    guard: has_synthesis

# ガード定義（成果物ガードのみ）
guards:
  has_hypothesis:
    type: artifact
    artifact_type: hypothesis
    condition: exists

  has_experiment_plan:
    type: artifact
    artifact_type: experiment_plan
    condition: exists

  has_sufficient_observations:
    type: artifact
    artifact_type: observation
    condition: count
    min_count: 1

  has_synthesis:
    type: artifact
    artifact_type: synthesis
    condition: exists

# 成果物定義
artifacts:
  - type: hypothesis
    description: 検証すべき仮説
    required_in_states: [frame]
    schema:
      type: object
      required: [text]
      properties:
        text:
          type: string
        rationale:
          type: string
        assumptions:
          type: array
          items:
            type: string

  - type: experiment_plan
    description: 実験計画
    required_in_states: [experiment]

  - type: observation
    description: 観察結果
    required_in_states: [observe]
    schema:
      type: object
      required: [findings, confidence_level]
      properties:
        findings:
          type: string
        confidence_level:
          type: string
          enum: [high, medium, low]
        evidence_refs:
          type: array
          items:
            type: string
        screenshots:
          type: array
          items:
            type: string

  - type: synthesis
    description: 統合結果
    required_in_states: [synthesize]

# ロール定義
roles:
  - name: agent
    description: AIエージェント
    allowed_events:
      - submit_hypothesis
      - submit_experiment_plan
      - submit_observation
      - submit_synthesis
      - request_review
    can_approve: false
    can_reject: false

  - name: human
    description: 人間の操作者
    allowed_events:
      - submit_hypothesis
      - submit_experiment_plan
      - submit_observation
      - submit_synthesis
      - request_review
      - iterate
      - finalize
    can_approve: false
    can_reject: false

  - name: reviewer
    description: レビュワー
    allowed_events:
      - approve
      - reject
    can_approve: true
    can_reject: true

# スキーマ定義（再利用用）
schemas:
  observation:
    type: object
    required: [findings]
    properties:
      findings:
        type: string
      confidence_level:
        type: string
        enum: [high, medium, low]
      compared_with:
        type: array
        items:
          type: string
      time_spent_seconds:
        type: integer
      screenshots:
        type: array
        items:
          type: string
      videos:
        type: array
        items:
          type: string
```

---

## ガード条件の詳細

### 成果物ガード

```yaml
guards:
  # 存在チェック
  has_hypothesis:
    type: artifact
    artifact_type: hypothesis
    condition: exists

  # 件数チェック
  enough_observations:
    type: artifact
    artifact_type: observation
    condition: count
    min_count: 3

  # フィールドチェック
  complete_observation:
    type: artifact
    artifact_type: observation
    condition: has_fields
    required_fields:
      - findings
      - confidence_level
      - evidence_refs
```

---

## コンテキスト変数の初期化

```yaml
process:
  id: exploration-process
  version: "1.0.0"
  initial_state: frame  # 必須: Run作成時の初期状態

  # 初期コンテキスト
  initial_context:
    exploration_mode: domain
    team_mode: solo
    assumptions: []
    decision_criteria: []

  # コンテキストの制約
  context_schema:
    type: object
    properties:
      exploration_mode:
        type: string
        enum: [domain, design, hybrid]
      team_mode:
        type: string
        enum: [solo, team, async]
```

---

## フックの定義

```yaml
states:
  - name: experiment
    on_enter:
      - action: notify
        channel: slack
        message: "実験フェーズを開始しました"

    on_exit:
      - action: log
        message: "実験フェーズを終了しました"

      - action: collect_metrics
        metrics: [duration, artifact_count]
```

---

## バリデーション

Process 定義は以下の検証を行う:

1. **構造検証**: 必須フィールドの存在
2. **参照検証**: 遷移で参照される状態・イベント・ガードの存在
3. **到達可能性**: すべての状態が到達可能
4. **終端検証**: 少なくとも1つの終端状態が存在
5. **ガード検証**: ガード条件の論理的整合性
