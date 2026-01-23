# Test Plan

## Unit Tests
- PostToolUse handler のテスト
- new_state_prompt 抽出ロジックのテスト

## Integration Tests
- emit_event → PostToolUse hook の連携テスト
- プロンプト挿入の動作確認

## Manual Tests
- Claude Code での実際の state 遷移
- ガイダンスの表示確認
