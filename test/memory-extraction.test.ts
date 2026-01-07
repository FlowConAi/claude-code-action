import { describe, test, expect } from "bun:test";
import { extractMemories } from "../src/memory-extraction";

describe("extractMemories", () => {
  describe("basic extraction", () => {
    test("extracts single memory from <memories> tag", () => {
      const response = `
Here's my analysis of the PR.

<memories>
{"content": "User prefers React hooks over class components", "tags": ["preferences", "react"]}
</memories>

That's all for now.
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(1);
      expect(memories[0]).toEqual({
        content: "User prefers React hooks over class components",
        tags: ["preferences", "react"],
      });
    });

    test("extracts multiple memories from single <memories> block", () => {
      const response = `
Analysis complete.

<memories>
[
  {"content": "Codebase uses TypeScript strict mode", "tags": ["typescript", "config"]},
  {"content": "Tests use Bun test framework", "tags": ["testing", "tooling"]}
]
</memories>
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(2);
      expect(memories[0]).toEqual({
        content: "Codebase uses TypeScript strict mode",
        tags: ["typescript", "config"],
      });
      expect(memories[1]).toEqual({
        content: "Tests use Bun test framework",
        tags: ["testing", "tooling"],
      });
    });

    test("extracts memories from multiple <memories> tags", () => {
      const response = `
First observation:
<memories>
{"content": "PR adds FlowCon integration", "tags": ["feature"]}
</memories>

Second observation:
<memories>
{"content": "Integration is non-blocking", "tags": ["architecture"]}
</memories>
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(2);
      expect(memories[0]).toEqual({
        content: "PR adds FlowCon integration",
        tags: ["feature"],
      });
      expect(memories[1]).toEqual({
        content: "Integration is non-blocking",
        tags: ["architecture"],
      });
    });
  });

  describe("edge cases", () => {
    test("returns empty array when no <memories> tag present", () => {
      const response = "Just a regular response without memories.";
      const memories = extractMemories(response);
      expect(memories).toEqual([]);
    });

    test("returns empty array when <memories> tag is empty", () => {
      const response = "<memories></memories>";
      const memories = extractMemories(response);
      expect(memories).toEqual([]);
    });

    test("handles whitespace inside <memories> tag", () => {
      const response = `
<memories>

  {"content": "Memory with whitespace", "tags": ["test"]}

</memories>
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(1);
      expect(memories[0]).toEqual({
        content: "Memory with whitespace",
        tags: ["test"],
      });
    });

    test("handles malformed JSON gracefully", () => {
      const response = `
<memories>
{invalid json content}
</memories>
`;

      const memories = extractMemories(response);

      // Should return empty array, not throw
      expect(memories).toEqual([]);
    });

    test("handles nested objects in memory", () => {
      const response = `
<memories>
{
  "content": "Complex memory",
  "tags": ["test"],
  "metadata": {
    "source": "PR-123",
    "timestamp": "2024-01-01"
  }
}
</memories>
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(1);
      expect(memories[0]).toEqual({
        content: "Complex memory",
        tags: ["test"],
        metadata: {
          source: "PR-123",
          timestamp: "2024-01-01",
        },
      });
    });
  });

  describe("validation", () => {
    test("requires content field in memory", () => {
      const response = `
<memories>
{"tags": ["missing-content"]}
</memories>
`;

      const memories = extractMemories(response);

      // Invalid memory should be filtered out
      expect(memories).toEqual([]);
    });

    test("requires tags field in memory", () => {
      const response = `
<memories>
{"content": "Missing tags field"}
</memories>
`;

      const memories = extractMemories(response);

      // Invalid memory should be filtered out
      expect(memories).toEqual([]);
    });

    test("tags must be an array", () => {
      const response = `
<memories>
{"content": "Invalid tags", "tags": "not-an-array"}
</memories>
`;

      const memories = extractMemories(response);

      // Invalid memory should be filtered out
      expect(memories).toEqual([]);
    });

    test("filters out invalid memories from array", () => {
      const response = `
<memories>
[
  {"content": "Valid memory", "tags": ["test"]},
  {"content": "Missing tags"},
  {"tags": ["missing-content"]},
  {"content": "Another valid one", "tags": ["test2"]}
]
</memories>
`;

      const memories = extractMemories(response);

      expect(memories).toHaveLength(2);
      expect(memories[0].content).toBe("Valid memory");
      expect(memories[1].content).toBe("Another valid one");
    });
  });
});
