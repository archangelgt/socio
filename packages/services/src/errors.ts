export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function walkCauses(error: unknown): unknown[] {
  const seen: unknown[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i++) {
    seen.push(current);
    if (
      typeof current !== "object" ||
      current === null ||
      !("cause" in current)
    ) {
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return seen;
}

function looksLikeAppError(error: unknown): error is AppError {
  return (
    error instanceof AppError ||
    (error instanceof Error &&
      error.name === "AppError" &&
      "statusCode" in error &&
      "code" in error)
  );
}

export function getAppError(error: unknown): AppError | null {
  for (const item of walkCauses(error)) {
    if (looksLikeAppError(item)) {
      return item;
    }
  }
  return null;
}

export function isAppError(error: unknown): error is AppError {
  return getAppError(error) !== null;
}

export function isUniqueViolation(error: unknown): boolean {
  return walkCauses(error).some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "code" in item &&
      (item as { code?: string }).code === "23505",
  );
}
