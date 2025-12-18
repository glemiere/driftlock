export class ThreadAttemptTracker {
  private attempts = 0;
  private readonly maxAttempts: number;

  constructor(maxAttempts: number) {
    if (!Number.isFinite(maxAttempts)) {
      throw new Error("maxAttempts must be a finite number");
    }
    // When maxAttempts <= 0, treat as unbounded.
    this.maxAttempts = maxAttempts <= 0 ? Number.POSITIVE_INFINITY : Math.floor(maxAttempts);
  }

  recordAttempt(): boolean {
    this.attempts += 1;
    return this.attempts <= this.maxAttempts;
  }

  getAttemptCount(): number {
    return this.attempts;
  }

  isExhausted(): boolean {
    return this.attempts >= this.maxAttempts;
  }
}
