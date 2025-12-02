import { BOX, ESC, RESET } from "./constants";
import { state } from "./state";
import { ttyWrite } from "./screen";

type Coord = { row: number; col: number; char: string };

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function initBorders(width: number, height: number): void {
  state.lastBorderCols = width;
  state.lastBorderRows = height;
  const coords: Coord[] = [];
  const segments: Coord[][] = [];
  const addSegment = (segment: Coord[]) => {
    segments.push(segment);
    coords.push(...segment);
  };

  const top: Coord[] = [];
  for (let col = 1; col <= width; col += 1) {
    if (col === 1) top.push({ row: 1, col, char: BOX.tl });
    else if (col === width) top.push({ row: 1, col, char: BOX.tr });
    else top.push({ row: 1, col, char: BOX.h });
  }
  addSegment(top);

  const right: Coord[] = [];
  for (let row = 2; row < height; row += 1) {
    right.push({ row, col: width, char: BOX.v });
  }
  addSegment(right);

  const bottom: Coord[] = [];
  for (let col = width; col >= 1; col -= 1) {
    if (col === width) bottom.push({ row: height, col, char: BOX.br });
    else if (col === 1) bottom.push({ row: height, col, char: BOX.bl });
    else bottom.push({ row: height, col, char: BOX.h });
  }
  addSegment(bottom);

  const left: Coord[] = [];
  for (let row = height - 1; row >= 2; row -= 1) {
    left.push({ row, col: 1, char: BOX.v });
  }
  addSegment(left);

  state.border = coords;
  state.borderSegments = segments;
  state.borderLength = coords.length;
}

export function paintBorder(baseHue: number): void {
  paintBorderString(baseHue, true);
}

export function paintBorderString(baseHue: number, write = false): string {
  if (!state.enabled || state.borderSegments.length === 0) return "";
  const total = state.borderLength || 1;
  const step = 360 / total;
  let out = "";
  let offset = 0;
  state.borderSegments.forEach((segment) => {
    segment.forEach((coord, idx) => {
      const idxGlobal = offset + idx;
      const hue = (baseHue + idxGlobal * step) % 360;
      const [r, g, b] = hslToRgb(hue, 1, 0.5);
      const color = state.exitRequested ? `${ESC}38;2;255;255;255m` : `${ESC}38;2;${r};${g};${b}m`;
      out += `${ESC}${coord.row};${coord.col}H${color}${coord.char}${RESET}`;
    });
    offset += segment.length;
  });
  if (write) {
    ttyWrite(out);
  }
  return out;
}

export function startRainbowBorder(onTick: () => void): void {
  if (!state.enabled || state.borderTimer) return;
  const intervalMs = 60; // smoother animation
  const hueStep = 2; // smaller increments for smoothness

  state.borderTimer = setInterval(() => {
    if (!state.active) return;
    state.hue = (state.hue + hueStep) % 360;
    onTick();
  }, intervalMs);
}
