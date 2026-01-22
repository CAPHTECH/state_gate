# 権限・セキュリティ

state_gate の権限管理。ローカル動作を前提としたシンプルな設計。

---

## ロールモデル

### 標準ロール

| ロール | 説明 | 主な権限 |
|--------|------|----------|
| `agent` | AIエージェント | 証拠提出、作業イベント |
| `human` | 人間の操作者 | 状態遷移を伴う意思決定、承認依頼 |
| `reviewer` | レビュワー | approve/reject |

### ロール定義

```yaml
roles:
  - name: agent
    description: AIエージェント
    allowed_events:
      - submit_evidence
      - request_review
    can_approve: false
    can_reject: false

  - name: human
    description: 人間の操作者
    allowed_events:
      - submit_evidence
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
      - request_changes
    can_approve: true
    can_reject: true
```

---

## 権限チェックのフロー

```
イベント受信
    │
    ▼
┌─────────────────────────┐
│ 1. ロールの識別          │
│    - 環境変数            │
│    - CLI 引数            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. イベント権限チェック   │
│    - allowed_events     │
│    - 遷移の allowed_roles│
└───────────┬─────────────┘
            │ 不許可 → 拒否 (FORBIDDEN)
            │
            ▼
┌─────────────────────────┐
│ 3. 承認権限チェック       │
│    (approve/reject の場合)│
│    - can_approve        │
│    - can_reject         │
└───────────┬─────────────┘
            │ 不許可 → 拒否 (FORBIDDEN)
            │
            ▼
        ガード評価へ
```

---

## 参照中心の設計

Hook/エージェントから state_gate への送信内容は、原則として**参照（artifact_id）**中心にする。

```typescript
// 良い例: 参照を送信
emit_event({
  event_name: 'submit_evidence',
  payload: {
    artifact_refs: ['art-001', 'art-002'],
    summary: '2件の観察結果を提出'
  }
});

// 避けるべき例: コンテンツ全体を送信
emit_event({
  event_name: 'submit_evidence',
  payload: {
    full_content: '...大量のデータ...'
  }
});
```

---

## エージェント固有の制限

```yaml
agent_restrictions:
  # エージェントが実行できないアクション
  prohibited_actions:
    - approve
    - reject

  # コンテンツ制限
  content_limits:
    max_payload_size_kb: 100
```

---

## 脅威と対策

| 脅威 | 対策 |
|------|------|
| エージェントによる不正な状態遷移 | ロールベースの権限制御、ガード条件 |
| リプレイ攻撃 | idempotency_key による冪等性保証 |
| 競合状態の悪用 | revision による楽観ロック |

---

## ベストプラクティス

### 最小権限の原則

```yaml
# 各ロールには必要最小限の権限のみ
roles:
  - name: observation_agent
    allowed_events:
      - submit_observation  # これのみ
```
