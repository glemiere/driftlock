import { wrapLine } from "../src/cli/tui/text";
import { RESET, COLORS } from "../src/cli/tui/constants";

describe("wrapLine ANSI handling", () => {
  const green = COLORS.success; // "\u001b[32m"

  it("preserves color across wrapped lines and resets each line", () => {
    const text = `${green}0123456789${RESET}`;
    const wrapped = wrapLine(text, 5, /\x1b\[[0-9;]*m|./g);

    expect(wrapped.length).toBe(2);

    // Each line should start with the color and end with RESET so the pane renders fully colored.
    wrapped.forEach((line) => {
      expect(line.startsWith(green)).toBe(true);
      expect(line.endsWith(RESET)).toBe(true);
    });

    // Content should be contiguous across wraps without losing digits.
    expect(wrapped.join("").replace(/\x1b\[[0-9;]*m/g, "")).toBe("0123456789");
  });

  it("does not add RESET when no ANSI codes are present", () => {
    const wrapped = wrapLine("hello world", 5, /\x1b\[[0-9;]*m|./g);
    expect(wrapped).toEqual(["hello", " worl", "d"]);
  });
});
