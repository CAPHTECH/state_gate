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
  run_id?: string;  // 環境変数やコンテキストから取得
}
```

**出力**:
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

**実装例（シェルスクリプト）**:
```bash
#!/bin/bash
# hooks/pre-tool-use.sh

TOOL_NAME="$1"
TOOL_INPUT="$2"
RUN_ID="${STATE_GATE_RUN_ID}"

if [ -z "$RUN_ID" ]; then
  # state_gate 未連携の場合はそのまま許可
  echo '{"decision": "allow"}'
  exit 0
fi

# state_gate に問い合わせ
STATE=$(state-gate get-state --run-id "$RUN_ID" --format json)

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

Hook Adapter のポリシーは Process 定義の一部として、または別途設定ファイルで定義できる。

**配置場所**: `.claude/hook-policy.yaml` または `STATE_GATE_POLICY_PATH` 環境変数で指定

```yaml
# .claude/hook-policy.yaml
policies:
  # 状態ごとのツール許可
  state_tool_permissions:
    frame:
      allowed: [Read, Glob, Grep, WebSearch, WebFetch]
      denied: [Write, Edit, Bash]
      ask: []

    experiment:
      allowed: [Read, Glob, Grep, Write, Edit]
      denied: []
      ask: [Bash]  # 確認を求める

    observe:
      allowed: [Read, Glob, Grep, WebFetch]
      denied: [Write, Edit]
      ask: [Bash]

  # ツール固有の制限
  tool_restrictions:
    Bash:
      # 禁止パターン
      deny_patterns:
        - "rm -rf"
        - "sudo"
        - "chmod 777"
      # 許可パターン（これ以外は ask）
      allow_patterns:
        - "npm test"
        - "npm run"
        - "git status"
        - "git diff"
```

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
| `STATE_GATE_RUN_ID` | 現在の Run ID | `run-550e8400-...` |
| `STATE_GATE_ROLE` | 現在のロール | `agent` |

---

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

**使用例**:
```bash
# Run作成
state-gate create-run \
  --process-id exploration-process \
  --context '{"exploration_mode": "domain"}'

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
```

**出力**: 全コマンドJSON形式で出力
