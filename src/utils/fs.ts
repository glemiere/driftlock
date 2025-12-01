import { promises as fs } from "fs";
import path from "path";

export async function readTextFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  return fs.readFile(resolved, "utf8");
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  const resolved = path.resolve(filePath);
  const contents = await fs.readFile(resolved, "utf8");
  return JSON.parse(contents) as unknown;
}
