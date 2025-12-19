import path from "node:path";
import { constants as fsConstants, promises as fs } from "node:fs";

type InitOptions = {
  force?: boolean;
};

function getDefaultConfigPath(): string {
  return path.resolve(__dirname, "..", "..", "..", "config.default.json");
}

export async function runInitCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const sourcePath = getDefaultConfigPath();
  const targetPath = path.resolve(cwd, "driftlock.config.json");
  const copyMode = options.force ? 0 : fsConstants.COPYFILE_EXCL;

  try {
    await fs.copyFile(sourcePath, targetPath, copyMode);
    console.log(`Created ${targetPath}`);
  } catch (error) {
    process.exitCode = 1;
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "EEXIST") {
      console.error(
        `driftlock.config.json already exists at ${targetPath}. Use --force to overwrite.`
      );
      return;
    }

    if (nodeError.code === "ENOENT") {
      console.error(
        `Could not find default config at ${sourcePath}. Is Driftlock installed correctly?`
      );
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to create driftlock.config.json: ${message}`);
  }
}

