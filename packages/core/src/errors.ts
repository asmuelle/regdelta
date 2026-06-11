/** Raised when code attempts something a PRODUCT INVARIANT (AGENTS.md) forbids. */
export class InvariantViolationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InvariantViolationError';
    this.code = code;
  }
}
