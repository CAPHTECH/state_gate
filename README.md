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

## 設計原則

1. **真実は state_gate にある** - エージェントの記憶に依存しない
2. **遷移は state_gate が決める** - エージェントは証拠提出中心
3. **プロセス差分は DSL に閉じ込める** - skills の増殖で吸収しない
4. **衝突と再送は仕様で扱う** - revision / idempotency / audit

## クイックスタート

```bash
# インストール（予定）
npm install state_gate

# または
pip install state_gate
```

```typescript
// Process 定義の例
const explorationProcess = {
  states: ['frame', 'experiment', 'observe', 'synthesize', 'decide'],
  events: ['submit_evidence', 'submit_observation', 'request_review', 'approve', 'reject'],
  transitions: [
    { from: 'frame', event: 'submit_evidence', to: 'experiment', guard: 'has_hypothesis' },
    { from: 'experiment', event: 'submit_observation', to: 'observe', guard: 'has_results' },
    // ...
  ],
  guards: {
    has_hypothesis: { type: 'artifact_exists', artifact: 'hypothesis' },
    has_results: { type: 'artifact_count', artifact: 'experiment_result', min: 1 },
  }
};
```

## ライセンス

MIT

## 貢献

Issue や Pull Request を歓迎します。
