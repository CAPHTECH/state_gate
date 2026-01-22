/**
 * 共通の型定義
 * 循環参照を避けるため、複数モジュールで使用される型をここに配置
 */

/**
 * JSON Schema の簡易型定義
 * MVP では詳細な検証は行わないため、Record で表現
 */
export type JSONSchema = Record<string, unknown>;
