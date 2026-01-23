/**
 * Process YAML パーサー
 * @see docs/process-dsl.md
 */

import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Process } from "../types/index.js";

/**
 * パースエラー
 */
export class ProcessParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProcessParseError";
  }
}

// =============================================================================
// Zod スキーマ定義
// =============================================================================

const JSONSchemaSchema: z.ZodType<Record<string, unknown>> = z.record(
  z.unknown()
);

const StateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().optional(),
  required_artifacts: z.array(z.string()).optional(),
  is_final: z.boolean().optional(),
});

const EventDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  payload_schema: JSONSchemaSchema.optional(),
  allowed_roles: z.array(z.string()),
});

const TransitionSchema = z.object({
  from: z.string().min(1),
  event: z.string().min(1),
  to: z.string().min(1),
  guard: z.string().optional(),
  allowed_roles: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const ArtifactExistsGuardSchema = z.object({
  type: z.literal("artifact"),
  artifact_type: z.string().min(1),
  condition: z.literal("exists"),
});

const ArtifactCountGuardSchema = z.object({
  type: z.literal("artifact"),
  artifact_type: z.string().min(1),
  condition: z.literal("count"),
  min_count: z.number().int().min(0),
});

const GuardSchema = z.union([ArtifactExistsGuardSchema, ArtifactCountGuardSchema]);

const ArtifactDefinitionSchema = z.object({
  type: z.string().min(1),
  description: z.string().optional(),
  required_in_states: z.array(z.string()).optional(),
  required_for_transitions: z.array(z.string()).optional(),
  schema: JSONSchemaSchema.optional(),
});

const RoleDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  allowed_events: z.array(z.string()),
  can_approve: z.boolean().optional(),
  can_reject: z.boolean().optional(),
});

const ContextVariablesSchema = z.record(z.unknown());

/**
 * YAML のトップレベル構造
 * process: { ... } の形式をサポート
 */
const ProcessYamlSchema = z.object({
  process: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    initial_state: z.string().min(1),
    initial_context: ContextVariablesSchema.optional(),
    context_schema: JSONSchemaSchema.optional(),
  }),
  states: z.array(StateSchema).min(1),
  events: z.array(EventDefinitionSchema),
  transitions: z.array(TransitionSchema),
  guards: z.record(GuardSchema).default({}),
  artifacts: z.array(ArtifactDefinitionSchema).default([]),
  roles: z.array(RoleDefinitionSchema).default([]),
});

type ProcessYaml = z.infer<typeof ProcessYamlSchema>;

// =============================================================================
// パース関数
// =============================================================================

/**
 * YAML 文字列を Process 型にパースする
 * @param yaml - Process 定義の YAML 文字列
 * @returns Process 型
 * @throws ProcessParseError - パースまたはバリデーション失敗時
 */
export function parseProcess(yaml: string): Process {
  let parsed: unknown;

  try {
    parsed = parseYaml(yaml);
  } catch (error) {
    throw new ProcessParseError("Invalid YAML syntax", error);
  }

  const result = ProcessYamlSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new ProcessParseError(`Invalid process definition: ${errors}`);
  }

  return yamlToProcess(result.data);
}

/**
 * パース結果を Process 型に変換
 * exactOptionalPropertyTypes に対応するため、undefined を除外
 */
function yamlToProcess(yaml: ProcessYaml): Process {
  const result: Process = {
    id: yaml.process.id,
    version: yaml.process.version,
    name: yaml.process.name,
    initial_state: yaml.process.initial_state,
    states: yaml.states.map((s) => ({
      name: s.name,
      ...(s.description !== undefined && { description: s.description }),
      ...(s.prompt !== undefined && { prompt: s.prompt }),
      ...(s.required_artifacts !== undefined && { required_artifacts: s.required_artifacts }),
      ...(s.is_final !== undefined && { is_final: s.is_final }),
    })),
    events: yaml.events.map((e) => ({
      name: e.name,
      allowed_roles: e.allowed_roles,
      ...(e.description !== undefined && { description: e.description }),
      ...(e.payload_schema !== undefined && { payload_schema: e.payload_schema }),
    })),
    transitions: yaml.transitions.map((t) => ({
      from: t.from,
      event: t.event,
      to: t.to,
      ...(t.guard !== undefined && { guard: t.guard }),
      ...(t.allowed_roles !== undefined && { allowed_roles: t.allowed_roles }),
      ...(t.description !== undefined && { description: t.description }),
    })),
    guards: yaml.guards,
    artifacts: yaml.artifacts.map((a) => ({
      type: a.type,
      ...(a.description !== undefined && { description: a.description }),
      ...(a.required_in_states !== undefined && { required_in_states: a.required_in_states }),
      ...(a.required_for_transitions !== undefined && { required_for_transitions: a.required_for_transitions }),
      ...(a.schema !== undefined && { schema: a.schema }),
    })),
    roles: yaml.roles.map((r) => ({
      name: r.name,
      allowed_events: r.allowed_events,
      ...(r.description !== undefined && { description: r.description }),
      ...(r.can_approve !== undefined && { can_approve: r.can_approve }),
      ...(r.can_reject !== undefined && { can_reject: r.can_reject }),
    })),
  };

  if (yaml.process.description !== undefined) {
    result.description = yaml.process.description;
  }
  if (yaml.process.initial_context !== undefined) {
    result.initial_context = yaml.process.initial_context;
  }
  if (yaml.process.context_schema !== undefined) {
    result.context_schema = yaml.process.context_schema;
  }

  return result;
}

/**
 * ファイルから Process を読み込む
 * @param filePath - YAML ファイルのパス
 * @returns Process 型
 * @throws ProcessParseError - 読み込みまたはパース失敗時
 */
export async function parseProcessFile(filePath: string): Promise<Process> {
  const fs = await import("node:fs/promises");

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new ProcessParseError(`Failed to read file: ${filePath}`, error);
  }

  return parseProcess(content);
}
