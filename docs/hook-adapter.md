# Hook Adapter

Claude Code hooks から state_gate を呼び出すためのアダプタ仕様。

---

## 概要

Hook Adapter は**実行面**のインターフェースとして機能し、以下を行う:

- ツール実行の**許可/拒否**（PreToolUse）
- エージェントの「問い合わせ忘れ」を防止

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   Hook Adapter   │────▶│   state_gate    │
│                 │◀────│                  │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
     PreToolUse              問い合わせ              ポリシー評価
```

---

## 設計原則

### 1. Hook は賢くしない

分岐ロジックは state_gate の process/guard に寄せる。Hook 側はシンプルな橋渡しに徹する。

### 2. 単一責務

- **問い合わせて反映する**: 状態を確認し、許可/拒否を返す

---

## フック種別

### PreToolUse

ツール実行前に呼び出され、許可/拒否/確認を返す。

```
┌───────────┐  PreToolUse   ┌────────────┐
│  Claude   │──────────────▶│    Hook    │
│   Code    │               │  Adapter   │
└───────────┘               └─────┬──────┘
                                  │
                                  │ get_state
                                  ▼
                            ┌───────────┐
                            │  state    │
                            │   gate    │
                            └─────┬─────┘
                                  │
                                  │ 状態 + ポリシー
                                  ▼
                            ┌───────────┐
                            │  Policy   │
                            │  Engine   │
                            └─────┬─────┘
                                  │
                                  │ allow/deny/ask
                                  ▼
                            ┌───────────┐
                            │  返却     │
                            └───────────┘
```

**入力**:
```typescript
interface PreToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;

  // state_gate 連携用
  run_id?: string;  // フック入力や設定ファイルから取得
}
```

**出力（内部）**:
```typescript
interface PreToolUseOutput {
  decision: 'allow' | 'deny' | 'ask';

  // deny の場合
  reason?: string;

  // ask の場合
  question?: string;

  // 追加情報
  context?: {
    current_state: string;
    missing_requirements?: string[];
  };
}
```

**CLI 出力（Claude Code hook 互換）**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

**実装例（シェルスクリプト）**:
```bash
#!/bin/bash
# hooks/pre-tool-use.sh

TOOL_NAME="$1"
TOOL_INPUT="$2"
RUN_ID=$(jq -r '.run_id' .state_gate/state-gate.json 2>/dev/null)

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  # state_gate 未連携の場合はそのまま許可
  echo '{"decision": "allow"}'
  exit 0
fi

# state_gate に問い合わせ（出力は常にJSON）
STATE=$(state-gate get-state --run-id "$RUN_ID")

# ポリシー評価（シンプルな例）
CURRENT_STATE=$(echo "$STATE" | jq -r '.current_state')

case "$TOOL_NAME" in
  "Write"|"Edit")
    if [ "$CURRENT_STATE" = "observe" ]; then
      echo '{"decision": "deny", "reason": "観察フェーズではファイル編集できません"}'
      exit 0
    fi
    ;;
  "Bash")
    # 危険なコマンドのチェック等
    ;;
esac

echo '{"decision": "allow"}'
```

---

## ポリシー設定

### 推奨: プロセス定義内での tool_permissions（v2.0.0+）

**推奨方法**: 各状態定義に `tool_permissions` を含める。状態とツール権限が一体として管理されるため、整合性が保たれます。

```yaml
# .state_gate/processes/your-process.yaml
states:
  - name: frame
    description: Framing the problem
    prompt: |
      問題を定式化してください...
    tool_permissions:
      allowed: [Read, Glob, Grep, WebSearch, WebFetch]
      denied: [Write, Edit, Bash]
      ask: []

  - name: experiment
    description: Experimenting with solutions
    prompt: |
      実験を行ってください...
    tool_permissions:
      allowed: [Read, Glob, Grep, Write, Edit]
      ask: [Bash]  # 確認を求める

  - name: observe
    description: Observing results
    prompt: |
      結果を観察してください...
    tool_permissions:
      allowed: [Read, Glob, Grep, WebFetch]
      denied: [Write, Edit]
      ask: [Bash]
```

**優先順位**:
- `denied` が最優先（明示的な拒否）
- `ask` が次（ユーザー確認を要求）
- `allowed` が最後（許可リスト）
- `allowed` が空または未定義の場合はすべて許可

### 後方互換: 外部ポリシーファイル（非推奨）

古いバージョンとの互換性のため、外部ポリシーファイルもサポートされます（`tool_permissions` がない場合のフォールバック）。

**配置場所**: `.state_gate/hook-policy.yaml` または `STATE_GATE_POLICY_PATH` 環境変数で指定

```yaml
# .state_gate/hook-policy.yaml (非推奨)
policies:
  state_tool_permissions:
    frame:
      allowed: [Read, Glob, Grep]
      denied: [Write, Edit, Bash]
```

**注意**: 外部ポリシーファイルは状態とツール権限が分離されるため、整合性の問題が発生する可能性があります。新規プロジェクトでは `tool_permissions` を使用してください。

CLI オプションとの対応:

| CLI オプション | 環境変数 | 説明 |
|---------------|----------|------|
| `--policy-path` | `STATE_GATE_POLICY_PATH` | Hook policy のパス |
| `--run-id` | - | Run ID を明示指定（通常は設定ファイルから取得） |
| `--config-path` | - | Run 設定ファイルのパス |
| `--role` | `STATE_GATE_ROLE` | 現在のロール |
| `--process-dir` | `STATE_GATE_PROCESS_DIR` | Process 定義のディレクトリ |
| `--runs-dir` | `STATE_GATE_RUNS_DIR` | Run CSV のディレクトリ |
| `--metadata-dir` | `STATE_GATE_METADATA_DIR` | Run metadata のディレクトリ |

---

## Claude Code hooks 設定例

`.claude/hooks.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": {
          "tool_name": "*"
        },
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/state-gate-hook pre-tool-use"
          }
        ]
      }
    ]
  }
}
```

---

## 環境変数

Hook Adapter で使用する環境変数:

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `STATE_GATE_ROLE` | 現在のロール | `agent` |

---

## Run 設定ファイル

Hook Adapter は Run ID を設定ファイルから取得する。

デフォルト: `.state_gate/state-gate.json`

```json
{
  "run_id": "run-xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx"
}
```

`--config-path` でパスを変更可能。

## 典型的なフロー

### 1. ファイル編集の許可/拒否

```
User: "このバグを修正して"

Claude Code: Edit ツールを呼び出そうとする
    │
    ▼
PreToolUse Hook 発火
    │
    │ state-gate get-state
    ▼
state_gate: 現在 "observe" 状態
    │
    ▼
Policy Engine: observe では Edit は denied
    │
    ▼
PreToolUse 返却: {"decision": "deny", "reason": "観察フェーズでは..."}
    │
    ▼
Claude Code: ツール実行をスキップ、理由を表示
```

---

## エラーハンドリング

### Hook 実行エラー

Hook がエラーを返した場合、デフォルトでは**許可**として扱う（fail-open）。

厳格モードでは**拒否**として扱う（fail-close）。

```yaml
# hook-policy.yaml
error_handling:
  mode: fail-open  # または fail-close

  # 特定のツールのみ厳格に
  strict_tools:
    - Write
    - Edit
```

### state_gate 接続エラー

state_gate に接続できない場合:

1. **キャッシュされた状態で評価**（可能な場合）
2. **許可/拒否のデフォルト設定に従う**
3. **エラーログを記録**

```yaml
# hook-policy.yaml
connection_error:
  default_decision: allow  # または deny
  cache_ttl_seconds: 60    # キャッシュの有効期限
  retry_count: 3
  retry_delay_ms: 100
```

---

## CLI コマンド

Hook Adapter は CLI としても使用可能。

**インストール**:
```bash
# リポジトリをクローンしてビルド
npm install
npm run build

# グローバルインストール（オプション）
npm link

# または直接実行
npx state-gate <command>
```

**コマンド一覧**:

| コマンド | 説明 |
|---------|------|
| `create-run` | Run作成 |
| `get-state` | 状態取得 |
| `list-events` | 発行可能イベント一覧 |
| `emit-event` | イベント発行 |
| `list-runs` | Run一覧 |
| `pre-tool-use` | PreToolUse フックの判定 |

**使用例**:
```bash
# Run作成
state-gate create-run \
  --process-id exploration-process \
  --context '{"exploration_mode": "domain"}' \
  --write-config

# 状態取得
state-gate get-state --run-id <run_id>

# イベント発行
state-gate emit-event \
  --run-id <run_id> \
  --event <event_name> \
  --payload '<json>' \
  --expected-revision <n> \
  --idempotency-key <key> \
  --artifact-paths "./evidence/obs1.md"

# PreToolUse の判定（JSON出力）
state-gate-hook pre-tool-use \
  --tool-name Edit \
  --tool-input '{"path":"README.md"}'
```

**出力**: 全コマンドJSON形式で出力（`pre-tool-use` は Claude Code hook 形式）

### stdin での入力例

Claude Code hooks からは JSON が stdin で渡される前提のため、
以下のように標準入力で渡す運用も可能。

```bash
echo '{
  "tool_name": "Edit",
  "tool_input": { "path": "README.md" }
}' | state-gate-hook pre-tool-use
```

`run_id` が未指定の場合は設定ファイルから取得し、どちらも無い場合は allow を返す。

---

## Claude Code integration runbook

1) Build and link the CLI

```bash
npm install
npm run build
npm link
```

2) Install the process definition used by your project

```bash
mkdir -p .state_gate/processes
cp ./path/to/process.yaml .state_gate/processes/<process_id>.yaml
```

3) Create a run and write the run config

```bash
state-gate create-run --process-id <process_id> --write-config
```

```bash
export STATE_GATE_ROLE=agent
```

4) Configure tool permissions in your process definition

プロセス定義ファイル (`.state_gate/processes/your-process.yaml`) の各状態に `tool_permissions` を追加：

```yaml
states:
  - name: your_state
    prompt: |
      Your prompt here...
    tool_permissions:
      allowed: [Read, Glob, Grep, Write, Edit]
      denied: [Bash]
      ask: []
```

5) Configure Claude Code hooks

`.claude/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool_name": "*" },
        "hooks": [
          {
            "type": "command",
            "command": "state-gate-hook pre-tool-use"
          }
        ]
      }
    ]
  }
}
```

Notes
- `state-gate-hook pre-tool-use` consumes JSON from stdin, so it works with the hook payload directly.
- If you want to override the policy path, set `STATE_GATE_POLICY_PATH` before launching Claude Code.
