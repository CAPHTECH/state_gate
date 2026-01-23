/**
 * Run ID validation helpers
 */

import type { RunId } from "../types/index.js";

export const RUN_ID_PATTERN =
  /^run-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRunId(value: string): value is RunId {
  return RUN_ID_PATTERN.test(value);
}

export function validateRunId(value: string): RunId {
  if (!isValidRunId(value)) {
    throw new Error(`Invalid run_id format: ${value}`);
  }
  return value as RunId;
}
