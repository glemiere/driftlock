import { writeSync } from "fs";
import { ESC } from "./constants";

export function ttyWrite(data: string): void {
  writeSync(1, data);
}

export function shouldUseTui(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.TUI_DISABLE === "1") return false;
  const term = (process.env.TERM || "").toLowerCase();
  if (!term || term === "dumb") return false;
  return true;
}

export function enableAltScreen(): void {
  ttyWrite(`${ESC}?1049h${ESC}?25l${ESC}?1000h${ESC}?7l`);
}

export function disableAltScreen(): void {
  ttyWrite(`${ESC}?7h${ESC}?1000l${ESC}?25h${ESC}?1049l`);
}
