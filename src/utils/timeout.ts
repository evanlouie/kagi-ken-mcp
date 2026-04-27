import { err, ok, ResultAsync, type Result } from "neverthrow";

import { toUnexpectedError, type AppError } from "./errors.ts";

/** Runs an abortable ResultAsync operation with a bounded timeout. */
export function withTimeout<T, E extends AppError>(
  operation: (signal: AbortSignal) => ResultAsync<T, E>,
  timeoutMs: number,
  message: string,
): ResultAsync<T, E | AppError> {
  const resultPromise = new Promise<Result<T, E | AppError>>((resolve) => {
    const controller = new AbortController();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort(new Error(message));
      resolve(err({ type: "TimeoutError", message }));
    }, timeoutMs);

    let operationResult: ResultAsync<T, E>;
    try {
      operationResult = operation(controller.signal);
    } catch (cause) {
      settled = true;
      clearTimeout(timeoutId);
      resolve(err(toUnexpectedError(cause)));
      return;
    }

    operationResult.then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(err(toUnexpectedError(cause)));
      },
    );
  });

  return new ResultAsync(resultPromise);
}

/** Convenience helper for wrapping a plain promise-returning abortable operation. */
export function withPromiseTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): ResultAsync<T, AppError> {
  return withTimeout(
    (signal) =>
      ResultAsync.fromPromise(operation(signal), (cause) => ({
        type: "UnexpectedError",
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      })),
    timeoutMs,
    message,
  ).andThen((value) => ok(value));
}
