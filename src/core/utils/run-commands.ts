import { spawn } from "child_process";

type Stream = "stdout" | "stderr";

export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
};

type RunCommandOptions = {
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

async function runSingleCommand(
  cmd: string,
  cwd: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(cmd, {
      cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    const handleStream = (stream: Stream, chunk: Buffer | string): void => {
      const text = chunk.toString();
      if (stream === "stdout") {
        stdout += text;
        options.onStdout?.(text);
      } else {
        stderr += text;
        options.onStderr?.(text);
      }
    };

    child.stdout?.on("data", (data) => handleStream("stdout", data));
    child.stderr?.on("data", (data) => handleStream("stderr", data));

    child.on("error", (err: { message?: string }) => {
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}${err?.message ?? ""}`,
        code: 1,
      });
    });

    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1;
      resolve({
        ok: exitCode === 0,
        stdout,
        stderr,
        code: exitCode,
      });
    });
  });
}

export async function runCommand(
  cmd: string,
  cwd: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return runSingleCommand(cmd, cwd, options);
}
