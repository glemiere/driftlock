import type { TuiState } from "./types";

export const state: TuiState = {
  left: [],
  right: [],
  rightQueue: [],
  leftMirror: [],
  cols: process.stdout.columns || 120,
  rows: process.stdout.rows || 40,
  leftWidth: 0,
  rightWidth: 0,
  scheduled: false,
  active: false,
  enabled: true,
  rendering: false,
  leftOffset: 0,
  rightOffset: 0,
  startTime: Date.now(),
  headerInfo: "",
  footerInfo: "",
  title: "TUI",
  border: [],
  borderSegments: [],
  hue: 0,
  lastBorderCols: 0,
  lastBorderRows: 0,
  borderLength: 0,
  rightFlushTimer: undefined,
  exitRequested: false,
};

export function setTitle(value: string): void {
  state.title = value || "TUI";
}

export function setHeaderInfo(value: string): void {
  state.headerInfo = value || "";
}

export function setFooterInfo(value: string): void {
  state.footerInfo = value || "";
}

export function requestExit(): void {
  state.exitRequested = true;
}

export function clearExitRequest(): void {
  state.exitRequested = false;
}

export function isExitRequested(): boolean {
  return Boolean(state.exitRequested);
}

export function toggleExitRequest(): void {
  state.exitRequested = !state.exitRequested;
}
