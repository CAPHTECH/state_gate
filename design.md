# Design Document

## PostStateTransition Prompt Feature

### Architecture
- MCP response に new_state_prompt を追加
- PostToolUse hook で prompt を検出してプロンプトに挿入

### Key Files
- src/types/mcp.ts
- src/engine/use-cases/emit-event.ts
- src/engine/handlers/emit-event.ts
- src/hook/adapter.ts
- src/cli/index.ts

### Risk Areas
- Hook の実行エラーハンドリング
- プロンプト挿入のタイミング
