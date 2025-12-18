import { runCommand } from "../utils/run-commands";
import { tui } from "../../cli/tui";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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
  const result = await runCommand("git rev-parse --abbrev-ref HEAD", cwd);
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
  const checkout = await runCommand(`git checkout -b ${newBranch}`, cwd);
  if (!checkout.ok) {
    tui.logLeft(`Failed to create branch ${newBranch}; continuing on ${current}.`, "warn");
    return ctx;
  }

  ctx.branch = newBranch;
  ctx.didCreateBranch = true;
  tui.logLeft(`Switched to driftlock branch: ${newBranch}`, "success");
  return ctx;
}

export async function assertCleanWorkingTree(cwd: string): Promise<void> {
  const status = await runCommand("git status --porcelain", cwd);
  if (!status.ok) {
    const reason = status.stderr || status.stdout || `exit code ${status.code}`;
    throw new Error(`Could not check git status: ${reason}`);
  }

  const dirty = status.stdout.trim();
  if (!dirty) return;

  const preview = dirty.split(/\r?\n/).slice(0, 20).join("\n");
  throw new Error(
    `Working tree is not clean. Commit/stash your changes (and ignore generated files) before running Driftlock.\n\n${preview}`
  );
}

export async function restoreBranch(ctx: GitContext, cwd: string): Promise<void> {
  if (ctx.didCreateBranch && ctx.originalBranch) {
    await runCommand(`git checkout ${ctx.originalBranch}`, cwd);
    tui.logLeft(`Restored branch: ${ctx.originalBranch}`, "success");
  }
}

export async function pushBranch(ctx: GitContext, cwd: string): Promise<boolean> {
  if (!ctx.branch) return false;
  const push = await runCommand(`git push -u origin ${ctx.branch}`, cwd);
  if (!push.ok) {
    tui.logLeft(`Failed to push branch ${ctx.branch}: ${push.stderr || push.stdout}`, "warn");
    return false;
  }
  tui.logLeft(`Pushed branch ${ctx.branch} to origin.`, "success");
  return true;
}

export async function commitPlanChanges(message: string, cwd: string): Promise<boolean> {
  const addResult = await runCommand("git add -A", cwd);
  if (!addResult.ok) {
    return false;
  }

  const safeMessage = message.replace(/"/g, '\\"');
  const commitResult = await runCommand(`git commit -m "${safeMessage}"`, cwd);
  return commitResult.ok;
}

type OpenPullRequestOptions = {
  title?: string;
  body?: string;
  baseBranch?: string;
};

export async function openPullRequest(
  ctx: GitContext,
  cwd: string,
  options: OpenPullRequestOptions = {}
): Promise<void> {
  if (!ctx.branch) return;

  const base = options.baseBranch ?? ctx.originalBranch;
  const existingUrl = await tryGetExistingPullRequestUrl(ctx.branch, base, cwd);
  if (existingUrl) {
    tui.logLeft(`PR already exists for branch ${ctx.branch}: ${existingUrl}`, "success");
    return;
  }

  const hasCustomTitleAndBody =
    typeof options.title === "string" &&
    options.title.trim().length > 0 &&
    typeof options.body === "string" &&
    options.body.trim().length > 0;

  if (hasCustomTitleAndBody && process.platform !== "win32") {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftlock-pr-"));
    const bodyPath = path.join(tmpDir, "body.md");
    try {
      try {
        await fs.writeFile(bodyPath, options.body as string, "utf8");

        const cmd = [
          "gh pr create",
          `--head ${quotePosix(ctx.branch)}`,
          base ? `--base ${quotePosix(base)}` : "",
          `--title ${quotePosix(options.title as string)}`,
          `--body-file ${quotePosix(bodyPath)}`,
        ]
          .filter(Boolean)
          .join(" ");

        const pr = await runCommand(cmd, cwd);
        if (pr.ok) {
          const url = pr.stdout.trim();
          tui.logLeft(
            `Opened PR for branch ${ctx.branch}${url ? `: ${url}` : "."}`,
            "success"
          );
          return;
        }

        tui.logLeft(
          `Could not open PR automatically with custom title/body (exit ${pr.code}): ${
            pr.stderr || pr.stdout || "unknown error"
          }`,
          "warn"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        tui.logLeft(
          `Could not build/open PR with custom title/body (${message}); falling back to --fill.`,
          "warn"
        );
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  const cmd = [
    "gh pr create --fill",
    `--head ${ctx.branch}`,
    base ? `--base ${base}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pr = await runCommand(cmd, cwd);
  if (pr.ok) {
    const url = pr.stdout.trim();
    tui.logLeft(`Opened PR for branch ${ctx.branch}${url ? `: ${url}` : "."}`, "success");
    return;
  }

  const fallbackExistingUrl = await tryGetExistingPullRequestUrl(ctx.branch, base, cwd);
  if (fallbackExistingUrl) {
    tui.logLeft(`PR already exists for branch ${ctx.branch}: ${fallbackExistingUrl}`, "success");
    return;
  }

  tui.logLeft(
    `Could not open PR automatically (exit ${pr.code}). stderr: ${pr.stderr || "<empty>"}`,
    "warn"
  );
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function tryGetExistingPullRequestUrl(
  branch: string,
  baseBranch: string | undefined,
  cwd: string
): Promise<string | null> {
  const cmd = [
    "gh pr list",
    `--head ${quoteShell(branch)}`,
    baseBranch ? `--base ${quoteShell(baseBranch)}` : "",
    "--state open",
    "--json url",
    `--jq ${quoteShell(".[0].url // empty")}`,
  ].join(" ");

  const view = await runCommand(cmd, cwd);
  if (!view.ok) return null;
  const url = view.stdout.trim();
  if (!url || url === "null") return null;
  return url;
}

function quoteShell(value: string): string {
  if (process.platform === "win32") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return quotePosix(value);
}
