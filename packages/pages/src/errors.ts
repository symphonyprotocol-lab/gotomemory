export class PageNotFoundError extends Error {
  constructor(id: string) {
    super(`page not found: ${id}`);
    this.name = "PageNotFoundError";
  }
}

export class PageVersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`page version conflict: expected ${expected}, actual ${actual}`);
    this.name = "PageVersionConflictError";
  }
}

export class PageValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PageValidationError";
  }
}

export class PageAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageAccessError";
  }
}
