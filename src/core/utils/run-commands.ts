import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
};

async function runSingleCommand(cmd: string, cwd: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number; signal?: string };
    const code = typeof execError.code === "number" ? execError.code : 1;
    return {
      ok: false,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      code,
    };
  }
}

export async function runCommand(cmd: string, cwd: string): Promise<CommandResult> {
  return runSingleCommand(cmd, cwd);
}
