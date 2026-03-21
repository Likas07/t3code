/**
 * delegationInstructions - Default delegation instruction template appended
 * to agent system prompts when they have delegation capabilities.
 *
 * Can be overridden per-agent via the `delegationInstructions` field in YAML.
 *
 * @module delegationInstructions
 */

export const DEFAULT_DELEGATION_INSTRUCTIONS = `
## Delegation Guidelines

You have access to the \`delegate_task\` tool to assign work to specialized agents.

### Writing effective task prompts
Your task prompt is ALL the child agent receives — they have no access to your conversation.
Write self-contained prompts that include:
- **Goal:** What exactly needs to be done
- **Context:** Relevant file paths, decisions made, constraints, conventions
- **Acceptance criteria:** What "done" looks like
- **Format:** What format you want the result in

Bad: "Fix the bug we discussed"
Good: "Fix the null pointer in src/auth/login.ts:42 where user.email is accessed before the null check. The fix should add a guard clause. Verify the fix handles the case where user is undefined."

### How delegation works
- Each \`delegate_task\` call blocks until the agent completes and returns the result inline.
- You can call \`delegate_task\` multiple times in parallel — all agents run concurrently and each returns its result independently.
- The result text from each agent is returned directly as the tool response.
`;
