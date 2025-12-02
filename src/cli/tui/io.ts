import { COLORS, MAX_BUFFER, RESET, tokenPattern } from "./constants";
import { computeLayout, visibleRows, clampOffsets } from "./layout";
import { scheduleRender } from "./render";
import { state } from "./state";
import { wrapLine } from "./text";

function trimBuffer(side: "left" | "right"): void {
  const buf = side === "left" ? state.left : state.right;
  if (buf.length > MAX_BUFFER) {
    const remove = buf.length - MAX_BUFFER;
    buf.splice(0, remove);
    if (side === "left") {
      state.leftOffset = Math.max(0, state.leftOffset - remove);
    } else {
      state.rightOffset = Math.max(0, state.rightOffset - remove);
    }
  }
  clampOffsets();
}

function trimMirror(): void {
  if (state.leftMirror.length > MAX_BUFFER) {
    const remove = state.leftMirror.length - MAX_BUFFER;
    state.leftMirror.splice(0, remove);
  }
}

function scheduleRightFlush(): void {
  if (!state.enabled || state.rightFlushTimer) return;
  state.rightFlushTimer = setTimeout(() => {
    state.rightFlushTimer = undefined;
    if (!state.active) return;
    state.rightQueue.length = 0;
    scheduleRender();
  }, 60);
}

function push(side: "left" | "right", message: string, colorKey?: keyof typeof COLORS): void {
  const effectiveColor = colorKey ?? (side === "right" ? "right" : undefined);
  const colorPrefix = effectiveColor && COLORS[effectiveColor] ? COLORS[effectiveColor] : "";
  const coloredMessage = colorPrefix ? `${colorPrefix}${message}${RESET}` : message;

  const mirrorToStdout = () => {
    if (side !== "left") return;
    // When the TUI is enabled we keep a mirror buffer and flush on shutdown.
    // Writing to stdout while the TUI is active can cause flicker.
    if (state.enabled) {
      state.leftMirror.push(...coloredMessage.split(/\r?\n/));
      trimMirror();
      return;
    }
    const lines = coloredMessage.split(/\r?\n/);
    state.leftMirror.push(...lines);
    trimMirror();
    lines.forEach((line) => console.log(line));
  };

  if (!state.enabled) {
    mirrorToStdout();
    return;
  }

  mirrorToStdout();
  computeLayout();
  const target = side === "left" ? state.left : state.right;
  const queue = side === "right" ? state.rightQueue : null;
  const width = side === "left" ? state.leftWidth : state.rightWidth;
  const lines = message.split(/\r?\n/);

  for (const line of lines) {
    if (!line) {
      target.push("");
      queue?.push("");
      continue;
    }
    const wrapped = wrapLine(line, width, tokenPattern);
    const coloredLines =
      colorKey && COLORS[colorKey]
        ? wrapped.map((wrappedLine) => `${COLORS[colorKey]}${wrappedLine}${RESET}`)
        : wrapped;
    target.push(...coloredLines);
    queue?.push(...coloredLines);
  }

  trimBuffer(side);
  if (side === "right") {
    scheduleRightFlush();
  } else {
    scheduleRender();
  }
}

export function logLeft(message: string, colorKey?: keyof typeof COLORS): void {
  push("left", message, colorKey);
}

export function logRight(message: string, colorKey?: keyof typeof COLORS): void {
  push("right", message, colorKey);
}

export function updateLeft(message: string): void {
  if (!state.enabled) return;
  computeLayout();
  if (state.left.length === 0) {
    push("left", message);
    return;
  }
  const width = state.leftWidth;
  const wrapped = wrapLine(message, width, tokenPattern);
  state.left.splice(state.left.length - 1, 1, ...wrapped);
  scheduleRender();
}
