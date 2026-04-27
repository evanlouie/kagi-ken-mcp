export type AppError =
  | { type: "AuthError"; message: string; cause?: unknown }
  | { type: "TokenFileError"; message: string; cause?: unknown }
  | { type: "ValidationError"; message: string; cause?: unknown }
  | { type: "HttpError"; message: string; status?: number; cause?: unknown }
  | { type: "RateLimitError"; message: string; cause?: unknown }
  | { type: "NetworkError"; message: string; cause?: unknown }
  | { type: "TimeoutError"; message: string; cause?: unknown }
  | { type: "ParseError"; message: string; cause?: unknown }
  | { type: "KagiChallengeError"; message: string; cause?: unknown }
  | { type: "UnexpectedError"; message: string; cause?: unknown };

/** Type guard that checks if an error is an ErrnoException-style error (has a `code` property). */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Extracts a message string from an unknown error, falling back to `String()` for non-Error values. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : String(message);
  }
  return String(error);
}

/** Converts an unknown error into a typed unexpected error. */
export function toUnexpectedError(error: unknown): AppError {
  return {
    type: "UnexpectedError",
    message: errorMessage(error) || "Unknown error occurred",
    cause: error,
  };
}

/** Formats a typed application error into a user-facing "Error: ..." string. */
export function formatAppError(error: AppError): string {
  return `Error: ${error.message || "Unknown error occurred"}`;
}

/** Formats an unknown error into a user-facing "Error: ..." string. */
export function formatUnknownError(error: unknown): string {
  return formatAppError(toUnexpectedError(error));
}
