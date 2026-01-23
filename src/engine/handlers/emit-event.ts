/**
 * emit_event ハンドラー
 * @see docs/mcp-interface.md
 */

import type {
  EmitEventRequest,
  EmitEventResponse,
  EmitEventSuccessResult,
  EmitEventError,
  EmitEventErrorCode,
} from "../../types/index.js";
import { StateEngine, StateEngineError } from "../state-engine.js";

/**
 * emit_event リクエストを処理
 */
export async function handleEmitEvent(
  engine: StateEngine,
  request: EmitEventRequest,
  role: string
): Promise<EmitEventResponse> {
  // idempotency_key のバリデーション
  if (!request.idempotency_key || request.idempotency_key.length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "idempotency_key is required and must not be empty",
        details: {
          validation_errors: [
            { path: "/idempotency_key", message: "Must not be empty" },
          ],
        },
      },
    };
  }

  try {
    const emitParams: import("../state-engine.js").EmitEventParams = {
      runId: request.run_id,
      eventName: request.event_name,
      expectedRevision: request.expected_revision,
      idempotencyKey: request.idempotency_key,
      role,
    };
    if (request.payload !== undefined) {
      emitParams.payload = request.payload;
    }
    if (request.artifact_paths !== undefined) {
      emitParams.artifactPaths = request.artifact_paths;
    }

    const result = await engine.emitEvent(emitParams);

    const successResult: EmitEventSuccessResult = {
      event_id: result.eventId,
      accepted: true,
      new_revision: result.newRevision,
    };

    if (result.transition) {
      successResult.transition = {
        from_state: result.transition.fromState,
        to_state: result.transition.toState,
      };
    }

    // 新しい state の prompt を追加
    if (result.newStatePrompt !== undefined) {
      successResult.new_state_prompt = result.newStatePrompt;
    }

    // 冪等リプレイの場合
    if (result.replayed) {
      return {
        success: true,
        result: successResult,
      };
    }

    return {
      success: true,
      result: successResult,
    };
  } catch (error) {
    if (error instanceof StateEngineError) {
      return {
        success: false,
        error: mapStateEngineError(error),
      };
    }

    // 予期しないエラー
    return {
      success: false,
      error: {
        code: "INVALID_EVENT",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * StateEngineError を EmitEventError にマップ
 * 構造化された details を使用（正規表現パース不要）
 */
function mapStateEngineError(error: StateEngineError): EmitEventError {
  const code = mapErrorCode(error.code);
  const errorObj: EmitEventError = {
    code,
    message: error.message,
  };

  // エラーコードに応じた詳細情報を追加（構造化データから取得）
  if (code === "REVISION_CONFLICT" && error.details?.currentRevision !== undefined) {
    errorObj.details = {
      current_revision: error.details.currentRevision,
    };
  } else if (code === "GUARD_FAILED" && error.details?.guardName !== undefined) {
    errorObj.details = {
      missing_guards: [error.details.guardName],
    };
  } else if (code === "INVALID_PAYLOAD" && error.details?.validationErrors) {
    errorObj.details = {
      validation_errors: error.details.validationErrors,
    };
  }

  return errorObj;
}

/**
 * エラーコードをマップ
 */
function mapErrorCode(code: string): EmitEventErrorCode {
  switch (code) {
    case "RUN_NOT_FOUND":
      return "RUN_NOT_FOUND";
    case "PROCESS_NOT_FOUND":
      return "PROCESS_NOT_FOUND";
    case "REVISION_CONFLICT":
      return "REVISION_CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "GUARD_FAILED":
      return "GUARD_FAILED";
    case "INVALID_EVENT":
      return "INVALID_EVENT";
    case "INVALID_PAYLOAD":
      return "INVALID_PAYLOAD";
    default:
      return "INVALID_EVENT";
  }
}
