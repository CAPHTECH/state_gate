# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

state_gate は、AIエージェント（Claude Code等）の開発・探索作業を外部の状態機械によって統制・可視化・監査可能にするオーケストレーターです。エージェントを「賢くプロセスを覚える主体」ではなく、**状態機械が要求するアクションや成果物を生成・提出する実行器**として扱います。

## state-gate MCP による状態管理

**重要**: 作業時は state-gate MCP で状態を管理すること（`.state_gate/state-gate.json` に Run ID が必要）。

### 基本フロー

1. **状態確認**: `mcp__state-gate__state_gate_get_state` で `current_state`, `revision`, `required_artifacts`, `allowed_events` を取得
2. **作業実行**: `current_state_prompt` に従って作業し、成果物を `./evidence/` 配下に保存
3. **イベント発行**: `mcp__state-gate__state_gate_emit_event` で成果物を提出
   - `event_name`: 提出するイベント（例: `submit_observation`）
   - `expected_revision`: 取得した revision 番号
   - `idempotency_key`: 一意なキー（形式: `{event}-{timestamp}-{random}`）
   - `artifact_paths`: 作成したファイルパスの配列
4. **遷移確認**: レスポンスの `new_state_prompt` に従って次の作業へ

### エラー対応

- `REVISION_CONFLICT`: 状態を再取得して新しい revision でリトライ
- `GUARD_FAILED`: `missing_guards` を確認し追加の成果物を作成

### 原則

- エージェントは「証拠を提出」し、state_gate が遷移を決定する
- 作業開始時・エラー後は必ず `get_state` で状態確認
- `idempotency_key` は毎回一意にする（再送すると冪等性により無視される）

## 開発コマンド

### ビルドとテスト

```bash
# ビルド
npm run build

# 開発モード（watch）
npm run dev

# テスト実行
npm test

# 特定のテストファイルのみ実行
npm test tests/state-engine.test.ts

# 型チェック
npm run typecheck

# Lint
npm run lint
```

### ローカルでの試用

```bash
# CLIをグローバルにリンク
npm link

# Run作成
state-gate create-run --process-id exploration-process --write-config

# 状態取得
state-gate get-state --run-id <run_id>

# イベント一覧取得
state-gate list-events --run-id <run_id> --include-blocked true

# MCPサーバー起動
state-gate serve --process=./path/to/process.yaml
```

## アーキテクチャ概要

### レイヤー構成

```
Integration Layer (MCP Server, Hook Adapter, CLI)
    ↓
State Engine (Facade)
    ↓
Use Cases (create-run, emit-event, get-run-state, etc.)
    ↓
Services (ProcessRegistry, RunStore)
    ↓
Storage (CSV Store, Metadata Store, Artifact Store)
```

### 重要な概念

1. **Process（プロセス定義）**: YAML形式で記述された状態機械の定義。状態・遷移・ガード・成果物要件・権限を含む。
   - 配置場所: `.state_gate/processes/*.yaml`
   - パース: `src/process/parser.ts`
   - バリデーション: `src/process/validator.ts`

2. **Run（実行）**: ある Process を具体的な作業対象に適用した実行単位。
   - **1 Run = 1 CSV ファイル**（`.state_gate/runs/{run_id}.csv`）
   - CSV形式: `timestamp,state,revision,event,idempotency_key,artifact_paths`
   - 最新状態は最終行から取得（追記方式）

3. **State Engine**: Process定義に基づく状態遷移の管理（Facade パターン）
   - 実装: `src/engine/state-engine.ts`
   - イベント受理 → 権限チェック → ガード評価 → 状態遷移実行

4. **Use Cases**: ビジネスロジックを実装
   - `src/engine/use-cases/`配下に配置
   - 各ユースケースは独立したモジュール（create-run, emit-event, get-run-state, etc.）

5. **楽観ロック**: `revision` による並行実行の整合性確保
   - イベント発行時に `expected_revision` を必須とする
   - revision 不一致は `REVISION_CONFLICT` エラー

6. **冪等性**: `idempotency_key` による二重適用防止
   - 同一キーのイベントは再送されても一度のみ処理

### 統合レイヤー

1. **MCP Server（対話面）**: エージェントが状態問い合わせとイベント発行を行うインターフェース
   - 実装: `src/mcp/server.ts`
   - Tools: `get_state`, `list_events`, `emit_event`, `create_run`, `list_runs`

2. **Hook Adapter（実行面）**: Claude Code hooks からツール実行の許可/拒否を制御
   - 実装: `src/hook/adapter.ts`
   - ポリシー評価: プロセス定義の `tool_permissions` から取得（推奨）
   - フォールバック: `src/hook/policy.ts` + `.state_gate/hook-policy.yaml`（非推奨）

3. **CLI（汎用連携）**: スクリプト・自動化との連携用
   - 実装: `src/cli/index.ts`
   - バイナリ: `state-gate`, `state-gate-hook`

## 重要なファイル構成

```
src/
├── engine/
│   ├── state-engine.ts       # State Engine Facade
│   ├── use-cases/            # ビジネスロジック（各ユースケース）
│   ├── handlers/             # MCP/CLI ハンドラー
│   └── services/             # ProcessRegistry, RunStore
├── process/
│   ├── parser.ts             # Process YAML パーサー
│   └── validator.ts          # Process 定義バリデーション
├── run/
│   ├── csv-store.ts          # Run CSV 永続化
│   ├── metadata-store.ts     # Run メタデータ管理
│   └── run-config.ts         # .state_gate/state-gate.json 操作
├── guard/
│   └── evaluator.ts          # ガード条件評価
├── artifact/
│   └── checker.ts            # 成果物の存在チェック
├── hook/
│   ├── adapter.ts            # PreToolUse/PostToolUse 実装
│   └── policy.ts             # Hook policy 評価
├── mcp/
│   └── server.ts             # MCP サーバー実装
├── cli/
│   └── index.ts              # CLI エントリーポイント
└── types/
    ├── process.ts            # Process DSL 型定義
    ├── run.ts                # Run 型定義
    ├── artifact.ts           # Artifact 型定義
    ├── guard.ts              # Guard 型定義
    └── mcp.ts                # MCP リクエスト/レスポンス型
```

## コーディング規約

### 型定義

- 型定義は `src/types/` 配下に集約
- Process DSL の型は `src/types/process.ts` が Source of Truth
- 判別共用体型を活用（例: `ArtifactGuard = ArtifactExistsGuard | ArtifactCountGuard`）

### エラーハンドリング

- State Engine 層では `StateEngineError` を使用（構造化された詳細情報を保持）
- CLI 層では `CliError` を使用
- エラーコードは大文字スネークケース（例: `REVISION_CONFLICT`, `GUARD_FAILED`）

### ファイルロック

- Run CSV 操作時は `src/run/file-lock.ts` を使用して排他制御
- タイムアウトと自動リトライを実装済み

### バリデーション

- Process 定義のバリデーションは `validateProcess()` で実行
- 参照整合性（状態・イベント・ガード・ロール）を必ずチェック
- 到達可能性、終端状態の存在も検証

### テスト

- テストフレームワーク: Vitest
- テストファイルは `tests/` 配下に配置
- ファイル名: `*.test.ts`

## Process DSL の設計原則

1. **シンプルさ**: フラットな状態機械で必要十分な表現力
2. **可読性**: 人間が読み書きしやすい YAML 形式
3. **検証可能性**: 定義の整合性を静的にチェック可能

## イベントの設計原則

エージェントが発行するイベントは「遷移命令」ではなく「証拠提出」に寄せる:

- ✅ 良い例: `submit_domain_evidence`, `submit_design_observation`, `request_review`
- ❌ 避けるべき例: `move_to_next_state`, `complete_phase`

遷移は state_gate が決定する。エージェントは証拠を提出し、state_gate がガード評価に基づいて遷移を判断する。

## セキュリティ考慮事項

- ファイルロック: Run CSV への並行書き込みを防止
- メタデータロック: Run metadata への並行書き込みを防止
- パストラバーサル防止: ファイルパス検証を実装
- スキーマバリデーション: Process 定義、イベントペイロードを検証
- 楽観ロック: revision による整合性確保
- 冪等性: idempotency_key による二重適用防止

## 主要なドキュメント

- `docs/concepts.md`: 中核概念とデータモデル
- `docs/process-dsl.md`: Process DSL 仕様
- `docs/architecture.md`: アーキテクチャ詳細
- `docs/mcp-interface.md`: MCP インターフェース仕様
- `docs/hook-adapter.md`: Hook Adapter 仕様
- `examples/exploration/README.md`: サンプルプロセスと使用例

## デバッグのヒント

- CLI出力はすべてJSON形式（`--format json` 不要）
- Run CSV は直接確認可能（`.state_gate/runs/*.csv`）
- Process 定義のバリデーションエラーは詳細なパスとメッセージを含む
- `STATE_GATE_ROLE` 環境変数でロールを指定（デフォルト: `agent`）
