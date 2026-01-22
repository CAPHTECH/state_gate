# 中核概念（データモデル）

state_gate の基盤となる概念とデータモデルを定義する。

---

## 用語定義

### Process（プロセス）

状態機械の定義。状態・遷移・ガード・成果物要件・権限を含む。

```typescript
interface Process {
  process_id: string;
  version: string;
  name: string;
  description?: string;

  states: State[];
  events: EventDefinition[];
  transitions: Transition[];
  guards: Record<string, Guard>;
  artifacts: ArtifactDefinition[];
  roles: RoleDefinition[];
}
```

### Run（実行）

ある Process を具体の作業対象に適用した実行単位。1探索/1案件/1スプリント断片など。

**CSVファイル形式（1 Run = 1ファイル）**:

```
.state_gate/runs/{run_id}.csv
```

```csv
timestamp,state,revision,event,idempotency_key,artifact_paths
2025-01-22T10:00:00Z,frame,1,created,,
2025-01-22T10:05:00Z,experiment,2,submit_hypothesis,hyp-001,./evidence/hyp1.md
```

- 最新状態は最終行から取得
- 履歴は自然に残る（追記方式）
- RFC 4180 準拠（カンマ・改行・ダブルクォートを含む値はダブルクォートで囲む）
- `artifact_paths` は複数パスをセミコロン区切りで格納
- `idempotency_key` は冪等性保証用（同一キーの再送は無視）

### State（状態）

探索上の意味を持つ状態。

```typescript
interface State {
  name: string;
  description?: string;

  // 状態に入る/出る時のフック（任意）
  on_enter?: Hook[];
  on_exit?: Hook[];

  // この状態で必要な成果物
  required_artifacts?: string[];

  // 終端状態かどうか
  is_final?: boolean;
}
```

**例**: `frame`, `experiment`, `observe`, `synthesize`, `decide`

### Event（イベント）

状態を変化させる入力。多くは「証拠提出」「承認」「差し戻し」。

```typescript
interface EventDefinition {
  name: string;
  description?: string;

  // ペイロードのスキーマ（JSON Schema）
  payload_schema?: JSONSchema;

  // このイベントを発行できるロール
  allowed_roles: string[];
}
```

**イベントの原則**:
- エージェントが発行するイベントは「遷移命令」より「証拠提出」に寄せる
- 良い例: `submit_domain_evidence`, `submit_design_observation`, `request_review`
- 人間のみ: `approve`, `reject`, `override_guard`

### Transition（遷移）

状態の変化を定義。`state + event -> state`（ガード条件付き）。

```typescript
interface Transition {
  from: string;           // 遷移元の状態
  event: string;          // トリガーとなるイベント
  to: string;             // 遷移先の状態

  guard?: string;         // ガード条件の名前（guards への参照）
  allowed_roles?: string[]; // この遷移を実行できるロール

  description?: string;
}
```

### Guard（ガード）

遷移を許可する条件。MVP では成果物ガードのみをサポート。

```typescript
// 成果物の存在・件数・必須フィールドをチェック
interface ArtifactGuard {
  type: 'artifact';
  artifact_type: string;
  condition: 'exists' | 'count' | 'has_fields';
  min_count?: number;
  required_fields?: string[];
}
```

### Artifact（成果物）

正本として保存される成果物。

```typescript
interface ArtifactDefinition {
  type: string;                    // 成果物種別
  description?: string;

  // どの状態で必要か
  required_in_states?: string[];
  // どの遷移で必要か
  required_for_transitions?: string[];

  // スキーマ（任意）
  schema?: JSONSchema;
}

interface Artifact {
  artifact_id: string;
  run_id: string;
  type: string;

  // コンテンツ（以下のいずれか）
  content?: unknown;              // インラインコンテンツ
  path?: string;                  // ファイルパス
  url?: string;                   // URL

  hash: string;                   // SHA-256 等

  metadata?: Record<string, unknown>;
  created_at: string;
  created_by: { type: string; id: string };
}
```

**成果物の種類例**:
- ドキュメント
- ログ
- 画像・動画
- diff
- テスト結果
- 観察記録

### Context Variables（コンテキスト変数）

Run に紐づく状態変数。

```typescript
interface ContextVariables {
  // 探索モード
  exploration_mode?: 'domain' | 'design' | 'hybrid';

  // チームモード
  team_mode?: 'solo' | 'team' | 'async';

  // 前提条件
  assumptions?: string[];

  // 判断軸
  decision_criteria?: string[];

  // カスタム変数
  [key: string]: unknown;
}
```

### Role/Permission（ロール/権限）

イベント発行・承認などの権限制御。

```typescript
interface RoleDefinition {
  name: string;
  description?: string;

  // 発行可能なイベント
  allowed_events: string[];

  // 承認権限
  can_approve?: boolean;
  can_reject?: boolean;
}
```

**標準ロール**:
- `agent`: 証拠提出、作業イベント
- `human`: 状態遷移を伴う意思決定、承認依頼
- `reviewer`: approve/reject

---

## Run の CSV 列

| 列名 | 説明 |
|------|------|
| `timestamp` | イベント発生日時（ISO 8601） |
| `state` | 遷移後の状態 |
| `revision` | 楽観ロック用の単調増加番号 |
| `event` | 発生したイベント名 |
| `idempotency_key` | 冪等性保証用キー（同一キーの再送は無視） |
| `artifact_paths` | 成果物パス（セミコロン区切り） |

## Run ID 形式

```
run-{UUIDv7}
例: run-019471a2-7c8d-7000-8000-000000000001
```

- UUIDv7 はタイムスタンプ順でソート可能
- 接頭辞 `run-` で識別しやすい

---

## イベントの原則

### エージェントが発行するイベント

「遷移命令」ではなく「証拠提出」に寄せる。

**良い例**:
- `submit_domain_evidence` - ドメイン証拠の提出
- `submit_design_observation` - デザイン観察の提出
- `request_review` - レビュー依頼

**避けるべき例**:
- `move_to_next_state` - 直接の状態遷移命令
- `complete_phase` - フェーズ完了の宣言

### 人間のみが発行するイベント

意思決定を伴うイベント:
- `approve` - 承認
- `reject` - 差し戻し
- `override_guard` - ガードのオーバーライド（必要な場合のみ）

### 遷移の決定主体

**遷移は state_gate が決定する**

```
エージェント: submit_evidence(証拠)
    ↓
state_gate: イベント受理 + ガード評価
    ↓
state_gate: 遷移実行（ガード充足時）
```

エージェントは「次の状態に進む」とは言わない。「この証拠を提出する」と言い、state_gate が遷移を判断する。

---

## 並行実行と整合性

### 楽観ロック（必須）

```typescript
// イベント発行時
emit_event({
  run_id: 'run-123',
  event_name: 'submit_evidence',
  payload: { ... },
  expected_revision: 5,        // 必須
  idempotency_key: 'key-abc'   // 必須
});

// revision が一致しない場合
{
  success: false,
  error: {
    code: 'REVISION_CONFLICT',
    message: 'Expected revision 5, but current is 6',
    current_revision: 6
  }
}
```

### 冪等性（必須）

同じ `idempotency_key` でのイベントは二重適用されない。

```typescript
// 1回目: 処理される
emit_event({ ..., idempotency_key: 'key-123' }); // → success

// 2回目: 同じキーなので処理されない（が、成功として返る）
emit_event({ ..., idempotency_key: 'key-123' }); // → success (idempotent)
```

### 履歴

CSV 追記方式により、すべての状態遷移が自動的に履歴として残る。
