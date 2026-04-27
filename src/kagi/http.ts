import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { match, P } from "ts-pattern";

import { isErrnoException, toUnexpectedError, type AppError } from "../utils/errors.ts";

export interface RequestOptions {
  signal?: AbortSignal;
}

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

const AUTH_OR_CHALLENGE_PATHS = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/turnstile",
  "/challenge",
];

const AUTH_OR_CHALLENGE_BODY_MARKERS = [
  "cf-turnstile",
  "turnstile",
  "browser verification",
  "verify you are human",
  "sign in to kagi",
  "login to kagi",
  "kagi login",
];

const challengeMessage =
  "Kagi requires additional browser verification; refresh your session token or complete the challenge in a browser";

const challengeError = (): Result<void, AppError> =>
  err({ type: "KagiChallengeError" as const, message: challengeMessage });

/** Builds the standard HTTP headers for Kagi API requests, including session cookie. */
export function kagiHeaders(token: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Cookie: `kagi_session=${token}`,
  };
}

/** Returns an error result if the HTTP response indicates failure. */
export function checkResponseStatus(response: Response): Result<void, AppError> {
  return match(response)
    .with({ status: P.union(401, 403) }, () =>
      err({ type: "AuthError" as const, message: "Invalid or expired session token" }),
    )
    .with({ status: 429 }, () =>
      err({
        type: "RateLimitError" as const,
        message: "Kagi rate limit exceeded; try again later",
      }),
    )
    .when(
      ({ ok }) => !ok,
      ({ status, statusText }) =>
        err({
          type: "HttpError" as const,
          status,
          message: `HTTP ${status}: ${statusText}`,
        }),
    )
    .otherwise(() => ok(undefined));
}

/** Returns true when a response URL points at an auth, login, or browser verification page. */
export function isAuthOrChallengeUrl(url: string): boolean {
  return match(url)
    .with("", () => false)
    .otherwise((url) => {
      try {
        const pathname = new URL(url).pathname.toLowerCase();
        return AUTH_OR_CHALLENGE_PATHS.some((path) => pathname.includes(path));
      } catch {
        const lowerUrl = url.toLowerCase();
        return AUTH_OR_CHALLENGE_PATHS.some((path) => lowerUrl.includes(path));
      }
    });
}

/** Returns true when response text appears to be an auth, login, or browser verification page. */
export function isAuthOrChallengeBody(body: string): boolean {
  const lowerBody = body.toLowerCase();
  return AUTH_OR_CHALLENGE_BODY_MARKERS.some((marker) => lowerBody.includes(marker));
}

/** Returns true when response text appears to be an HTML document. */
export function isHtmlDocument(body: string): boolean {
  const trimmed = body.trimStart().toLowerCase();
  return match(trimmed)
    .when(
      (trimmed) =>
        trimmed.startsWith("<!doctype html") ||
        trimmed.startsWith("<html") ||
        /<html[\s>]/i.test(body),
      () => true,
    )
    .otherwise(() => false);
}

/** Returns a clear error when Kagi returned login/challenge content despite a successful status. */
export function checkNotAuthOrChallengeResponse(
  response: Response,
  body?: string,
): Result<void, AppError> {
  return match(response.url)
    .when(isAuthOrChallengeUrl, challengeError)
    .otherwise(() =>
      match(body)
        .with(P.string, (body) =>
          match(isAuthOrChallengeBody(body))
            .with(true, challengeError)
            .with(false, () => ok(undefined))
            .exhaustive(),
        )
        .otherwise(() => ok(undefined)),
    );
}

/** Type guard that checks if an error is a network connectivity error. */
export function isNetworkError(error: unknown): error is NodeJS.ErrnoException {
  return match(error)
    .when(
      (error): error is NodeJS.ErrnoException =>
        isErrnoException(error) &&
        ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(
          error.code ?? "",
        ),
      () => true,
    )
    .otherwise(() => false);
}

/** Maps fetch/network failures to typed application errors. */
export function mapFetchError(error: unknown): AppError {
  return match(error)
    .when(isNetworkError, (cause) => ({
      type: "NetworkError" as const,
      message: "Network error: Unable to connect to Kagi",
      cause,
    }))
    .otherwise(toUnexpectedError);
}

/** Safely calls fetch, mapping both synchronous throws and asynchronous rejections into typed errors. */
export function safeFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ResultAsync<Response, AppError> {
  try {
    return ResultAsync.fromPromise(fetch(input, init), mapFetchError);
  } catch (error) {
    return errAsync(mapFetchError(error));
  }
}
