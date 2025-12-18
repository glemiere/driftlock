import spinners from "./spinner.json";

type SpinnerName = keyof typeof spinners;

export type SpinnerOptions = {
  text?: string;
  stream?: NodeJS.WriteStream;
  onFrame?: (line: string) => void;
  onFirstFrame?: (line: string) => void;
};

export type SpinnerHandle = {
  stop: (message?: string) => void;
  success: (message?: string) => void;
  failure: (message?: string) => void;
};

/**
 * Starts a spinner immediately.
 * @param name Spinner key from spinner.json (defaults to "dots").
 * @param options Optional text and output stream (defaults to stderr).
 */
export function spinner(name: SpinnerName = "dots", options: SpinnerOptions = {}): SpinnerHandle {
  const def = spinners[name];
  if (!def) {
    const available = Object.keys(spinners).join(", ") || "none";
    throw new Error(`Unknown spinner "${String(name)}". Available: ${available}`);
  }

  const stream = options.stream ?? process.stderr;
  const text = options.text || "";

  if ((!stream || !stream.isTTY) && !options.onFrame) {
    return {
      stop() {},
      success() {},
      failure() {},
    };
  }

  let frame = 0;
  let initialized = false;
  const render = () => {
    const glyph = def.frames[frame];
    frame = (frame + 1) % def.frames.length;
    const line = text ? `${glyph} ${text}` : glyph;
    if (!initialized && options.onFirstFrame) {
      initialized = true;
      options.onFirstFrame(line);
    }
    if (options.onFrame) options.onFrame(line);
    if (stream && stream.isTTY) {
      stream.write(`\r${line}`);
    }
  };

  const timer = setInterval(render, def.interval);
  render();

  const clearLine = () => {
    if (typeof stream.clearLine === "function") {
      stream.clearLine(0);
    } else {
      stream.write("\r");
    }
    if (typeof stream.cursorTo === "function") {
      stream.cursorTo(0);
    }
  };

  const stop = (message: string = "") => {
    clearInterval(timer);
    clearLine();
    if (message) {
      stream?.write(`${message}\n`);
    }
  };

  return {
    stop,
    success: stop,
    failure: stop,
  };
}
