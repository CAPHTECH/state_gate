/**
 * 共通の型定義
 * 循環参照を避けるため、複数モジュールで使用される型をここに配置
 */

/**
 * JSON Schema の型定義（Draft-07 ベース、主要フィールドのみ）
 * MVP では詳細な検証は行わないが、型チェックの恩恵を受けるため構造を定義
 */
export interface JSONSchema {
  /** スキーマの型 */
  type?: JSONSchemaType | JSONSchemaType[];
  /** オブジェクトのプロパティ定義 */
  properties?: Record<string, JSONSchema>;
  /** 必須プロパティ */
  required?: string[];
  /** 配列の要素スキーマ */
  items?: JSONSchema | JSONSchema[];
  /** 説明 */
  description?: string;
  /** デフォルト値 */
  default?: unknown;
  /** 列挙値 */
  enum?: unknown[];
  /** 追加プロパティの許可（デフォルト: true） */
  additionalProperties?: boolean | JSONSchema;
  /** 拡張用: 未定義のフィールドも許容 */
  [key: string]: unknown;
}

/** JSON Schema で使用する型名 */
export type JSONSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";
