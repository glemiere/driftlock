import path from "path";
import { promises as fs } from "fs";
import type { ExecutePlanStepResult } from "./execute-plan-step";

export function collectFiles(result: ExecutePlanStepResult): Set<string> {
  const filesForSnapshot = new Set<string>();
  (result.filesWritten || []).forEach((f) => f && filesForSnapshot.add(f));
  (result.filesTouched || []).forEach((f) => f && filesForSnapshot.add(f));
  return filesForSnapshot;
}

export async function readSnapshots(files: string[], cwd: string): Promise<Record<string, string>> {
  const snapshots: Record<string, string> = {};
  const unique = Array.from(new Set(files.filter(Boolean)));
  for (const file of unique) {
    try {
      const content = await fs.readFile(path.resolve(cwd, file), "utf8");
      snapshots[file] = content;
    } catch {
      // ignore missing files
    }
  }
  return snapshots;
}

export function filesChanged(
  before: Record<string, string>,
  after: Record<string, string>,
  files: string[]
): boolean {
  for (const file of files) {
    if (!file) continue;
    const beforeContent = before[file];
    const afterContent = after[file];
    if (beforeContent === undefined && afterContent !== undefined) {
      return true; // newly created
    }
    if (beforeContent !== afterContent) {
      return true;
    }
  }
  return false;
}
