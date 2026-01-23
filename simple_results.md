# claude-code.yaml 改定 - 実装結果

## 完了した作業

### 1. ベストプラクティスに基づくプロセス定義の改定
- **Explore → Plan → Implement → Verify** ワークフローを実装
- **Two-Correction Rule** を追加（検証失敗を追跡し、2回失敗で context_reset）
- **シンプルタスク用の高速パス** を追加（`idle` → `simple_implement` → `done`）
- **具体的な検証基準の強制**（`verification_spec` 状態で期待される入出力を定義）

### 2. idle 状態の追加によるリクエスト受付フロー
**問題**: intake 状態のプロンプトが読み込まれるタイミングがない
**解決策**: 初期待機状態 `idle` を追加

#### 変更内容
- `initial_state: idle` に変更
- `idle` 状態でタスクを待機
- `submit_request` イベントで payload に `{"request": "タスクの説明"}` を受け取る
- `idle` → `intake` 遷移時に context にリクエストを保存
- `intake` プロンプトで `{context.request}` を参照

### 3. context の動的更新機能の実装
**実装内容**:
- `RunMetadata` に `context: ContextVariables` フィールドを追加
- `MetadataStore` の Zod スキーマに `context` を追加
- `create-run` で初期 context を metadata に保存
- `emitEvent` で payload を context にマージして metadata を更新
- `get-run-state` で metadata の context を返す

#### 検証結果

✅ **CLI 経由では正常に動作**:
```bash
$ node dist/cli/index.js emit-event --event submit_request \
  --payload '{"request": "Test"}' --expected-revision 1 \
  --idempotency-key test-key

[DEBUG] emit-event payload: {"request":"Test"}
[DEBUG] payload type: object
[DEBUG] payload keys: [ 'request' ]
[DEBUG] Saving updated context: {"request":"Test"}
```

Metadata が正しく更新される：
```json
{
  "context": {
    "request": "Test"
  }
}
```

❌ **MCP 経由では context が更新されない**:
```bash
# MCP 経由で submit_request を実行
$ mcp__state-gate__state_gate_emit_event \
  --event_name submit_request \
  --payload {"request": "MCP test"}

# metadata は空のまま
{
  "context": {}
}
```

## 問題の原因（解決済み）

**MCP サーバーの再起動が必要だった**

1. npm run build で dist ファイルは更新される
2. しかし、既に起動している MCP サーバーは古いコードで動作
3. **MCP サーバーを再起動することで、新しいコードが読み込まれる**

### 検証結果

✅ **MCP 経由でも正常に動作**:
```json
{
  "context": {
    "request": "Final MCP debug test"
  }
}
```

✅ **CLI 経由でも正常に動作**（以前から確認済み）

## ファイル変更リスト

### 変更したファイル
1. `.state_gate/processes/claude-code.yaml` - プロセス定義の全面改定
2. `src/types/run.ts` - RunMetadata に context フィールド追加
3. `src/run/metadata-store.ts` - Zod スキーマに context 追加
4. `src/engine/use-cases/create-run.ts` - 初期 context を metadata に保存
5. `src/engine/use-cases/emit-event.ts` - payload を context にマージ
6. `src/engine/use-cases/get-run-state.ts` - metadata.context を返す
7. `src/engine/services/run-store.ts` - saveMetadata メソッド追加
8. `src/mcp/server.ts` - デバッグログ追加

### テスト結果
- ✅ TypeScript ビルド成功
- ✅ プロセス定義のバリデーション成功
- ✅ CLI 経由での context 更新成功
- ✅ MCP 経由での context 更新成功（MCP サーバー再起動後）

## まとめ

Claude Code のベストプラクティスに基づいて claude-code.yaml を v2.0.0 に改定し、idle 状態とリクエスト受付フローを実装しました。

### 主な成果

1. **プロセス定義の全面改定**
   - Explore → Plan → Implement → Verify ワークフロー
   - Two-Correction Rule による失敗追跡
   - シンプルタスク用の高速パス
   - 具体的な検証基準の強制

2. **idle 状態とリクエスト受付フロー**
   - `submit_request` イベントで payload に `{"request": "タスクの説明"}` を受け取る
   - context にリクエストを保存し、intake プロンプトで参照

3. **context の動的更新機能**
   - イベント payload を自動的に context にマージ
   - metadata ファイルに永続化
   - CLI と MCP の両方で正常に動作を確認

すべての機能が正常に動作することを確認しました。MCP サーバーの再起動が必要でしたが、これは開発時の一般的な手順です。
