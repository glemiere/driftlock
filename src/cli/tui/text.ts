import { RESET } from "./constants";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function wrapLine(text: string, width: number, tokenPattern: RegExp): string[] {
  const tokens = Array.from(text.matchAll(tokenPattern)).map((m) => m[0]);
  const lines: string[] = [];
  let current: string[] = [];
  let visible = 0;
  let activeAnsi = "";

  const ensureReset = (line: string): string => {
    return line.includes(RESET) ? line : `${line}${RESET}`;
  };

  const flushLine = () => {
    const line = current.join("");
    lines.push(activeAnsi ? ensureReset(line) : line);
    current = [];
    visible = 0;
    if (activeAnsi) {
      current.push(activeAnsi);
    }
  };

  for (const token of tokens) {
    const isEsc = token.startsWith("\x1b[");
    const inc = isEsc ? 0 : 1;
    if (visible + inc > width && current.length > 0) {
      flushLine();
    }
    current.push(token);
    if (isEsc) {
      if (token === RESET) {
        activeAnsi = "";
      } else if (/^\x1b\[[0-9;]*m$/.test(token)) {
        activeAnsi = token;
      }
    }
    visible += inc;
  }

  const finalLine = current.join("");
  lines.push(activeAnsi ? ensureReset(finalLine) : finalLine);
  return lines;
}

export function padLine(text: string, width: number, color: string): string {
  const len = visibleLength(text);
  const pad = Math.max(0, width - len);
  return `${color}${text}${" ".repeat(pad)}${RESET}`;
}

export function formatElapsed(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
