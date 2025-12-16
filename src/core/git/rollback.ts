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
