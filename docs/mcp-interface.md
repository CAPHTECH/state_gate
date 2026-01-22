# MCP インターフェース

state_gate の MCP (Model Context Protocol) インターフェース仕様。

---

## 概要

MCP は**対話面**のインターフェースとして機能し、エージェントが以下を行う:

- 現在の状態を問い合わせる
- 許可されるイベントを確認する
- イベントを発行する

---

## Tools

### state_gate.get_state

現在の状態と関連情報を取得する。

**パラメータ**:
```typescript
{
  run_id: string;  // 実行ID
}
```

**レスポンス**:
```typescript
{
  run_id: string;
  process_id: string;
  process_version: string;

  current_state: string;
  revision: number;

  context: Record<string, unknown>;

  // 未充足のガード（遷移を阻害している条件）
  missing_guards: Array<{
    guard_name: string;
    description: string;
    current_status: string;
  }>;

  // この状態で必要な成果物
  required_artifacts: Array<{
    type: string;
    description: string;
    status: 'missing' | 'present';  // MVP: ファイル存在チェックのみ
  }>;

  // 現在発行可能なイベント
  allowed_events: Array<{
    event_name: string;
    description: string;
    payload_schema?: JSONSchema;
  }>;

  updated_at: string;
}
```

**使用例**:
```json
// リクエスト
{
  "tool": "state_gate.get_state",
  "arguments": {
    "run_id": "run-550e8400-e29b-41d4-a716-446655440000"
  }
}

// レスポンス
{
  "run_id": "run-550e8400-e29b-41d4-a716-446655440000",
  "process_id": "exploration-process",
  "process_version": "1.0.0",
  "current_state": "experiment",
  "revision": 3,
  "context": {
    "exploration_mode": "domain",
    "team_mode": "solo"
  },
  "missing_guards": [
    {
      "guard_name": "has_experiment_plan",
      "description": "実験計画が必要です",
      "current_status": "成果物 'experiment_plan' が未提出"
    }
  ],
  "required_artifacts": [
    {
      "type": "experiment_plan",
      "description": "実験計画",
      "status": "missing"
    }
  ],
  "allowed_events": [
    {
      "event_name": "submit_experiment_plan",
      "description": "実験計画を提出",
      "payload_schema": {
        "type": "object",
        "required": ["plan"],
        "properties": {
          "plan": { "type": "string" }
        }
      }
    }
  ],
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

### state_gate.list_events

現在の状態で発行可能なイベントの詳細を取得する。

**パラメータ**:
```typescript
{
  run_id: string;
  include_blocked?: boolean;  // ガードで阻害されているイベントも含めるか
}
```

**レスポンス**:
```typescript
{
  run_id: string;
  current_state: string;

  events: Array<{
    event_name: string;
    description: string;
    payload_schema?: JSONSchema;

    // このイベントで可能な遷移
    transitions: Array<{
      to_state: string;
      guard?: string;
      guard_status: 'satisfied' | 'unsatisfied' | 'no_guard';
      missing_requirements?: string[];
    }>;

    is_allowed: boolean;  // 現在発行可能か
    blocked_reason?: string;
  }>;
}
```

**使用例**:
```json
// リクエスト
{
  "tool": "state_gate.list_events",
  "arguments": {
    "run_id": "run-550e8400-e29b-41d4-a716-446655440000",
    "include_blocked": true
  }
}

// レスポンス
{
  "run_id": "run-550e8400-e29b-41d4-a716-446655440000",
  "current_state": "observe",
  "events": [
    {
      "event_name": "submit_observation",
      "description": "観察結果を提出",
      "payload_schema": { ... },
      "transitions": [
        {
          "to_state": "synthesize",
          "guard": "has_sufficient_observations",
          "guard_status": "unsatisfied",
          "missing_requirements": ["観察件数が不足 (現在: 1, 必要: 3)"]
        }
      ],
      "is_allowed": true,
      "blocked_reason": null
    },
    {
      "event_name": "submit_synthesis",
      "description": "統合結果を提出",
      "transitions": [
        {
          "to_state": "decide",
          "guard": "has_synthesis",
          "guard_status": "unsatisfied",
          "missing_requirements": ["synthesis が必要"]
        }
      ],
      "is_allowed": false,
      "blocked_reason": "現在の状態では発行できません（synthesize 状態でのみ発行可能）"
    }
  ]
}
```

---

### state_gate.emit_event

イベントを発行する。

**パラメータ**:
```typescript
{
  run_id: string;
  event_name: string;
  payload?: Record<string, unknown>;
  expected_revision: number;     // 必須: 楽観ロック
  idempotency_key: string;       // 必須: 冪等性保証

  // 成果物の添付（任意）
  artifact_paths?: string[];  // ファイルパスの配列
}
```

**レスポンス**:
```typescript
{
  success: boolean;

  // 成功時
  result?: {
    event_id: string;
    accepted: true;

    transition?: {
      from_state: string;
      to_state: string;
    };

    new_revision: number;
  };

  // 失敗時
  error?: {
    code: 'REVISION_CONFLICT' | 'FORBIDDEN' | 'GUARD_FAILED' |
          'INVALID_EVENT' | 'INVALID_PAYLOAD' | 'IDEMPOTENT_REPLAY';
    message: string;
    details?: {
      current_revision?: number;
      missing_guards?: string[];
      validation_errors?: Array<{ path: string; message: string }>;
    };
  };
}
```

**使用例**:
```json
// リクエスト（証拠提出）
{
  "tool": "state_gate.emit_event",
  "arguments": {
    "run_id": "run-550e8400-e29b-41d4-a716-446655440000",
    "event_name": "submit_observation",
    "payload": {
      "findings": "ユーザーは検索バーを見つけるのに平均5秒かかった",
      "confidence_level": "high",
      "compared_with": ["competitor_a", "competitor_b"]
    },
    "expected_revision": 3,
    "idempotency_key": "obs-2024-01-15-001",
    "artifact_paths": [
      "./evidence/observation-001.md",
      "./evidence/screenshots/search-test-001.png"
    ]
  }
}

// レスポンス（成功）
{
  "success": true,
  "result": {
    "event_id": "evt-123456",
    "accepted": true,
    "transition": {
      "from_state": "observe",
      "to_state": "observe"  // ガード未充足のため状態は変わらない
    },
    "new_revision": 4
  }
}

// レスポンス（revision 衝突）
{
  "success": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision 3, but current is 5",
    "details": {
      "current_revision": 5
    }
  }
}

// レスポンス（ガード未充足）
{
  "success": false,
  "error": {
    "code": "GUARD_FAILED",
    "message": "Guard conditions not satisfied",
    "details": {
      "missing_guards": [
        "has_sufficient_observations: 観察件数が不足 (現在: 2, 必要: 3)"
      ]
    }
  }
}
```

---

## Resources

### stategate://runs/{run_id}/summary

Run の概要情報。

```typescript
{
  uri: "stategate://runs/run-123/summary",
  mimeType: "application/json",
  content: {
    run_id: string;
    process: { id: string; version: string; name: string };
    current_state: string;
    revision: number;
    progress: {
      completed_states: string[];
      current_state: string;
      remaining_states: string[];
    };
    created_at: string;
    updated_at: string;
  }
}
```


---

## Notifications

### list_changed

利用可能なイベント・リソースが変わったことを通知。

```typescript
{
  method: "notifications/resources/list_changed"
}
```

**発火タイミング**:
- 状態遷移時
- 成果物の追加時
- ガード状態の変化時

---

## エラーコード

| コード | 説明 |
|--------|------|
| `REVISION_CONFLICT` | expected_revision と現在の revision が一致しない |
| `FORBIDDEN` | 現在のロールではこのイベントを発行できない |
| `GUARD_FAILED` | ガード条件が充足されていない |
| `INVALID_EVENT` | 現在の状態では無効なイベント |
| `INVALID_PAYLOAD` | ペイロードがスキーマに適合しない |
| `IDEMPOTENT_REPLAY` | 同じ idempotency_key で既に処理済み（成功扱い） |
| `RUN_NOT_FOUND` | 指定された run_id が存在しない |
| `PROCESS_NOT_FOUND` | 指定された process_id が存在しない |

---

## ベストプラクティス

### 1. 常に get_state から始める

```
1. get_state で現在状態を確認
2. allowed_events と missing_guards を確認
3. 必要な成果物を準備
4. emit_event で証拠を提出
```

### 2. revision は必ずチェック

```typescript
const state = await state_gate.get_state({ run_id });
// ... 作業 ...
await state_gate.emit_event({
  run_id,
  event_name: 'submit_evidence',
  payload: { ... },
  expected_revision: state.revision,  // 取得した revision を使用
  idempotency_key: generateKey()
});
```

### 3. 衝突時は再取得してリトライ

```typescript
try {
  await state_gate.emit_event({ ... });
} catch (e) {
  if (e.code === 'REVISION_CONFLICT') {
    // 再取得してリトライ
    const newState = await state_gate.get_state({ run_id });
    // 必要に応じて payload を調整
    await state_gate.emit_event({
      ...originalRequest,
      expected_revision: newState.revision,
      idempotency_key: generateNewKey()  // 新しいキー
    });
  }
}
```

### 4. idempotency_key は一意に

```typescript
// 良い例: UUID や意味のある識別子
idempotency_key: `obs-${runId}-${Date.now()}-${randomSuffix()}`

// 悪い例: 固定値や予測可能な値
idempotency_key: 'submit-observation'  // NG: 再利用される
```
