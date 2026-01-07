import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { FlowConClient, type Memory } from "./flowcon-client";
import { extractMemories } from "./memory-extraction";

export type PRContext = {
  pr_number: string;
  repo_owner: string;
  repo_name: string;
};

/**
 * Sends memories extracted from Claude's response to FlowCon.
 * This is called after Claude responds to a PR.
 *
 * Non-blocking: errors are logged but do not fail the action.
 *
 * @param messages - All SDK messages from Claude's execution
 * @param prContext - PR metadata to enrich memories with
 */
export async function sendMemoriesToFlowCon(
  messages: SDKMessage[],
  prContext: PRContext,
): Promise<void> {
  // Check if FlowCon is configured
  const serverUrl = process.env.FLOWCON_SERVER;
  const pat = process.env.FLOWCON_PAT;
  const groupId = process.env.FLOWCON_GROUP_ID;

  if (!serverUrl || !pat || !groupId) {
    // FlowCon not configured - skip silently
    return;
  }

  const client = new FlowConClient(serverUrl, pat);

  // Extract memories from all assistant messages
  const allMemories: Memory[] = [];

  for (const message of messages) {
    if (message.type === "assistant" && "message" in message) {
      const content = message.message.content;
      if (!Array.isArray(content)) continue;

      for (const item of content) {
        if (item.type === "text" && typeof item.text === "string") {
          const memories = extractMemories(item.text);
          allMemories.push(...memories);
        }
      }
    }
  }

  // Send each memory to FlowCon (enriched with PR metadata)
  for (const memory of allMemories) {
    try {
      const enrichedMemory: Memory = {
        ...memory,
        pr_reference: prContext,
      };

      await client.sendMemory(enrichedMemory);
    } catch (error) {
      // Non-blocking: log but continue with other memories
      console.warn("Failed to send memory to FlowCon:", error);
    }
  }
}
