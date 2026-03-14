import type { GitBranch } from "@t3tools/contracts";

import { formatWorktreePathForDisplay } from "./worktreeCleanup";

export interface ThreadWorktreeOption {
  readonly id: string;
  readonly label: string;
  readonly branch: string;
  readonly worktreePath: string | null;
}

export function buildThreadWorktreeOptions(input: {
  readonly branches: ReadonlyArray<GitBranch>;
  readonly projectCwd: string;
  readonly activeBranch: string | null;
  readonly activeWorktreePath: string | null;
}): ReadonlyArray<ThreadWorktreeOption> {
  const normalizedProjectCwd = input.projectCwd.trim();
  const options: ThreadWorktreeOption[] = [];
  const seen = new Set<string>();

  for (const branch of input.branches) {
    if (branch.isRemote || branch.worktreePath === null) {
      continue;
    }

    const normalizedWorktreePath =
      branch.worktreePath === normalizedProjectCwd ? null : branch.worktreePath;
    const dedupeKey = `${branch.name}\u0000${normalizedWorktreePath ?? ""}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const isProjectCheckout = normalizedWorktreePath === null;
    const isCurrentSelection =
      branch.name === input.activeBranch && normalizedWorktreePath === input.activeWorktreePath;
    const baseLabel = isProjectCheckout
      ? `Project checkout - ${branch.name}`
      : `${branch.name} - ${formatWorktreePathForDisplay(branch.worktreePath)}`;

    options.push({
      id: `worktree-option-${options.length}`,
      label: isCurrentSelection ? `${baseLabel} (current)` : baseLabel,
      branch: branch.name,
      worktreePath: normalizedWorktreePath,
    });
  }

  return options.toSorted((left, right) => {
    const leftIsCurrent =
      left.branch === input.activeBranch && left.worktreePath === input.activeWorktreePath;
    const rightIsCurrent =
      right.branch === input.activeBranch && right.worktreePath === input.activeWorktreePath;
    if (leftIsCurrent !== rightIsCurrent) {
      return leftIsCurrent ? -1 : 1;
    }

    const leftIsProjectCheckout = left.worktreePath === null;
    const rightIsProjectCheckout = right.worktreePath === null;
    if (leftIsProjectCheckout !== rightIsProjectCheckout) {
      return leftIsProjectCheckout ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}
