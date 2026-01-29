import { initTui, resize, shutdown } from "./lifecycle";
import { logLeft, logRight, updateLeft, enableLeftLogFile, disableLeftLogFile } from "./io";
import { render as tuiRender } from "./render";
import { initBorders, startRainbowBorder } from "./border";
import {
  setFooterInfo,
  setHeaderInfo,
  setTitle,
  isExitRequested,
  requestExit,
  getExitReason,
} from "./state";

export const tui = {
  init: initTui,
  logLeft,
  logRight,
  updateLeft,
  enableDebugLogFile: enableLeftLogFile,
  disableDebugLogFile: disableLeftLogFile,
  setHeaderInfo,
  setFooterInfo,
  setTitle,
  isExitRequested,
  requestExit,
  getExitReason,
  resize,
  render: tuiRender,
  shutdown,
  initBorders,
  startRainbowBorder,
};

process.on("exit", shutdown);
process.on("SIGINT", () => requestExit("SIGINT"));
process.on("SIGTERM", () => requestExit("SIGTERM"));
