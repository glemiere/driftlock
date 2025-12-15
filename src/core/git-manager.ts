import { runCommand } from "./utils/run-commands";
import { tui } from "../cli/tui";

export type GitContext = {
  originalBranch?: string;
  branch?: string;
  didCreateBranch?: boolean;
};

function makeBranchName(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `driftlock/${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await runCommand("git rev-parse --abbrev-ref HEAD", cwd, { allowNonZeroExit: true });
  return result.ok ? result.stdout.trim() : null;
}

export async function ensureDriftlockBranch(cwd: string): Promise<GitContext> {
  const ctx: GitContext = {};
  const current = await getCurrentBranch(cwd);
  if (current) {
    ctx.originalBranch = current;
  } else {
    tui.logLeft("Git not available; skipping branch management.", "warn");
    return ctx;
  }

  const newBranch = makeBranchName();
  const checkout = await runCommand(`git checkout -b ${newBranch}`, cwd, { allowNonZeroExit: true });
  if (!checkout.ok) {
    tui.logLeft(`Failed to create branch ${newBranch}; continuing on ${current}.`, "warn");
    return ctx;
  }

  ctx.branch = newBranch;
  ctx.didCreateBranch = true;
  tui.logLeft(`Switched to driftlock branch: ${newBranch}`, "success");
  return ctx;
}

export async function restoreBranch(ctx: GitContext, cwd: string): Promise<void> {
  if (ctx.didCreateBranch && ctx.originalBranch) {
    await runCommand(`git checkout ${ctx.originalBranch}`, cwd, { allowNonZeroExit: true });
    tui.logLeft(`Restored branch: ${ctx.originalBranch}`, "success");
  }
}

export async function pushBranch(ctx: GitContext, cwd: string): Promise<boolean> {
  if (!ctx.branch) return false;
  const push = await runCommand(`git push -u origin ${ctx.branch}`, cwd, { allowNonZeroExit: true });
  if (!push.ok) {
    tui.logLeft(`Failed to push branch ${ctx.branch}: ${push.stderr || push.stdout}`, "warn");
    return false;
  }
  tui.logLeft(`Pushed branch ${ctx.branch} to origin.`, "success");
  return true;
}

export async function openPullRequest(ctx: GitContext, cwd: string): Promise<void> {
  if (!ctx.branch) return;
  const pr = await runCommand(`gh pr create --fill --head ${ctx.branch}`, cwd, {
    allowNonZeroExit: true,
  });
  if (pr.ok) {
    tui.logLeft(`Opened PR for branch ${ctx.branch}.`, "success");
    return;
  }
  tui.logLeft(
    `Could not open PR automatically. Run: git push -u origin ${ctx.branch} && gh pr create --fill --head ${ctx.branch}`,
    "warn"
  );
}
