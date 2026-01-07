import type { Memory } from "./flowcon-client";

/**
 * Extracts memories from Claude's response that are wrapped in <memories> tags.
 * Memories should be valid JSON objects or arrays with "content" and "tags" fields.
 *
 * @param response - Claude's response text
 * @returns Array of valid Memory objects
 */
export function extractMemories(response: string): Memory[] {
  const memories: Memory[] = [];

  // Match all <memories>...</memories> blocks
  const regex = /<memories>([\s\S]*?)<\/memories>/g;
  const matches = response.matchAll(regex);

  for (const match of matches) {
    const content = match[1].trim();

    if (!content) {
      continue;
    }

    try {
      const parsed = JSON.parse(content);

      // Handle both single object and array
      const items = Array.isArray(parsed) ? parsed : [parsed];

      // Validate and filter memories
      for (const item of items) {
        if (isValidMemory(item)) {
          memories.push(item);
        }
      }
    } catch (error) {
      // Invalid JSON - skip this block
      continue;
    }
  }

  return memories;
}

/**
 * Validates that an object is a valid Memory
 */
function isValidMemory(obj: any): obj is Memory {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.content === "string" &&
    Array.isArray(obj.tags)
  );
}
