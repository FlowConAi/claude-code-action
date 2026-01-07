import * as core from "@actions/core";
import type { Mode, ModeOptions, ModeResult } from "../types";
import { checkContainsTrigger } from "../../github/validation/trigger";
import { checkHumanActor } from "../../github/validation/actor";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { setupBranch } from "../../github/operations/branch";
import {
  configureGitAuth,
  setupSshSigning,
} from "../../github/operations/git-config";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import {
  fetchGitHubData,
  extractTriggerTimestamp,
} from "../../github/data/fetcher";
import { createPrompt, generateDefaultPrompt } from "../../create-prompt";
import { isEntityContext } from "../../github/context";
import type { PreparedContext } from "../../create-prompt/types";
import type { FetchDataResult } from "../../github/data/fetcher";
import { parseAllowedTools } from "../agent/parse-tools";

/**
 * Tag mode implementation.
 *
 * The traditional implementation mode that responds to @claude mentions,
 * issue assignments, or labels. Creates tracking comments showing progress
 * and has full implementation capabilities.
 */
export const tagMode: Mode = {
  name: "tag",
  description: "Traditional implementation mode triggered by @claude mentions",

  shouldTrigger(context) {
    // Tag mode only handles entity events
    if (!isEntityContext(context)) {
      return false;
    }
    return checkContainsTrigger(context);
  },

  prepareContext(context, data) {
    return {
      mode: "tag",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    return [];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return true;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    // Tag mode only handles entity-based events
    if (!isEntityContext(context)) {
      throw new Error("Tag mode requires entity context");
    }

    // Check if actor is human
    await checkHumanActor(octokit.rest, context);

    // Create initial tracking comment
    const commentData = await createInitialComment(octokit.rest, context);
    const commentId = commentData.id;

    const triggerTime = extractTriggerTimestamp(context);

    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
      triggerUsername: context.actor,
      triggerTime,
    });

    // Setup branch
    const branchInfo = await setupBranch(octokit, githubData, context);

    // Configure git authentication
    // SSH signing takes precedence if provided
    const useSshSigning = !!context.inputs.sshSigningKey;
    const useApiCommitSigning =
      context.inputs.useCommitSigning && !useSshSigning;

    if (useSshSigning) {
      // Setup SSH signing for commits
      await setupSshSigning(context.inputs.sshSigningKey);

      // Still configure git auth for push operations (user/email and remote URL)
      const user = {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      };
      try {
        await configureGitAuth(githubToken, context, user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        throw error;
      }
    } else if (!useApiCommitSigning) {
      // Use bot_id and bot_name from inputs directly
      const user = {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      };

      try {
        await configureGitAuth(githubToken, context, user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        throw error;
      }
    }

    // Create prompt file
    const modeContext = this.prepareContext(context, {
      commentId,
      baseBranch: branchInfo.baseBranch,
      claudeBranch: branchInfo.claudeBranch,
    });

    await createPrompt(tagMode, modeContext, githubData, context);

    const userClaudeArgs = process.env.CLAUDE_ARGS || "";
    const userAllowedMCPTools = parseAllowedTools(userClaudeArgs).filter(
      (tool) => tool.startsWith("mcp__github_"),
    );

    // Build claude_args for tag mode with required tools
    // Tag mode REQUIRES these tools to function properly
    const tagModeTools = [
      "Edit",
      "MultiEdit",
      "Glob",
      "Grep",
      "LS",
      "Read",
      "Write",
      "mcp__github_comment__update_claude_comment",
      "mcp__github_ci__get_ci_status",
      "mcp__github_ci__get_workflow_run_details",
      "mcp__github_ci__download_job_log",
      ...userAllowedMCPTools,
    ];

    // Add git commands when using git CLI (no API commit signing, or SSH signing)
    // SSH signing still uses git CLI, just with signing enabled
    if (!useApiCommitSigning) {
      tagModeTools.push(
        "Bash(git add:*)",
        "Bash(git commit:*)",
        "Bash(git push:*)",
        "Bash(git status:*)",
        "Bash(git diff:*)",
        "Bash(git log:*)",
        "Bash(git rm:*)",
      );
    } else {
      // When using API commit signing, use MCP file ops tools
      tagModeTools.push(
        "mcp__github_file_ops__commit_files",
        "mcp__github_file_ops__delete_files",
      );
    }

    // Get our GitHub MCP servers configuration
    const ourMcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.claudeBranch || branchInfo.currentBranch,
      baseBranch: branchInfo.baseBranch,
      claudeCommentId: commentId.toString(),
      allowedTools: Array.from(new Set(tagModeTools)),
      mode: "tag",
      context,
    });

    // Build complete claude_args with multiple --mcp-config flags
    let claudeArgs = "";

    // Add our GitHub servers config
    const escapedOurConfig = ourMcpConfig.replace(/'/g, "'\\''");
    claudeArgs = `--mcp-config '${escapedOurConfig}'`;

    // Add required tools for tag mode
    claudeArgs += ` --allowedTools "${tagModeTools.join(",")}"`;

    // Append user's claude_args (which may have more --mcp-config flags)
    if (userClaudeArgs) {
      claudeArgs += ` ${userClaudeArgs}`;
    }

    core.setOutput("claude_args", claudeArgs.trim());

    return {
      commentId,
      branchInfo,
      mcpConfig: ourMcpConfig,
    };
  },

  generatePrompt(
    context: PreparedContext,
    githubData: FetchDataResult,
    useCommitSigning: boolean,
  ): string {
    const defaultPrompt = generateDefaultPrompt(
      context,
      githubData,
      useCommitSigning,
    );

    // If a custom prompt is provided, inject it into the tag mode prompt
    if (context.githubContext?.inputs?.prompt) {
      return (
        defaultPrompt +
        `

<custom_instructions>
${context.githubContext.inputs.prompt}
</custom_instructions>`
      );
    }

    return defaultPrompt;
  },

  getSystemPrompt() {
    // Check for custom memory extraction prompt from environment
    const customPrompt = process.env.FLOWCON_MEMORY_PROMPT;

    if (customPrompt) {
      return customPrompt;
    }

    // Default memory extraction prompt with few-shot examples
    return `
ADDITIONAL TASK: Documentation and Knowledge Extraction

After analyzing the code changes, also:

1. DOCUMENTATION SUGGESTIONS
For each code change that affects documented behavior:
- Identify which doc file(s) need updates
- Generate suggestions in GitHub suggestion format

2. MEMORY EXTRACTION
Extract key knowledge for the AI assistant.
Each memory MUST be:
- 4-6 sentences minimum
- Describe relationships between components
- Include specific names (classes, methods, patterns)

Return memories as JSON array in a <memories> tag.

Example output:
<memories>
[
  {"content": "The AuthService class handles JWT token validation and refresh. It depends on UserRepository for credential verification and uses bcrypt for password hashing. The service implements a singleton pattern to maintain a single connection pool to the auth database. All authentication errors are logged to the security audit trail.", "tags": ["auth", "security", "architecture"]},
  {"content": "API rate limiting is implemented via Redis with a sliding window algorithm. The RateLimiter middleware checks X-API-Key header and enforces 100 req/min per key. Rate limit counters expire after 60 seconds. When a limit is exceeded, the middleware returns a 429 status with a Retry-After header indicating when the client can retry.", "tags": ["api", "rate-limiting", "infrastructure"]}
]
</memories>
`.trim();
  },
};
