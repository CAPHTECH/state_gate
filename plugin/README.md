# state-gate Claude Code Plugin

AIエージェントの作業を外部状態機械で統制・可視化するオーケストレーター

## 概要

state-gateは、Claude CodeなどのAIエージェントの開発・探索作業を、外部の状態機械により統制・可視化・監査可能にするプラグインです。

エージェントを「賢くプロセスを覚える主体」ではなく、**状態機械が要求するアクションや成果物を生成・提出する実行器**として扱います。

## 主な機能

### MCP Server
- `state_gate_get_state`: 現在の状態とプロンプトを取得
- `state_gate_emit_event`: イベントを発行して状態遷移
- `state_gate_list_events`: 利用可能なイベント一覧
- `state_gate_create_run`: 新しいRunを作成
- `state_gate_list_runs`: Run一覧を取得

### Hooks
- **PreToolUse**: ツール実行前の権限チェック（プロセス定義の `tool_permissions` に基づく）
- **PostToolUse**: イベント発行後の状態表示（新しい状態のプロンプトを自動挿入）
- **SessionStart**: コンパクション後の状態表示

## インストール

### 前提条件

state-gateはnpxを使用するため、npmパッケージが公開されている必要があります。

```bash
npm install -g state-gate
```

または、npxが初回実行時に自動的にダウンロードします。

### Claude Codeでのインストール

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

## 使い方

### 1. Runの作成

プロジェクトディレクトリで、プロセスに基づいたRunを作成します：

```bash
state-gate create-run --process-id exploration-process --write-config
```

これにより `.state_gate/state-gate.json` にRun IDが保存され、以降のコマンドで自動的に参照されます。

### 2. 状態確認

MCPツールまたはCLIで現在の状態を確認：

```bash
# CLI
state-gate get-state

# Claude Code内で
mcp__state-gate__state_gate_get_state を実行
```

### 3. 作業実行

現在の状態のプロンプトに従って作業を行い、成果物を作成します。

### 4. イベント発行

作業が完了したら、成果物とともにイベントを発行：

```bash
# MCPツールとして
mcp__state-gate__state_gate_emit_event で以下を指定：
- event_name: 発行するイベント名
- expected_revision: 現在のrevision番号
- idempotency_key: 一意なキー
- artifact_paths: 作成した成果物のパス配列
```

### 5. 状態遷移

state-gateがガード条件を評価し、条件を満たせば自動的に次の状態に遷移します。
PostToolUse hookにより、新しい状態のプロンプトが自動的に表示されます。

## プロセス定義

プロセスは `.state_gate/processes/*.yaml` に配置します。

例: `.state_gate/processes/exploration-process.yaml`

```yaml
id: exploration-process
name: Exploration Process
initial_state: idle
states:
  - name: idle
    description: Waiting for task
    prompt: "タスクを受け取り、'start' イベントを発行してください"
    tool_permissions:
      allowed: []
  - name: exploring
    description: Exploring the codebase
    prompt: "コードベースを探索し、exploration.mdに記録してください"
    required_artifacts:
      - path: evidence/exploration.md
    tool_permissions:
      allowed: [Read, Glob, Grep, Write]
      denied: [Edit, Bash]
  # ...
events:
  - name: start
    description: Start exploration
  - name: submit_exploration
    description: Submit exploration results
  # ...
transitions:
  - from: idle
    event: start
    to: exploring
  - from: exploring
    event: submit_exploration
    to: done
    guards:
      - type: artifact_exists
        paths: ["evidence/exploration.md"]
  # ...
```

## ツール権限制御

各状態で `tool_permissions` を定義すると、PreToolUse hookが自動的に権限をチェックします：

- `allowed`: 許可するツールのリスト
- `denied`: 拒否するツールのリスト
- `ask`: ユーザー確認を求めるツールのリスト

優先順位: `denied` > `ask` > `allowed`

## トラブルシューティング

### MCPサーバーが起動しない

```bash
# MCPサーバーの状態を確認
claude mcp list

# 手動で起動を試す
npx -y state-gate serve
```

### Hooksが動作しない

```bash
# Hooks設定を確認
cat ~/.claude/settings.json | jq '.hooks'

# プラグインが正しくインストールされているか確認
/plugin list
```

### Run IDが見つからない

`.state_gate/state-gate.json` が存在することを確認：

```bash
cat .state_gate/state-gate.json
```

## 詳細情報

- [メインREADME](../README.md)
- [アーキテクチャ](../docs/architecture.md)
- [Process DSL仕様](../docs/process-dsl.md)
- [MCP インターフェース](../docs/mcp-interface.md)
- [Hook Adapter](../docs/hook-adapter.md)

## ライセンス

MIT

## サポート

Issue や Pull Request は [GitHub リポジトリ](https://github.com/caphtech/state_gate)へ。
