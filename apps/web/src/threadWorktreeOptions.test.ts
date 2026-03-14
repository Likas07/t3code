import { describe, expect, it } from "vitest";

import { buildThreadWorktreeOptions } from "./threadWorktreeOptions";

describe("buildThreadWorktreeOptions", () => {
  it("includes project checkout and explicit worktrees for local branches", () => {
    const options = buildThreadWorktreeOptions({
      projectCwd: "/repo",
      activeBranch: "feature/api",
      activeWorktreePath: "/tmp/worktrees/feature-api",
      branches: [
        {
          name: "main",
          current: true,
          isDefault: true,
          isRemote: false,
          worktreePath: "/repo",
        },
        {
          name: "feature/api",
          current: false,
          isDefault: false,
          isRemote: false,
          worktreePath: "/tmp/worktrees/feature-api",
        },
        {
          name: "origin/feature/api",
          current: false,
          isDefault: false,
          isRemote: true,
          remoteName: "origin",
          worktreePath: null,
        },
      ],
    });

    expect(options).toEqual([
      {
        id: "worktree-option-1",
        label: "feature/api - feature-api (current)",
        branch: "feature/api",
        worktreePath: "/tmp/worktrees/feature-api",
      },
      {
        id: "worktree-option-0",
        label: "Project checkout - main",
        branch: "main",
        worktreePath: null,
      },
    ]);
  });

  it("deduplicates repeated branch/worktree pairs", () => {
    const options = buildThreadWorktreeOptions({
      projectCwd: "/repo",
      activeBranch: null,
      activeWorktreePath: null,
      branches: [
        {
          name: "feature/a",
          current: false,
          isDefault: false,
          isRemote: false,
          worktreePath: "/tmp/worktrees/feature-a",
        },
        {
          name: "feature/a",
          current: false,
          isDefault: false,
          isRemote: false,
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.worktreePath).toBe("/tmp/worktrees/feature-a");
  });
});
