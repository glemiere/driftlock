export const ESC = "\u001b[";
export const RESET = `${ESC}0m`;
export const BOLD = `${ESC}1m`;

export const COLORS = {
  title: `${ESC}96m`,
  accent: `${ESC}1;97m`,
  header: `${ESC}96m`,
  left: `${ESC}37m`,
  right: `${ESC}90m`,
  error: `${ESC}31m`,
  success: `${ESC}32m`,
  warn: `${ESC}33m`,
};

export const BOX = {
  tl: "╔",
  tr: "╗",
  bl: "╚",
  br: "╝",
  h: "═",
  v: "║",
  ltee: "╠",
  rtee: "╣",
  ttee: "╦",
  btee: "╩",
};

export const tokenPattern = /\x1b\[[0-9;]*m|./g;
export const MAX_BUFFER = 4000;

export const KEY = {
  quit: "q",
  ctrlC: "\u0003",
  ctrlQ: "\u0011",
};

export const LAYOUT = {
  headerRow: 2,
  splitRow: 3,
  contentStartRow: 4,
  minRows: 12,
  minLeftWidth: 24,
  minRightWidth: 20,
  headerFooterPaddingRows: 4, // rows reserved for header, split, footer
};

export const FOOTER_LABEL = {
  status: "status",
  elapsed: "elapsed",
};
