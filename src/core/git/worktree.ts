import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { runCommand } from "../utils/run-commands";

export type WorktreeSnapshot = {
  files: Map<string, string | null>;
};

export async function captureWorktreeSnapshot(
  cwd: string
): Promise<WorktreeSnapshot | null> {
  const status = await runCommand("git status --porcelain=v1 -z", cwd);
  if (!status.ok) return null;

  const paths = parseStatusPaths(status.stdout);
  const unique = Array.from(new Set(paths));
  const files = new Map<string, string | null>();

  for (const file of unique) {
    const hash = await hashFile(cwd, file);
    files.set(file, hash);
  }

  return { files };
}

export function diffWorktreeSnapshots(
  before: WorktreeSnapshot,
  after: WorktreeSnapshot
): string[] {
  const changed = new Set<string>();

  for (const file of after.files.keys()) {
    if (!before.files.has(file)) {
      changed.add(file);
    }
  }

  for (const file of before.files.keys()) {
    if (!after.files.has(file)) {
      changed.add(file);
    }
  }

  for (const file of after.files.keys()) {
    if (!before.files.has(file)) continue;
    if (before.files.get(file) !== after.files.get(file)) {
      changed.add(file);
    }
  }

  return Array.from(changed).sort();
}

function parseStatusPaths(output: string): string[] {
  if (!output) return [];
  const entries = output.split("\0").filter(Boolean);
  const files: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 3) continue;
    const status = entry.slice(0, 2);
    const pathPart = entry.slice(3);
    if (!pathPart) continue;

    const isRenameOrCopy = status.includes("R") || status.includes("C");
    if (isRenameOrCopy) {
      const next = entries[i + 1];
      if (next) {
        files.push(pathPart);
        files.push(next);
        i += 1;
        continue;
      }
    }

    files.push(pathPart);
  }

  return files;
}

async function hashFile(cwd: string, file: string): Promise<string | null> {
  const fullPath = path.resolve(cwd, file);
  try {
    const content = await fs.readFile(fullPath);
    return createHash("sha1").update(content).digest("hex");
  } catch {
    return null;
  }
}
