import { BOX, COLORS, ESC, FOOTER_LABEL, LAYOUT, RESET } from "./constants";
import { initBorders, paintBorder } from "./border";
import { computeLayout, clampOffsets, paneView, visibleRows } from "./layout";
import { state } from "./state";
import { padLine, formatElapsed } from "./text";

function renderHeader(innerWidth: number): string {
  const info = state.headerInfo ? `   ${COLORS.header}${state.headerInfo}${RESET}` : "";
  const elapsed = `${COLORS.header}${FOOTER_LABEL.elapsed}: ${formatElapsed(state.startTime)}${RESET}`;
  return padLine(`${COLORS.title}${state.title}${RESET}${info}   ${elapsed}`, innerWidth, "");
}

function renderFooter(innerWidth: number): string {
  const shortcuts = "";
  const info = state.footerInfo ? `   ${COLORS.header}${state.footerInfo}${RESET}` : "";
  return padLine(`${shortcuts}${info ? `   ${info}` : ""}`, innerWidth, "");
}

function renderFrame(): string {
  const { cols, innerWidth } = computeLayout();
  clampOffsets();

  const rows = visibleRows();
  const leftLines = paneView(state.left, state.leftOffset);
  const rightLines = paneView(state.right, state.rightOffset);

  let out = `${ESC}H${ESC}?7l`;

  const writeRow = (row: number, text: string) => {
    const padded = padLine(text, innerWidth, "");
    out += `${ESC}${row};2H${padded}`;
  };

  writeRow(LAYOUT.headerRow, renderHeader(innerWidth));
  const splitLine = `${"═".repeat(state.leftWidth)}${BOX.ttee}${"═".repeat(
    innerWidth - state.leftWidth - 1
  )}`;
  writeRow(LAYOUT.splitRow, splitLine);

  let row = LAYOUT.contentStartRow;
  for (let i = 0; i < rows; i += 1) {
    const leftText = leftLines[i] ?? "";
    const rightText = rightLines[i] ?? "";
    const leftColor = /\x1b\[[0-9;]*m/.test(leftText) ? "" : COLORS.left;
    const rightColor = /\x1b\[[0-9;]*m/.test(rightText) ? "" : COLORS.right;
    const left = padLine(leftText, state.leftWidth, leftColor);
    const right = padLine(rightText, state.rightWidth, rightColor);
    writeRow(row, `${left}${BOX.v}${right}`);
    row += 1;
  }

  writeRow(row + 1, renderFooter(innerWidth));

  if (state.cols !== state.lastBorderCols || state.rows !== state.lastBorderRows) {
    initBorders(cols, state.rows);
  }

  return out;
}

export function render(): void {
  state.scheduled = false;
  if (!state.active) return;
  state.rendering = true;
  const frame = renderFrame();
  process.stdout.write(frame);
  paintBorder(state.hue);
  state.rendering = false;
}

export function scheduleRender(): void {
  if (state.scheduled || !state.active) return;
  state.scheduled = true;
  queueMicrotask(render);
}
