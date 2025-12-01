import { initTui, resize, shutdown } from "./lifecycle";
import { logLeft, logRight, updateLeft } from "./io";
import { render as tuiRender } from "./render";
import { initBorders, startRainbowBorder } from "./border";
import { setFooterInfo, setHeaderInfo, setTitle } from "./state";

export const tui = {
  init: initTui,
  logLeft,
  logRight,
  updateLeft,
  setHeaderInfo,
  setFooterInfo,
  setTitle,
  resize,
  render: tuiRender,
  shutdown,
  initBorders,
  startRainbowBorder,
};

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(1);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(1);
});
