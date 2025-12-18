import { describe, expect, it } from "@jest/globals";
import { ThreadAttemptTracker } from "../src/core/orchestrator";

describe("ThreadAttemptTracker", () => {
  it("allows attempts up to the max and then rejects", () => {
    const tracker = new ThreadAttemptTracker(2);
    expect(tracker.recordAttempt()).toBe(true); // 1st
    expect(tracker.recordAttempt()).toBe(true); // 2nd
    expect(tracker.recordAttempt()).toBe(false); // 3rd exceeds max
    expect(tracker.isExhausted()).toBe(true);
    expect(tracker.getAttemptCount()).toBe(3);
  });

  it("treats non-positive maxAttempts as unbounded", () => {
    const trackerZero = new ThreadAttemptTracker(0);
    expect(trackerZero.recordAttempt()).toBe(true);
    expect(trackerZero.recordAttempt()).toBe(true);
    expect(trackerZero.isExhausted()).toBe(false);

    const trackerNegative = new ThreadAttemptTracker(-1);
    expect(trackerNegative.recordAttempt()).toBe(true);
    expect(trackerNegative.recordAttempt()).toBe(true);
    expect(trackerNegative.isExhausted()).toBe(false);
  });

  it("caps at one attempt when maxAttempts is 1", () => {
    const tracker = new ThreadAttemptTracker(1);
    expect(tracker.recordAttempt()).toBe(true); // 1st allowed
    expect(tracker.recordAttempt()).toBe(false); // 2nd not allowed
    expect(tracker.isExhausted()).toBe(true);
  });
});
