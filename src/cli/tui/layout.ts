import { LAYOUT } from "./constants";
import { state } from "./state";

export type LayoutDims = {
  cols: number;
  rows: number;
  innerWidth: number;
  leftWidth: number;
  rightWidth: number;
};

export function computeLayout(): LayoutDims {
  const cols = process.stdout.columns || 120;
  const rows = Math.max(LAYOUT.minRows, process.stdout.rows || 40);
  const leftWidth = Math.max(LAYOUT.minLeftWidth, Math.floor(cols * 0.66));
  const innerWidth = cols - 2;
  const rightWidth = Math.max(LAYOUT.minRightWidth, innerWidth - leftWidth - 1);

  state.cols = cols;
  state.rows = rows;
  state.leftWidth = leftWidth;
  state.rightWidth = rightWidth;

  return { cols, rows, innerWidth, leftWidth, rightWidth };
}

export function visibleRows(): number {
  return state.rows - LAYOUT.headerFooterPaddingRows;
}

export function clampOffsets(): void {
  const rows = visibleRows();
  const leftMax = Math.max(0, state.left.length - rows);
  const rightMax = Math.max(0, state.right.length - rows);
  state.leftOffset = Math.min(leftMax, Math.max(0, state.leftOffset));
  state.rightOffset = Math.min(rightMax, Math.max(0, state.rightOffset));
}

export function paneView(lines: string[], offset: number): string[] {
  const rows = visibleRows();
  const start = Math.max(0, lines.length - rows - offset);
  const end = Math.min(lines.length, start + rows);
  return lines.slice(start, end);
}
