import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { sendMemoriesToFlowCon } from "../src/flowcon-integration";
import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

describe("sendMemoriesToFlowCon", () => {
  const mockFetch = mock(() => Promise.resolve(new Response()));
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as any;
    mockFetch.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("environment configuration", () => {
    test("skips when FLOWCON_SERVER is not set", async () => {
      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"test\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "test",
        repo_name: "test",
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("skips when FLOWCON_PAT is not set", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      process.env.FLOWCON_SERVER = "http://localhost:8080";

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"test\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "test",
        repo_name: "test",
      });

      expect(mockFetch).not.toHaveBeenCalled();

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
    });

    test("skips when FLOWCON_GROUP_ID is not set", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"test\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "test",
        repo_name: "test",
      });

      expect(mockFetch).not.toHaveBeenCalled();

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
    });

    test("processes memories when all env vars are set", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"test memory\",\"tags\":[\"test\"]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "owner",
        repo_name: "repo",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });
  });

  describe("memory extraction from messages", () => {
    test("extracts memories from assistant messages", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Analysis:\n<memories>{\"content\":\"Memory 1\",\"tags\":[\"tag1\"]}</memories>" },
            ],
          },
        },
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "More analysis:\n<memories>{\"content\":\"Memory 2\",\"tags\":[\"tag2\"]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "owner",
        repo_name: "repo",
      });

      // Should have 2 calls - one for each memory
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });

    test("enriches memories with PR metadata", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"Test memory\",\"tags\":[\"test\"]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "456",
        repo_owner: "myorg",
        repo_name: "myrepo",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(body).toMatchObject({
        content: "Test memory",
        tags: ["test"],
        pr_reference: {
          pr_number: "456",
          repo_owner: "myorg",
          repo_name: "myrepo",
        },
      });

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });

    test("skips non-assistant messages", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const messages: SDKMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "test",
          model: "claude-3-5-sonnet-20241022",
          tools: [],
        },
        {
          type: "user",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: [
              { type: "text", text: "<memories>{\"content\":\"Should be ignored\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "owner",
        repo_name: "repo",
      });

      expect(mockFetch).not.toHaveBeenCalled();

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });
  });

  describe("error handling", () => {
    test("does not throw on FlowCon API errors", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      mockFetch.mockRejectedValue(new Error("Network failure"));

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"test\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      // Should not throw - graceful degradation
      await expect(
        sendMemoriesToFlowCon(messages, {
          pr_number: "123",
          repo_owner: "owner",
          repo_name: "repo",
        }),
      ).resolves.toBeUndefined();

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });

    test("continues sending other memories if one fails", async () => {
      const oldServer = process.env.FLOWCON_SERVER;
      const oldPat = process.env.FLOWCON_PAT;
      const oldGroupId = process.env.FLOWCON_GROUP_ID;

      process.env.FLOWCON_SERVER = "http://localhost:8080";
      process.env.FLOWCON_PAT = "test-token";
      process.env.FLOWCON_GROUP_ID = "test-group";

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

      const messages: SDKMessage[] = [
        {
          type: "assistant",
          session_id: "test",
          parent_tool_use_id: null,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "<memories>{\"content\":\"Memory 1\",\"tags\":[]}</memories>" },
              { type: "text", text: "<memories>{\"content\":\"Memory 2\",\"tags\":[]}</memories>" },
            ],
          },
        },
      ];

      await sendMemoriesToFlowCon(messages, {
        pr_number: "123",
        repo_owner: "owner",
        repo_name: "repo",
      });

      // Should attempt to send both memories
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      if (oldServer) {
        process.env.FLOWCON_SERVER = oldServer;
      } else {
        delete process.env.FLOWCON_SERVER;
      }
      if (oldPat) {
        process.env.FLOWCON_PAT = oldPat;
      } else {
        delete process.env.FLOWCON_PAT;
      }
      if (oldGroupId) {
        process.env.FLOWCON_GROUP_ID = oldGroupId;
      } else {
        delete process.env.FLOWCON_GROUP_ID;
      }
    });
  });
});
