import { runCommand } from "../utils/run-commands";

export type AppliedPatch = {
  patch: string;
  description?: string;
};

export async function rollbackPatches(
  patches: AppliedPatch[],
  cwd: string
): Promise<void> {
  const reversed = [...patches].reverse();
  for (const entry of reversed) {
    const result = await runCommand("git apply -R", cwd, { input: entry.patch });
    if (!result.ok) {
      const reason = result.stderr || result.stdout || `exit code ${result.code}`;
      throw new Error(
        `Failed to rollback patch${entry.description ? ` (${entry.description})` : ""}: ${reason}`
      );
    }
  }
}

export async function rollbackWorkingTree(cwd: string): Promise<void> {
  const reset = await runCommand("git reset --hard", cwd);
  if (!reset.ok) {
    const reason = reset.stderr || reset.stdout || `exit code ${reset.code}`;
    throw new Error(`Failed to reset working tree: ${reason}`);
  }

  const clean = await runCommand("git clean -fd", cwd);
  if (!clean.ok) {
    const reason = clean.stderr || clean.stdout || `exit code ${clean.code}`;
    throw new Error(`Failed to clean working tree: ${reason}`);
  }
}
