import { match, P } from "ts-pattern";

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
  return match(error)
    .when(
      (error): error is NodeJS.ErrnoException => error instanceof Error && "code" in error,
      () => true,
    )
    .otherwise(() => false);
}

const stringifyObject = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const stringifyUnknown = (value: unknown): string =>
  match(value)
    .with(P.string, (value) => value)
    .with(P.number, (value) => `${value}`)
    .with(P.boolean, (value) => `${value}`)
    .with(P.bigint, (value) => `${value}`)
    .when(
      (value): value is symbol => typeof value === "symbol",
      (value) => value.description ?? value.toString(),
    )
    .otherwise(stringifyObject);

/** Extracts a message string from an unknown error, falling back to a stringified unknown value. */
export function errorMessage(error: unknown): string {
  return match(error)
    .with(P.instanceOf(Error), ({ message }) => message)
    .with({ message: P.select(P.string) }, (message) => message)
    .with(
      { message: P.select(P.when((message) => message !== undefined && message !== null)) },
      stringifyUnknown,
    )
    .otherwise(stringifyUnknown);
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
  return match(error.message)
    .with(P.string.minLength(1), (message) => `Error: ${message}`)
    .otherwise(() => "Error: Unknown error occurred");
}

/** Formats an unknown error into a user-facing "Error: ..." string. */
export function formatUnknownError(error: unknown): string {
  return formatAppError(toUnexpectedError(error));
}
