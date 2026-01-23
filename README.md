# state_gate

AIエージェント（Claude Code 等）の開発・探索作業を、外部の状態機械（state machine）により統制・可視化・監査可能にするオーケストレーター。

## 概要

state_gate は、エージェントを「賢くプロセスを覚える主体」ではなく、**状態機械が要求するアクションや成果物を生成・提出する実行器**として扱う。これにより：

- プロセスの明示化と監査可能性
- 複数エージェント/チームでの整合性確保
- プロセス多様性を skills の増殖ではなく、状態・遷移・ガードの定義として吸収

## 主な特徴

- **状態駆動**: エージェントの行動は状態機械が決定
- **証拠提出モデル**: エージェントは遷移命令ではなく証拠を提出
- **ガード条件**: 成果物要件、機械検証、承認などで遷移を制御
- **監査ログ**: すべてのイベントと判定結果を記録
- **楽観ロック**: revision による並行実行の整合性確保

## ユースケース

- 探索・実装・評価・レビューを含む反復型プロセス
- 特に**瞬作**（探索フェーズの短いループ）を主用途として想定

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ MCP Server  │  │ Hook Adapter │  │ HTTP API / CLI     │  │
│  │ (対話用)     │  │ (実行面)      │  │ (汎用連携)          │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      State Engine                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Process定義 → イベント受理 → ガード評価 → 遷移実行    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ Artifact Store │ │ Audit/Event  │ │ Context/Run      │
│ (成果物正本)    │ │ Log          │ │ Management       │
└────────────────┘ └──────────────┘ └──────────────────┘
```

## ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [中核概念](docs/concepts.md)
- [Process DSL 仕様](docs/process-dsl.md)
- [MCP インターフェース](docs/mcp-interface.md)
- [Hook Adapter](docs/hook-adapter.md)
- [権限・セキュリティ](docs/security.md)
- [MVP 要件](docs/mvp.md)
- [サンプル](examples/exploration/README.md)

## 設計原則

1. **真実は state_gate にある** - エージェントの記憶に依存しない
2. **遷移は state_gate が決める** - エージェントは証拠提出中心
3. **プロセス差分は DSL に閉じ込める** - skills の増殖で吸収しない
4. **衝突と再送は仕様で扱う** - revision / idempotency / audit

## クイックスタート

### ローカルで試す

```
npm install
npm run build
npm link
```

```
mkdir -p .state_gate/processes
cp examples/exploration/exploration-process.yaml .state_gate/processes/exploration-process.yaml
```

```
state-gate create-run --process-id exploration-process
state-gate get-state --run-id <run_id>
state-gate list-events --run-id <run_id> --include-blocked true
```

CLI の出力はすべて JSON です。
ツール実行権限は各状態の `tool_permissions` で定義してください（プロセス定義内）。
`emit-event` は artifact_paths を累積して最新行に保存します。

詳細な手順は `examples/exploration/README.md` を参照。

### MCP サーバー

```
state-gate serve --process=./path/to/process.yaml
```

### Hook Adapter (PreToolUse)

```
state-gate-hook pre-tool-use --tool-name Edit --tool-input '{"path":"README.md"}'
```

stdin 経由の入力例:

```
echo '{"tool_name":"Edit","tool_input":{"path":"README.md"}}' | state-gate-hook pre-tool-use
```

エラー時の挙動は `docs/hook-adapter.md` の fail-open/fail-close 設定に従います。

## Claude Code Plugin として使う

state_gateは Claude Code Plugin として配布されており、簡単にインストールできます。

### インストール方法

#### 方法1: マーケットプレイスから（推奨）

```bash
# マーケットプレイスを追加
/plugin marketplace add https://github.com/caphtech/state_gate

# プラグインをインストール
/plugin install state-gate
```

#### 方法2: 直接GitHubから

```bash
/plugin install https://github.com/caphtech/state_gate/tree/main/plugin
```

### 何がインストールされるか

プラグインをインストールすると、以下が自動的に利用可能になります：

- **MCP Server**: `mcp__state-gate__*` ツール群（`get_state`, `emit_event`, `list_events`, etc.）
- **PreToolUse Hook**: ツール実行前の権限チェック（プロセス定義の `tool_permissions` に基づく）
- **PostToolUse Hook**: イベント発行後の状態表示（新しい状態のプロンプトを自動挿入）
- **SessionStart Hook**: コンパクション後の状態表示

### npm公開後の使用

プラグインは内部で `npx -y state-gate` を使用するため、事前に npm パッケージを公開する必要があります：

```bash
npm publish
```

公開後、ユーザーは何もインストールせずにプラグインを使用できます（npx が自動的にパッケージをダウンロード・キャッシュします）。

### プロジェクトでの利用

プロジェクトディレクトリで Run を作成すると、自動的に状態管理が開始されます：

```bash
# Run作成（.state_gate/state-gate.json に保存）
state-gate create-run --process-id exploration-process --write-config

# 状態確認（MCPサーバー経由でも可能）
state-gate get-state
```

詳細は `examples/exploration/README.md` および `CLAUDE.md` を参照してください。

## ライセンス

MIT

## 貢献

Issue や Pull Request を歓迎します。
