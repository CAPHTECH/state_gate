# MVP 要件（v0.1）

state_gate の最小実行可能製品（MVP）の要件定義。

---

## 目標

「エージェント＋状態機械」の核が成立することを実証する。

MVP では以下を実現する:
- エージェントが状態を問い合わせられる
- エージェントが証拠を提出できる
- 状態遷移がガード条件に基づいて行われる

---

## 必須機能

### 1. Process DSL

状態・イベント・遷移・ガード・権限を定義できる。

**最小要件**:
- [ ] YAML 形式での Process 定義
- [ ] 状態の定義（name, description, is_final）
- [ ] イベントの定義（name, payload_schema, allowed_roles）
- [ ] 遷移の定義（from, event, to, guard）
- [ ] ガードの定義（artifact 存在チェックのみ）
- [ ] ロールの定義（agent, human, reviewer）
- [ ] Process 定義の検証（必須フィールド、参照整合性）

**スコープ外（v0.2以降）**:
- 階層状態（HFSM）
- 並行領域
- 複合ガード（AND/OR）
- 機械検証ガード（テスト、Lint）

### 2. Run 管理

Process を適用した実行単位を管理する。

**最小要件**:
- [ ] Run の作成（process_id）
- [ ] Run の状態取得（最新行を読む）
- [ ] Run の一覧取得
- [ ] revision の管理（楽観ロック）

**データ形式（CSV追記方式）**:

1 Run = 1 CSVファイル。イベントごとに1行追記し、最新状態は最終行。

```
.state_gate/runs/{run_id}.csv
```

```csv
timestamp,state,revision,event,artifact_paths
2025-01-22T10:00:00Z,initial,1,created,
2025-01-22T10:05:00Z,evidence_gathering,2,submit_evidence,./evidence/obs1.md
2025-01-22T10:10:00Z,review_requested,3,request_review,./evidence/obs1.md;./evidence/obs2.md
```

**メリット**:
- 追記のみ → シンプル、競合しにくい
- 最新状態 = `tail -1`
- 履歴が自然に残る

### 3. MCP インターフェース

エージェントとの対話用インターフェース。

**最小要件**:
- [ ] `state_gate.get_state(run_id)` - 状態取得
- [ ] `state_gate.list_events(run_id)` - 発行可能イベント一覧
- [ ] `state_gate.emit_event(run_id, event_name, payload, expected_revision, idempotency_key)` - イベント発行

**レスポンス仕様**:
```typescript
// get_state
{
  run_id: string;
  current_state: string;
  revision: number;
  context: Record<string, unknown>;
  missing_guards: Array<{ guard_name: string; description: string }>;
  required_artifacts: Array<{ type: string; status: string }>;
  allowed_events: Array<{ event_name: string; description: string }>;
}

// emit_event
{
  success: boolean;
  result?: {
    event_id: string;
    transition?: { from_state: string; to_state: string };
    new_revision: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### 4. Artifact 管理

成果物の参照を管理する。

**最小要件**:
- [ ] Artifact パスの登録（CSV の artifact_paths 列に追記）
- [ ] Artifact ファイルの存在確認
- [ ] Run に紐づく Artifact の一覧取得（最新行の artifact_paths を解析）

Artifact は CSV の `artifact_paths` 列にセミコロン区切りで保存。
ファイルの実在確認がガード条件となる。

**スコープ外（v0.2以降）**:
- Artifact のハッシュ検証
- メタデータ管理

### 5. Hook Adapter

Claude Code hooks との連携。

**最小要件**:
- [ ] PreToolUse フックの実装
  - 状態取得
  - ポリシー評価（シンプルな許可/拒否）
  - allow/deny の返却
- [ ] CLI コマンド
  - `state-gate get-state --run-id <id>`
  - `state-gate emit-event --run-id <id> --event <name> ...`

**スコープ外（v0.2以降）**:
- PostToolUse での自動提出
- 複雑なポリシー評価
- HTTP API

---

## 技術スタック（推奨）

### 言語・ランタイム
- TypeScript / Node.js
- または Python 3.11+

### データストア
- CSVファイル（追記方式、最もシンプル）

### MCP 実装
- `@modelcontextprotocol/sdk`（TypeScript）
- または `mcp`（Python）

---

## ディレクトリ構造（案）

```
state_gate/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── concepts.md
│   ├── process-dsl.md
│   ├── mcp-interface.md
│   ├── hook-adapter.md
│   ├── security.md
│   └── mvp.md
├── src/
│   ├── core/
│   │   ├── engine.ts        # State Engine
│   │   ├── process.ts       # Process 定義の読込・検証
│   │   ├── run.ts           # Run 管理
│   │   ├── guard.ts         # ガード評価
│   │   └── artifact.ts      # Artifact 管理
│   ├── mcp/
│   │   ├── server.ts        # MCP サーバー
│   │   └── tools.ts         # MCP Tools 実装
│   └── cli/
│       └── index.ts         # CLI エントリポイント
├── examples/
│   └── exploration/
│       ├── process.yaml     # サンプル Process 定義
│       └── README.md
├── tests/
│   ├── core/
│   ├── mcp/
│   └── integration/
├── package.json
└── tsconfig.json
```

---

## 実装優先順位

### Phase 1: 基盤

1. Process 定義のパーサー・バリデーター
2. Run の作成・取得（CSV読み書き）

### Phase 2: コア機能

3. State Engine（イベント受理、ガード評価、遷移）
4. Artifact 参照の管理

### Phase 3: インターフェース

5. MCP サーバー（get_state, list_events, emit_event）
6. CLI（get-state, emit-event）

### Phase 4: 統合

7. Hook Adapter（PreToolUse）
8. サンプル Process 定義
9. 統合テスト

---

## 成功基準

MVP は以下を満たすとき完了とする:

### 機能テスト

- [ ] YAML で定義した Process を読み込める
- [ ] Run を作成し、初期状態を取得できる
- [ ] MCP 経由でイベントを発行できる
- [ ] ガード条件（Artifact 存在）が評価される
- [ ] ガード充足時に状態遷移が発生する
- [ ] revision 不一致で拒否される
- [ ] 権限不足で拒否される

### 統合テスト

- [ ] Claude Code から MCP 経由で状態を取得できる
- [ ] Claude Code から MCP 経由でイベントを発行できる
- [ ] Hook Adapter が PreToolUse で許可/拒否を返せる

### ドキュメント

- [ ] README に使い方が記載されている
- [ ] サンプル Process 定義がある
- [ ] MCP Tools のリファレンスがある

---

## 非機能要件（MVP）

| 項目 | 要件 |
|------|------|
| レスポンス時間 | get_state: < 100ms, emit_event: < 200ms |
| 同時接続 | 1 Run あたり 1 エージェント（MVP） |
| データ永続性 | CSVファイル（追記方式） |
| 可用性 | 単一プロセス（冗長化なし） |

---

## 制限事項（MVP）

MVP では以下を**サポートしない**:

1. **階層状態**: フラットな状態のみ
2. **並行領域**: 単一の状態系列のみ
3. **複合ガード**: 単一のガード条件のみ
4. **機械検証**: Artifact 存在チェックのみ
5. **承認ワークフロー**: approve/reject の特別扱いなし
6. **HTTP API**: MCP と CLI のみ
7. **PostToolUse**: PreToolUse のみ
8. **マルチテナント**: 単一テナントのみ
9. **高可用性**: 単一プロセスのみ

これらは v0.2 以降で段階的に追加する。
