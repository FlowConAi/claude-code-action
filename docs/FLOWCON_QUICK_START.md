# FlowCon Integration Quick Start Guide

## What is FlowCon Integration?

The FlowCon integration allows the Claude Code Action to automatically extract and store memories from Claude's analysis of GitHub pull requests. This enables building a knowledge graph of patterns, decisions, and insights from your codebase.

## Setup (3 Steps)

### 1. Configure GitHub Secrets

Add to your repository (Settings → Secrets and variables → Actions):

```
FLOWCON_PAT=your_personal_access_token
FLOWCON_SERVER=https://flowcon.example.com
FLOWCON_GROUP_ID=your_group_id
```

### 2. Update Workflow

```yaml
- name: Claude Code with FlowCon
  uses: user/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}

    # Add FlowCon config
    flowcon_pat: ${{ secrets.FLOWCON_PAT }}
    flowcon_server: ${{ secrets.FLOWCON_SERVER }}
    flowcon_group_id: ${{ secrets.FLOWCON_GROUP_ID }}
```

### 3. Update Claude Prompt

Include instructions for Claude to output memories in `<memories>` blocks:

```
When you identify important patterns, architectural decisions,
or important code practices, document them in <memories> blocks:

<memories>
{
  "content": "Brief description of what you found",
  "tags": ["category1", "category2"]
}
</memories>
```

## Memory Format

Claude should output JSON memories wrapped in `<memories>` tags:

```json
{
  "content": "Description of the finding",
  "tags": ["tag1", "tag2"],
  "optional_field": "additional data"
}
```

### Required Fields
- `content` (string): What to remember
- `tags` (array): Classification labels

### Optional Fields
- Any additional JSON properties are preserved

### Examples

```javascript
// Single memory
<memories>
{"content": "Uses React hooks patterns", "tags": ["react", "patterns"]}
</memories>

// Multiple memories
<memories>
[
  {"content": "TypeScript strict mode enabled", "tags": ["config"]},
  {"content": "Vitest for unit tests", "tags": ["testing"]}
]
</memories>

// Multiple blocks
<memories>
{"content": "First finding", "tags": ["tag1"]}
</memories>

<memories>
{"content": "Second finding", "tags": ["tag2"]}
</memories>
```

## How It Works

1. **Execution**: Action runs Claude on your PR
2. **Extraction**: Memories are extracted from Claude's response
3. **Enrichment**: PR context added (PR #, repo, owner)
4. **Storage**: Memories sent to FlowCon server
5. **Resilience**: Automatic retry (1s, 2s, 4s) on failure
6. **Graceful Degradation**: Action succeeds even if FlowCon fails

## Verify It's Working

### Check Action Logs
After workflow runs, look for:
```
✅ Memory extraction successful
✅ Sent N memories to FlowCon
```

### Check FlowCon UI
- Log into FlowCon
- Navigate to your group
- Verify memories appear with PR context

### Test Manually
```bash
# From your action repository
bun test test/flowcon*
# Should show: 33 pass, 0 fail
```

## Troubleshooting

### No memories being stored
1. Check Claude prompt includes `<memories>` tags
2. Verify FlowCon secrets are set correctly
3. Check action logs for extraction messages

### Action fails on FlowCon error
This shouldn't happen - FlowCon is non-blocking. If the action fails, it's likely an issue with Claude execution, not FlowCon.

### FlowCon server unreachable
Action will gracefully degrade:
- Retry up to 3 times (1s, 2s, 4s delays)
- Return success anyway
- Log warning: "Failed to send memory to FlowCon"

### Invalid memories not being stored
The extraction validates:
- `content` must be a string
- `tags` must be an array
- Both required

Invalid memories are silently skipped.

## Key Files

| File | Purpose |
|------|---------|
| `src/flowcon-client.ts` | FlowCon HTTP client with retry logic |
| `src/memory-extraction.ts` | Parser for `<memories>` blocks |
| `src/flowcon-integration.ts` | Main integration orchestrator |
| `action.yml` | GitHub Action input definitions |
| `docs/FLOWCON_E2E_TEST_RESULTS.md` | Detailed E2E documentation |

## Running Tests

```bash
# All FlowCon tests
bun test test/flowcon* test/memory-extraction*

# Single test file
bun test test/flowcon-client.test.ts

# Watch mode
bun test --watch test/flowcon*
```

## API Reference

### sendMemoriesToFlowCon(messages, prContext)

Called automatically after Claude execution.

**Parameters:**
- `messages`: SDKMessage[] from Claude execution
- `prContext`: { pr_number, repo_owner, repo_name }

**Behavior:**
- Extracts memories from assistant messages
- Sends to FlowCon (non-blocking)
- Returns void (always succeeds)

### Memory Interface

```typescript
type Memory = {
  content: string;
  tags: string[];
  [key: string]: any;
};
```

### FlowConClient

```typescript
class FlowConClient {
  constructor(serverUrl: string, pat: string)
  async sendMemory(memory: Memory): Promise<{ success: boolean }>
}
```

## Environment Variables

Used internally by the integration:

| Variable | Source | Description |
|----------|--------|-------------|
| `FLOWCON_SERVER` | action.yml input | FlowCon instance URL |
| `FLOWCON_PAT` | action.yml input | Authentication token |
| `FLOWCON_GROUP_ID` | action.yml input | Graphiti group ID |

## Rate Limiting & Performance

- **Sequential sending**: Memories sent one at a time (safe for rate limits)
- **Timeout**: 3s total with retries (1s + 2s + 4s)
- **Non-blocking**: All operations fire-and-forget
- **Performance impact**: < 5s added to workflow

## Security Considerations

1. **PAT Token**: Treated as secret, never logged
2. **PR Context**: Only metadata stored (numbers, names, no code)
3. **Memory Content**: Stored as-is from Claude's response
4. **No Credentials**: Memory storage doesn't expose GitHub tokens

## Next Steps

1. Set up FlowCon server (if not already running)
2. Add secrets to your GitHub repository
3. Update workflow with FlowCon inputs
4. Update Claude prompt to output memories
5. Run a test PR to verify extraction

## Support

- Issues: Check action logs for error messages
- Tests: `bun test test/flowcon*`
- Docs: `/docs/FLOWCON_E2E_TEST_RESULTS.md`

## Architecture Diagram

```
GitHub PR
    ↓
Claude Code Action
    ├─ Run Claude on PR
    ├─ Generate analysis
    └─ Include <memories> blocks
         ↓
    Extract Memories
         ↓
    Enrich with PR Context
         ↓
    Send to FlowCon (Non-blocking)
         ├─ POST /api/memories
         ├─ Retry 3x (1s, 2s, 4s)
         └─ Graceful degradation
              ↓
         FlowCon Graph Database
         (Knowledge stored)
```

## Limitations

1. Requires external FlowCon server (optional for action to run)
2. GitHub Action runners need network access to FlowCon
3. Memory storage is eventual (non-blocking)
4. No real-time feedback to workflow
5. PAT tokens must be rotated periodically

## Version Compatibility

- Claude Code Action: v1.0+
- Bun: 1.3.4+
- Node.js: 18+ (if using Node instead of Bun)
