import { KEY } from "./constants";
import { disableAltScreen, enableAltScreen, shouldUseTui } from "./screen";
import { computeLayout, visibleRows } from "./layout";
import { render, scheduleRender } from "./render";
import { state, requestExit, clearExitRequest } from "./state";
import { initBorders, paintBorder, startRainbowBorder } from "./border";
import type { Side } from "./types";

function handleKey(chunk: Buffer): void {
  if (handleMouse(chunk)) return;
  const key = chunk.toString();
  if (key === KEY.ctrlC) {
    requestExit("ctrl+c");
  } else if (key === KEY.ctrlQ) {
    // Hard exit on Ctrl+Q: immediately request exit and terminate the process.
    requestExit("ctrl+q");
    shutdown();
    process.exit(0);
  } else if (key === KEY.quit) {
    requestExit("q");
  }
}

export function shutdown(): void {
  if (!state.active) {
    state.enabled = false;
    return;
  }
  state.active = false;
  state.enabled = false;
  if (state.borderTimer) {
    clearInterval(state.borderTimer);
    state.borderTimer = undefined;
  }
  if (state.rightFlushTimer) {
    clearTimeout(state.rightFlushTimer);
    state.rightFlushTimer = undefined;
  }
  disableAltScreen();
  if (state.leftMirror.length > 0) {
    process.stdout.write(`${state.leftMirror.join("\n")}\n`);
  }
  process.stdout.removeAllListeners("resize");
  process.stdin.setRawMode?.(false);
  process.stdin.removeAllListeners("data");
  process.stdin.pause?.();
}

function handleMouse(chunk: Buffer): boolean {
  if (chunk.length < 6) return false;
  if (!(chunk[0] === 0x1b && chunk[1] === 0x5b && chunk[2] === 0x4d)) return false;
  const cb = chunk[3] - 32;
  const cx = chunk[4] - 32;
  computeLayout();
  const side: Side = cx <= state.leftWidth + 1 ? "left" : "right";
  if (cb === 64) {
    adjustOffset(side, 3);
    return true;
  }
  if (cb === 65) {
    adjustOffset(side, -3);
    return true;
  }
  return false;
}

function adjustOffset(side: Side, delta: number): void {
  const rows = visibleRows();
  if (side === "left") {
    const maxOffset = Math.max(0, state.left.length - rows);
    state.leftOffset = Math.min(maxOffset, Math.max(0, state.leftOffset + delta));
  } else {
    const maxOffset = Math.max(0, state.right.length - rows);
    state.rightOffset = Math.min(maxOffset, Math.max(0, state.rightOffset + delta));
  }
  scheduleRender();
}

export function initTui(): void {
  state.enabled = shouldUseTui();
  state.active = state.enabled;
  clearExitRequest();
  if (!state.enabled) return;
  computeLayout();
  state.startTime = Date.now();
  enableAltScreen();
  initBorders(state.cols, state.rows);
  paintBorder(state.hue);
  startRainbowBorder(scheduleRender);
  scheduleRender();
  process.stdout.on("resize", () => {
    computeLayout();
    initBorders(state.cols, state.rows);
    paintBorder(state.hue);
    scheduleRender();
  });
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", handleKey);
  }
}

export function resize(): void {
  computeLayout();
  scheduleRender();
}
