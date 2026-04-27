import { isErrnoException } from "../utils/formatting.ts";

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

/** Builds the standard HTTP headers for Kagi API requests, including session cookie. */
export function kagiHeaders(token: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Cookie: `kagi_session=${token}`,
  };
}

/** Throws an error if the HTTP response indicates failure. */
export function checkResponseStatus(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new Error("Invalid or expired session token");
  }

  if (response.status === 429) {
    throw new Error("Kagi rate limit exceeded; try again later");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

/** Backward-compatible alias for status-only checks. */
export const checkResponse = checkResponseStatus;

/** Returns true when a response URL points at an auth, login, or browser verification page. */
export function isAuthOrChallengeUrl(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return AUTH_OR_CHALLENGE_PATHS.some((path) => pathname.includes(path));
  } catch {
    const lowerUrl = url.toLowerCase();
    return AUTH_OR_CHALLENGE_PATHS.some((path) => lowerUrl.includes(path));
  }
}

/** Returns true when response text appears to be an auth, login, or browser verification page. */
export function isAuthOrChallengeBody(body: string): boolean {
  const lowerBody = body.toLowerCase();
  return AUTH_OR_CHALLENGE_BODY_MARKERS.some((marker) => lowerBody.includes(marker));
}

/** Returns true when response text appears to be an HTML document. */
export function isHtmlDocument(body: string): boolean {
  const trimmed = body.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || /<html[\s>]/i.test(body)
  );
}

/** Throws a clear error when Kagi returned login/challenge content despite a successful status. */
export function assertNotAuthOrChallengeResponse(response: Response, body?: string): void {
  if (isAuthOrChallengeUrl(response.url)) {
    throw new Error(
      "Kagi requires additional browser verification; refresh your session token or complete the challenge in a browser",
    );
  }

  if (body !== undefined && isAuthOrChallengeBody(body)) {
    throw new Error(
      "Kagi requires additional browser verification; refresh your session token or complete the challenge in a browser",
    );
  }
}

/** Type guard that checks if an error is a network connectivity error. */
export function isNetworkError(error: unknown): error is NodeJS.ErrnoException {
  return (
    isErrnoException(error) &&
    ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code ?? "")
  );
}

/** Re-throws network errors with a user-friendly message; all other errors pass through unchanged. */
export function rethrowAsNetworkError(error: unknown): never {
  if (isNetworkError(error)) {
    throw new Error("Network error: Unable to connect to Kagi", { cause: error });
  }
  throw error;
}
