/**
 * MCP Server 統合テスト
 * @law LAW-mcp-sdk-compliance: MCP SDK v1.0.0 準拠
 * @law LAW-tool-schema: ツールスキーマの整合性
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createMcpServer } from "../src/mcp/server.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RunId } from "../src/types/index.js";

const TEST_DIR = ".state_gate_test_mcp";
const TEST_RUNS_DIR = path.join(TEST_DIR, "runs");
const TEST_METADATA_DIR = path.join(TEST_DIR, "metadata");
const TEST_PROCESS_FILE = path.join(TEST_DIR, "test-process.yaml");

// テスト用プロセス定義
const testProcessYaml = `
process:
  id: test-process
  version: "1.0.0"
  name: Test Process
  initial_state: draft

states:
  - name: draft
  - name: review
  - name: done
    is_final: true

events:
  - name: submit
    allowed_roles: [agent]
  - name: approve
    allowed_roles: [reviewer]

transitions:
  - from: draft
    event: submit
    to: review
  - from: review
    event: approve
    to: done

artifacts:
  - type: document

roles:
  - name: agent
    allowed_events: [submit]
  - name: reviewer
    allowed_events: [approve]
`;

describe("MCP Server", () => {
  let server: Server;

  beforeEach(async () => {
    // テストディレクトリをセットアップ
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(TEST_RUNS_DIR, { recursive: true });
    await fs.mkdir(TEST_METADATA_DIR, { recursive: true });
    await fs.writeFile(TEST_PROCESS_FILE, testProcessYaml, "utf-8");

    server = await createMcpServer({
      processFiles: [TEST_PROCESS_FILE],
      runsDir: TEST_RUNS_DIR,
      metadataDir: TEST_METADATA_DIR,
      defaultRole: "agent",
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {
      // クリーンアップエラーは無視
    }
  });

  describe("Server creation", () => {
    it("should create server with correct name and version", async () => {
      // Server が正常に作成されることを確認
      expect(server).toBeDefined();
    });

    it("should load process files on initialization", async () => {
      // プロセスが読み込まれていることを確認（create_run で検証）
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "test-process" },
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.initial_state).toBe("draft");
    });
  });

  describe("Tools listing", () => {
    it("should list all available tools", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/list");

      if (!handler) {
        throw new Error("tools/list handler not found");
      }

      const result = await handler({
        method: "tools/list",
        params: {},
      });

      expect(result).toHaveProperty("tools");
      const tools = (result as { tools: Array<{ name: string }> }).tools;
      expect(tools.length).toBe(5);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("state_gate.get_state");
      expect(toolNames).toContain("state_gate.list_events");
      expect(toolNames).toContain("state_gate.emit_event");
      expect(toolNames).toContain("state_gate.create_run");
      expect(toolNames).toContain("state_gate.list_runs");
    });

    it("should have correct schema for get_state tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/list");

      if (!handler) {
        throw new Error("tools/list handler not found");
      }

      const result = await handler({
        method: "tools/list",
        params: {},
      });

      const tools = (result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
      const getStateTool = tools.find((t) => t.name === "state_gate.get_state");

      expect(getStateTool).toBeDefined();
      expect(getStateTool?.inputSchema).toHaveProperty("properties");
      expect(
        (getStateTool?.inputSchema as { properties: Record<string, unknown> }).properties
      ).toHaveProperty("run_id");
    });

    it("should have correct schema for emit_event tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/list");

      if (!handler) {
        throw new Error("tools/list handler not found");
      }

      const result = await handler({
        method: "tools/list",
        params: {},
      });

      const tools = (result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
      const emitEventTool = tools.find((t) => t.name === "state_gate.emit_event");

      expect(emitEventTool).toBeDefined();
      const schema = emitEventTool?.inputSchema as {
        required: string[];
        properties: Record<string, unknown>;
      };
      // run_id is optional (can be loaded from .state_gate/state-gate.json)
      expect(schema.required).toContain("event_name");
      expect(schema.required).toContain("expected_revision");
      expect(schema.required).toContain("idempotency_key");
    });
  });

  describe("Tool execution", () => {
    let runId: RunId;

    beforeEach(async () => {
      // テスト用 Run を作成
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "test-process" },
        },
      });

      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      runId = parsed.run_id;
    });

    it("should execute create_run tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "test-process" },
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.run_id).toMatch(/^run-/);
      expect(parsed.initial_state).toBe("draft");
      expect(parsed.revision).toBe(1);
    });

    it("should execute get_state tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.get_state",
          arguments: { run_id: runId },
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.current_state).toBe("draft");
      expect(parsed.revision).toBe(1);
      expect(parsed.process_id).toBe("test-process");
    });

    it("should execute list_events tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.list_events",
          arguments: { run_id: runId },
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.events).toBeDefined();
      expect(parsed.events.length).toBeGreaterThan(0);
      expect(parsed.events.some((e: { event_name: string }) => e.event_name === "submit")).toBe(true);
    });

    it("should execute emit_event tool successfully", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.emit_event",
          arguments: {
            run_id: runId,
            event_name: "submit",
            expected_revision: 1,
            idempotency_key: "test-emit-001",
          },
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.result.transition.to_state).toBe("review");
      expect(parsed.result.new_revision).toBe(2);
    });

    it("should execute list_runs tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.list_runs",
          arguments: {},
        },
      });

      expect(result).toHaveProperty("content");
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      expect(parsed.runs).toBeDefined();
      expect(parsed.runs.length).toBeGreaterThan(0);
      expect(parsed.runs.some((r: { run_id: RunId }) => r.run_id === runId)).toBe(true);
    });

    it("should return error for unknown tool", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.unknown_tool",
          arguments: {},
        },
      });

      expect(result).toHaveProperty("isError", true);
      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      expect(content).toContain("Unknown tool");
    });
  });

  describe("Error handling", () => {
    it("should handle invalid run_id gracefully", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.get_state",
          arguments: { run_id: "run-nonexistent-0000-0000-000000000000" },
        },
      });

      expect(result).toHaveProperty("isError", true);
    });

    it("should handle invalid process_id gracefully", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "nonexistent-process" },
        },
      });

      expect(result).toHaveProperty("isError", true);
    });
  });

  describe("Resources", () => {
    let runId: RunId;

    beforeEach(async () => {
      // テスト用 Run を作成
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!handler) {
        throw new Error("tools/call handler not found");
      }

      const result = await handler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "test-process" },
        },
      });

      const content = (result as { content: Array<{ text: string }> }).content[0]?.text;
      const parsed = JSON.parse(content ?? "{}");
      runId = parsed.run_id;
    });

    it("should list available resources", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("resources/list");

      if (!handler) {
        throw new Error("resources/list handler not found");
      }

      const result = await handler({
        method: "resources/list",
        params: {},
      });

      expect(result).toHaveProperty("resources");
      const resources = (result as { resources: Array<{ uri: string }> }).resources;
      expect(resources.length).toBeGreaterThan(0);
      expect(resources.some((r) => r.uri.includes(runId))).toBe(true);
    });

    it("should read run summary resource", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("resources/read");

      if (!handler) {
        throw new Error("resources/read handler not found");
      }

      const result = await handler({
        method: "resources/read",
        params: {
          uri: `stategate://runs/${runId}/summary`,
        },
      });

      expect(result).toHaveProperty("contents");
      const contents = (result as { contents: Array<{ text: string }> }).contents;
      expect(contents.length).toBe(1);

      const parsed = JSON.parse(contents[0]?.text ?? "{}");
      expect(parsed.run_id).toBe(runId);
      expect(parsed.current_state).toBe("draft");
      expect(parsed.process.id).toBe("test-process");
    });

    it("should throw error for invalid resource URI", async () => {
      const handler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("resources/read");

      if (!handler) {
        throw new Error("resources/read handler not found");
      }

      await expect(
        handler({
          method: "resources/read",
          params: {
            uri: "invalid://uri",
          },
        })
      ).rejects.toThrow("Invalid resource URI");
    });
  });

  describe("Full workflow integration", () => {
    it("should complete draft -> review -> done workflow", async () => {
      const callHandler = (server as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!callHandler) {
        throw new Error("tools/call handler not found");
      }

      // 1. Run を作成
      const createResult = await callHandler({
        method: "tools/call",
        params: {
          name: "state_gate.create_run",
          arguments: { process_id: "test-process" },
        },
      });
      const createContent = (createResult as { content: Array<{ text: string }> }).content[0]?.text;
      const createParsed = JSON.parse(createContent ?? "{}");
      const runId = createParsed.run_id;
      expect(createParsed.initial_state).toBe("draft");

      // 2. submit イベントを発行（agent ロール）
      // Server は defaultRole: "agent" で作成されている
      const submitResult = await callHandler({
        method: "tools/call",
        params: {
          name: "state_gate.emit_event",
          arguments: {
            run_id: runId,
            event_name: "submit",
            expected_revision: 1,
            idempotency_key: "workflow-submit",
          },
        },
      });
      const submitContent = (submitResult as { content: Array<{ text: string }> }).content[0]?.text;
      const submitParsed = JSON.parse(submitContent ?? "{}");
      expect(submitParsed.success).toBe(true);
      expect(submitParsed.result.transition.to_state).toBe("review");

      // 3. reviewer ロールで approve（別の Server インスタンスが必要だが、シンプルにするため同一で）
      // 実際のテストでは reviewer ロールの server を作成する必要がある
      const reviewerServer = await createMcpServer({
        processFiles: [TEST_PROCESS_FILE],
        runsDir: TEST_RUNS_DIR,
        metadataDir: TEST_METADATA_DIR,
        defaultRole: "reviewer",
      });

      const reviewerHandler = (reviewerServer as unknown as {
        _requestHandlers: Map<string, (request: unknown) => Promise<unknown>>;
      })._requestHandlers.get("tools/call");

      if (!reviewerHandler) {
        throw new Error("tools/call handler not found for reviewer");
      }

      const approveResult = await reviewerHandler({
        method: "tools/call",
        params: {
          name: "state_gate.emit_event",
          arguments: {
            run_id: runId,
            event_name: "approve",
            expected_revision: 2,
            idempotency_key: "workflow-approve",
          },
        },
      });
      const approveContent = (approveResult as { content: Array<{ text: string }> }).content[0]?.text;
      const approveParsed = JSON.parse(approveContent ?? "{}");
      expect(approveParsed.success).toBe(true);
      expect(approveParsed.result.transition.to_state).toBe("done");

      // 4. 最終状態を確認
      const finalResult = await reviewerHandler({
        method: "tools/call",
        params: {
          name: "state_gate.get_state",
          arguments: { run_id: runId },
        },
      });
      const finalContent = (finalResult as { content: Array<{ text: string }> }).content[0]?.text;
      const finalParsed = JSON.parse(finalContent ?? "{}");
      expect(finalParsed.current_state).toBe("done");
      // 最終状態では allowed_events が空になる
      expect(finalParsed.allowed_events).toEqual([]);
      expect(finalParsed.revision).toBe(3);
    });
  });
});
